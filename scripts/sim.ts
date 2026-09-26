// Plays the whole loop headless: real Jev plays, real Nemotron coaches, same road.
// Run: pnpm sim -- <seed> <runs>   (e.g. pnpm sim -- 13 8). Prints each run and the death beat.
import { playRun } from "../lib/game/loop";
import { newWorld, resetRun } from "../lib/game/world";
import { jev } from "../lib/system1/jev";
import { writeLesson } from "../lib/system2/nemotron";

const seed = Number(process.argv[2] ?? 13);
const runs = Number(process.argv[3] ?? 6);

async function retry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

async function main() {
  const base = newWorld(seed);
  const playbook = ["Jump forward."];
  const distances: number[] = [];
  for (let n = 1; n <= runs; n++) {
    const w = resetRun(base);
    const { end, beats } = await playRun(w, playbook, {
      getMove: (input) => retry(() => jev.decide(input)),
      onBeat: () => {},
      stopped: () => false,
      minBeatMs: 0,
    });
    if (!end) break;
    distances.push(end.distance);
    const last = beats[beats.length - 1];
    console.log(`\nRun ${n}: ${end.cause} at row ${end.distance} after ${w.beat} beats`);
    console.log(`  last state: ${last.state.replace(/\n/g, " | ")}`);
    console.log(`  chose ${last.move} (${last.confidence.toFixed(2)}): ${last.moveText}   safe: ${last.safe?.join(", ")}`);
    try {
      const lesson = await retry(() => writeLesson({ playbook, beats, cause: end.cause }), 2);
      playbook.push(lesson.rule);
      console.log(`  coach: ${lesson.whatHappened}\n  + rule ${playbook.length}: ${lesson.rule}`);
    } catch (e) {
      console.log(`  coach failed: ${(e as Error).message}`);
    }
  }
  console.log(`\nseed ${seed}: ${distances.join(" → ")}`);
}
main();
