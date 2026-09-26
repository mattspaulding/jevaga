// Jev flies Jevaga headless in real time, with a fixed plan (the live planner comes in slice 6).
// Run: pnpm sim -- <seed> <runs>   (e.g. pnpm sim -- 5 3). Don't run it while someone is playing.
import { driveWithJev, startRun } from "../lib/game/loop";
import { MOVES, newWorld, resetRun, type Move } from "../lib/game/world";
import { system1 } from "../lib/system1";
import { STARTING_PLAN } from "../lib/system1/types";

const seed = Number(process.argv[2] ?? 5);
const runs = Number(process.argv[3] ?? 3);

async function main() {
  const base = newWorld(seed);
  for (let n = 1; n <= runs; n++) {
    const run = startRun(resetRun(base));
    const counts = Object.fromEntries(MOVES.map((m) => [m, 0])) as Record<Move, number>;
    const times: number[] = [];
    let pauses = 0;
    const [end] = await Promise.all([
      run.done,
      driveWithJev(run, (input) => system1().decide(input), {
        plan: () => STARTING_PLAN,
        onDecision: (d) => {
          counts[d.move]++;
          times.push(d.ms ?? 0);
        },
        onPause: () => pauses++,
      }),
    ]);
    if (!end) break;
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length));
    console.log(
      `Run ${n}: score ${end.score} in ${end.seconds.toFixed(1)} s (wave ${run.world.wave}, ${run.world.kills} kills) · moves ${MOVES.map((m) => `${m} ${counts[m]}`).join(", ")} · avg answer ${avg} ms · ${pauses} outage pauses`,
    );
  }
  process.exit(0);
}
main();
