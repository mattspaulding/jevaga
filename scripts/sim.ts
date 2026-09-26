// Plays the whole loop headless in real time: real Jev plays, real Nemotron coaches, same road.
// Run: pnpm sim -- <seed> <runs>   (e.g. pnpm sim -- 13 6). Prints each run and the fatal decision.
// Don't run this while someone is playing: it shares Jev's rate limit.
import { driveWithJev, startRun } from "../lib/game/loop";
import { newWorld, resetRun } from "../lib/game/world";
import { system1 } from "../lib/system1";
import { cacheStats } from "../lib/system1/cache";
import { writeLesson } from "../lib/system2/nemotron";

const seed = Number(process.argv[2] ?? 13);
const runs = Number(process.argv[3] ?? 6);

async function main() {
  const base = newWorld(seed);
  const playbook = ["Jump forward."];
  const distances: number[] = [];
  for (let n = 1; n <= runs; n++) {
    const run = startRun(resetRun(base));
    let pauses = 0;
    const times: number[] = [];
    const [end, decisions] = await Promise.all([
      run.done,
      driveWithJev(run, (input) => system1().decide(input), {
        playbook: [...playbook],
        onDecision: (d) => times.push(d.ms ?? 0),
        onPause: () => pauses++,
      }),
    ]);
    if (!end) break;
    distances.push(end.distance);
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const last = decisions[decisions.length - 1];
    console.log(`\nRun ${n}: ${end.cause} at row ${end.distance} after ${run.world.t.toFixed(1)} s, ${times.length} decisions, avg answer ${avg} ms, ${pauses} outage pauses`);
    if (last) console.log(`  last: chose ${last.move} (${last.confidence.toFixed(2)}): ${last.moveText}   safe: ${last.safe?.join(", ")}`);
    try {
      const lesson = await writeLesson({ playbook, beats: decisions, cause: end.cause });
      playbook.push(lesson.rule);
      console.log(`  coach: ${lesson.whatHappened}\n  + rule ${playbook.length}: ${lesson.rule}`);
    } catch (e) {
      console.log(`  coach failed: ${(e as Error).message}`);
    }
  }
  console.log(`\nseed ${seed}: ${distances.join(" → ")}`);
  console.log(`Jev calls: ${cacheStats.misses}, answered from memory: ${cacheStats.hits}`);
  process.exit(0);
}
main();
