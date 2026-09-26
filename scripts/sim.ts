// Jev flies Jevaga headless in real time, with a fixed plan or with Nemotron planning live.
// Run: pnpm sim -- <seed> <runs> [live]   (e.g. pnpm sim -- 5 3 live). Don't run it while someone is playing.
import { drivePlanner, driveWithJev, startRun } from "../lib/game/loop";
import { MOVES, newWorld, resetRun, type Move } from "../lib/game/world";
import { system1 } from "../lib/system1";
import { STARTING_PLAN } from "../lib/system1/types";
import { writePlan } from "../lib/system2/planner";

// pnpm passes the "--" through; skip it.
const args = process.argv.slice(2).filter((a) => a !== "--");
const seed = Number(args[0] ?? 5);
const runs = Number(args[1] ?? 3);
const live = args[2] === "live";

// The browser gives up on an answer after REQUEST_TIMEOUT_MS and pauses the
// fight; the sim does the same instead of flying blind while it waits.
const withTimeout = <T>(p: Promise<T>, signal: AbortSignal) =>
  Promise.race([p, new Promise<T>((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout"))))]);

async function main() {
  const base = newWorld(seed);
  for (let n = 1; n <= runs; n++) {
    const run = startRun(resetRun(base));
    const counts = Object.fromEntries(MOVES.map((m) => [m, 0])) as Record<Move, number>;
    const times: number[] = [];
    let pauses = 0;
    let plan = STARTING_PLAN;
    let plans = 0;
    const recent: Move[] = [];
    const [end] = await Promise.all([
      run.done,
      driveWithJev(run, (input, signal) => withTimeout(system1().decide(input), signal), {
        plan: () => plan,
        onDecision: (d) => {
          counts[d.move]++;
          times.push(d.ms ?? 0);
          recent.push(d.move);
          if (recent.length > 8) recent.shift();
        },
        onPause: () => pauses++,
      }),
      live
        ? drivePlanner(run, async (input) => ({ plan: await writePlan(input) }), {
            plan: () => plan,
            recentMoves: () => [...recent],
            onPlan: (p) => {
              plan = p;
              plans++;
            },
            onStale: () => {},
          })
        : Promise.resolve(),
    ]);
    if (!end) break;
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length));
    console.log(
      `Run ${n}: score ${end.score} in ${end.seconds.toFixed(1)} s (wave ${run.world.wave}, ${run.world.kills} kills) · moves ${MOVES.map((m) => `${m} ${counts[m]}`).join(", ")} · avg answer ${avg} ms · ${pauses} outage pauses${live ? ` · ${plans} plans` : ""}`,
    );
  }
  process.exit(0);
}
main();
