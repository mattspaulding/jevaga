// Jev learns Jevaga headless, the same loop as the page: fly a run, and after
// each death let the judge reproduce it, ask Nemotron for a rule, test it on
// replays, and keep it or throw it out.
// Run: pnpm learn -- <seed> <runs> [rules-out.txt]   (real Jev and Nemotron calls, a few cents). Don't run it while someone is playing.
import { writeFileSync } from "node:fs";
import { driveWithJev, startRun } from "../lib/game/loop";
import { emptyBook, afterDeath, type Book, type JudgeStep } from "../lib/learn/judge";
import { createRecorder } from "../lib/learn/recorder";
import { paced, replay } from "../lib/learn/replay";
import { newWorld, resetRun } from "../lib/game/world";
import { system1 } from "../lib/system1";
import { writeRule } from "../lib/system2/coach";

const args = process.argv.slice(2).filter((a) => a !== "--");
const seed = Number(args[0] ?? 5);
const runs = Number(args[1] ?? 12);
const out = args[2];

const withTimeout = <T>(p: Promise<T>, signal: AbortSignal) =>
  Promise.race([p, new Promise<T>((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout"))))]);
const decide = paced((input) => system1().decide(input));

const stepText = (s: JudgeStep) =>
  s.kind === "reproduce" ? "reproducing" : s.kind === "coach" ? `coach (try ${s.attempt})` : s.kind === "test" ? `testing "${s.coaching.rule}"` : s.kind === "earlier" ? `earlier death ${s.i}/${s.of}` : "calm moments";

async function main() {
  const base = newWorld(seed);
  let book: Book = emptyBook();
  const rows: string[] = [];
  for (let n = 1; n <= runs; n++) {
    const rec = createRecorder();
    const run = startRun(resetRun(base));
    const rules = [...book.rules];
    const [end] = await Promise.all([
      run.done,
      driveWithJev(run, (input, signal) => withTimeout(system1().decide(input), signal), {
        rules: () => rules,
        onAsk: rec.onAsk,
        onAskFailed: rec.onAskFailed,
        onDecision: rec.onDecision,
      }),
    ]);
    if (!end) break;
    for (const c of rec.controls()) if (book.controls.length < 5) book.controls.push(c);
    const row = `run ${n}: ${rules.length} rules · score ${end.score} · ${run.world.kills} kills · ${end.seconds.toFixed(1)} s · hit by a ${run.world.hitBy?.by}`;
    console.log(row);
    const death = rec.toDeath(n, run.world);
    if (!death) continue;
    const t0 = Date.now();
    const v = await afterDeath(death, book, { decide, coach: writeRule, onStep: (s) => process.stdout.write(`    · ${stepText(s)}\n`) });
    book = v.book;
    const last = v.attempts.at(-1);
    console.log(`  → ${v.kind}${last?.coaching ? `: ${last.coaching.happened}` : ""}`);
    for (const a of v.attempts) {
      if (a.error) console.log(`    try: coach failed (${a.error})`);
      else if (a.coaching) console.log(`    try: ${a.coaching.change.kind}${a.coaching.change.kind === "replace" ? ` ${a.coaching.change.n}` : ""} "${a.coaching.rule ?? ""}" → ${a.passed ? "kept" : a.why ?? "none"}`);
    }
    console.log(`    (${((Date.now() - t0) / 1000).toFixed(0)} s between runs)`);
    rows.push(`${row} → ${v.kind}`);
  }

  console.log("\nRulebook:");
  book.rules.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  const fixed = book.deaths.filter((d) => d.status === "fixed");
  let holding = 0;
  for (const d of fixed) if ((await replay(d, book.rules, decide)).outcome === "survived") holding++;
  let fired = 0;
  for (const c of book.controls) if ((await decide({ ...c, rules: book.rules })).move === "fire") fired++;
  console.log(`\n${book.rules.length} rules kept. ${holding} of ${fixed.length} fixed deaths still survive with the final rulebook. Jev fired in ${fired} of ${book.controls.length} calm moments.`);
  console.log(`Deaths: ${["fixed", "luck", "unsolved"].map((k) => `${book.deaths.filter((d) => d.status === k).length} ${k}`).join(", ")}.`);
  console.log("\n" + rows.join("\n"));
  if (out) writeFileSync(out, book.rules.join("\n") + "\n");
  process.exit(0);
}
main();
