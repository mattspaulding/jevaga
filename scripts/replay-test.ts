// Does the learning loop's foundation hold, on real Jev?
// 1. Record live deaths of a dumb Jev (no rules).
// 2. Replay each one on its recorded timing with Jev's own answers: does it die at exactly the same moment?
//    Then ask Jev again with the same (empty) rulebook: same answers, same death?
// 3. For the deaths that do, replay with one hand-written rule: does the ship now survive?
// 4. With that rule, does Jev still fire in calm moments?
// Run: pnpm replay-test -- [seed] [deaths]   (real Jev calls, a few cents). Don't run it while someone is playing.
import { driveWithJev, startRun } from "../lib/game/loop";
import { createRecorder, type Control, type Death } from "../lib/learn/recorder";
import { paced, replay, type Decide } from "../lib/learn/replay";
import { newWorld, resetRun } from "../lib/game/world";
import { system1 } from "../lib/system1";

const args = process.argv.slice(2).filter((a) => a !== "--");
const seed = Number(args[0] ?? 5);
const wanted = Number(args[1] ?? 5);
const RULE = "Never pick a move whose description shows a bullet or diver arriving within 0.6 s.";

const withTimeout = <T>(p: Promise<T>, signal: AbortSignal) =>
  Promise.race([p, new Promise<T>((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout"))))]);

const decide = paced((input) => system1().decide(input));

// Jev's answers from the live run, in order: re-simulating with them must retrace the death exactly.
// The last question before a hit usually never got its answer (the hit came first). The replay
// holds that answer until after the hit, so it can't matter: answering "left" there proves it.
const ownAnswers = (d: Death): Decide => {
  let i = 0;
  return async () => {
    const a = d.asked[i++];
    if (!a) return { move: "left", probabilities: { left: 1, right: 0, stay: 0, fire: 0 }, confidence: 1, source: "jev" };
    return { move: a.pick, probabilities: a.probabilities, confidence: a.confidence, source: "jev" };
  };
};

function showDeath(d: Death) {
  console.log(`\nRun ${d.run}: hit by a ${d.hitBy.by} at x ${d.hitBy.x.toFixed(1)}, ${d.tHit.toFixed(1)} s in. The last questions:`);
  for (const a of d.asked.slice(-3)) {
    console.log(`  ${(d.tHit - a.t).toFixed(2)} s before the hit, Jev picked ${a.pick} (${a.probabilities[a.pick].toFixed(2)})`);
    console.log(`    stay: ${a.moves.stay}`);
    console.log(`    left: ${a.moves.left}`);
    console.log(`    right: ${a.moves.right}`);
  }
}

async function main() {
  const base = newWorld(seed);
  const deaths: Death[] = [];
  const controls: Control[] = [];
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
    if (!end) continue;
    const death = rec.toDeath(n, run.world);
    if (death) deaths.push(death);
    for (const c of rec.controls()) if (controls.length < 5) controls.push(c);
    console.log(`Run ${n}: dumb Jev scored ${end.score} and died after ${end.seconds.toFixed(1)} s (${run.world.hitBy?.by})`);
  }

  console.log(`\nReplaying ${deaths.length} deaths on their recorded timing:`);
  let retraced = 0;
  let reproduced = 0;
  let flipped = 0;
  let shown = false;
  for (const d of deaths) {
    const own = await replay(d, d.rules, ownAnswers(d));
    const exact = own.outcome === "hit" && Math.abs(own.final.t - d.tHit) < 1e-6;
    if (exact) retraced++;
    const again = await replay(d, [], decide);
    let line = `  run ${d.run}: Jev's own answers → ${exact ? "same death, same step" : `${own.outcome} at ${own.final.t.toFixed(2)} s (died at ${d.tHit.toFixed(2)} s)`}; asked again without a rule → ${again.outcome}${again.stillThreatened ? " (still threatened)" : ""}`;
    if (again.outcome === "hit") {
      reproduced++;
      const withRule = await replay(d, [RULE], decide);
      if (withRule.outcome === "survived") flipped++;
      line += `; with the rule → ${withRule.outcome} (${withRule.moves.map((m) => m.move).join(" ")})`;
      if (!shown) {
        showDeath(d);
        shown = true;
      }
    } else if (again.outcome === "survived") line += " (timing: the death didn't happen again)";
    else line += ` (${again.error})`;
    console.log(line);
  }

  let firedWith = 0;
  let firedWithout = 0;
  for (const c of controls) {
    if ((await decide({ ...c, rules: [RULE] })).move === "fire") firedWith++;
    if ((await decide({ ...c, rules: [] })).move === "fire") firedWithout++;
  }

  console.log(`\nWith Jev's own answers, ${retraced} of ${deaths.length} deaths retraced to the exact step.`);
  console.log(`Asked again with the same rules, ${reproduced} of ${deaths.length} died again.`);
  console.log(`The rule "${RULE}" turned ${flipped} of ${reproduced} reproduced deaths into survivals.`);
  console.log(`In ${controls.length} calm moments Jev fired ${firedWithout} times with no rules and ${firedWith} times with the rule.`);
  process.exit(flipped > 0 && retraced === deaths.length ? 0 : 1);
}
main();
