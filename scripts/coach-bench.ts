// How good are the coach's rules? Collect real deaths of a dumb Jev (or load
// them), then for each coach variant: write a rule for every death, replay the
// death with it (does it save the death it was written for?), and replay every
// other death with it (does it generalise?). The hand-written survival rule is
// the reference. Run: pnpm coach-bench -- <deaths.json> [seed] [deaths]
// (real Jev and Nemotron calls, a few cents). Don't run it while someone is playing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { driveWithJev, startRun } from "../lib/game/loop";
import { createRecorder, type Death } from "../lib/learn/recorder";
import { paced, replay } from "../lib/learn/replay";
import { newWorld, resetRun } from "../lib/game/world";
import { system1 } from "../lib/system1";
import { writeRule, type Coaching } from "../lib/system2/coach";

const args = process.argv.slice(2).filter((a) => a !== "--");
const file = args[0] ?? "deaths.json";
const seed = Number(args[1] ?? 5);
const wanted = Number(args[2] ?? 8);
const REFERENCE = "Never pick a move whose description shows a bullet or diver arriving within 0.6 s.";

const withTimeout = <T>(p: Promise<T>, signal: AbortSignal) =>
  Promise.race([p, new Promise<T>((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout"))))]);
const decide = paced((input) => system1().decide(input));

async function collect(): Promise<Death[]> {
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const base = newWorld(seed);
  const deaths: Death[] = [];
  for (let n = 1; deaths.length < wanted && n <= wanted * 2; n++) {
    const rec = createRecorder();
    const run = startRun(resetRun(base));
    const [end] = await Promise.all([
      run.done,
      driveWithJev(run, (input, signal) => withTimeout(system1().decide(input), signal), {
        rules: () => [],
        onAsk: rec.onAsk,
        onAskFailed: rec.onAskFailed,
        onDecision: rec.onDecision,
      }),
    ]);
    const d = end && rec.toDeath(n, run.world);
    if (!d) continue;
    // Keep only deaths that happen again when Jev is asked again (the judge would call the rest luck).
    if ((await replay(d, [], decide)).outcome !== "hit") continue;
    deaths.push(d);
    console.log(`death ${deaths.length}: run ${n}, ${end.seconds.toFixed(1)} s, hit by a ${d.hitBy.by}`);
  }
  writeFileSync(file, JSON.stringify(deaths));
  return deaths;
}

async function score(rule: string, deaths: Death[], own: number | null) {
  let saved = 0;
  let ownSaved = false;
  for (const [i, d] of deaths.entries()) {
    const r = await replay(d, [rule], decide);
    if (r.outcome === "survived") {
      if (i === own) ownSaved = true;
      else saved++;
    }
  }
  return { ownSaved, saved };
}

async function main() {
  const deaths = await collect();
  console.log(`${deaths.length} deaths from ${file}\n`);

  const ref = await score(REFERENCE, deaths, null);
  console.log(`reference rule saves ${ref.saved} of ${deaths.length} deaths: "${REFERENCE}"\n`);

  for (const thinking of ["off", "on"]) {
    process.env.COACH_THINKING = thinking;
    let ownPass = 0;
    let general = 0;
    let rules = 0;
    let ms = 0;
    console.log(`coach, thinking ${thinking}:`);
    for (const [i, d] of deaths.entries()) {
      const t0 = Date.now();
      let c: Coaching;
      try {
        c = await writeRule({ asked: d.asked, tHit: d.tHit, hitBy: d.hitBy, rules: [] });
      } catch (e) {
        console.log(`  death ${i + 1}: coach failed (${e instanceof Error ? e.message : e})`);
        continue;
      }
      ms += Date.now() - t0;
      if (!c.rule) {
        console.log(`  death ${i + 1}: no rule (${c.happened})`);
        continue;
      }
      rules++;
      const s = await score(c.rule, deaths, i);
      if (s.ownSaved) ownPass++;
      general += s.saved;
      console.log(`  death ${i + 1}: ${s.ownSaved ? "saves it" : "doesn't save it"}, saves ${s.saved} of ${deaths.length - 1} others · "${c.rule}"`);
    }
    console.log(
      `  → ${rules} rules; ${ownPass} saved the death they were written for; on average each saved ${(general / Math.max(1, rules)).toFixed(1)} of the other ${deaths.length - 1}; ${(ms / Math.max(1, rules) / 1000).toFixed(1)} s per rule\n`,
    );
  }
  process.exit(0);
}
main();
