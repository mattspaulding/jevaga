// Jev flies Jevaga headless in real time with a fixed rulebook (none by default).
// Run: pnpm sim -- <seed> <runs> [rules.txt]   (one rule per line). Don't run it while someone is playing.
import { readFileSync } from "node:fs";
import { driveWithJev, startRun } from "../lib/game/loop";
import { MOVES, newWorld, resetRun, type Move } from "../lib/game/world";
import { system1 } from "../lib/system1";

// pnpm passes the "--" through; skip it.
const args = process.argv.slice(2).filter((a) => a !== "--");
const seed = Number(args[0] ?? 5);
const runs = Number(args[1] ?? 3);
const rules = args[2]
  ? readFileSync(args[2], "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  : [];

// The browser gives up on an answer after REQUEST_TIMEOUT_MS and pauses the
// fight; the sim does the same instead of flying blind while it waits.
const withTimeout = <T>(p: Promise<T>, signal: AbortSignal) =>
  Promise.race([p, new Promise<T>((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout"))))]);

async function main() {
  console.log(`seed ${seed}, ${rules.length} rules`);
  const base = newWorld(seed);
  for (let n = 1; n <= runs; n++) {
    const run = startRun(resetRun(base));
    const counts = Object.fromEntries(MOVES.map((m) => [m, 0])) as Record<Move, number>;
    const times: number[] = [];
    let pauses = 0;
    const [end] = await Promise.all([
      run.done,
      driveWithJev(run, (input, signal) => withTimeout(system1().decide(input), signal), {
        rules: () => rules,
        onDecision: (d) => {
          counts[d.move]++;
          times.push(d.ms ?? 0);
        },
        onPause: () => pauses++,
      }),
    ]);
    if (!end) break;
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length));
    const hit = run.world.hitBy;
    console.log(
      `Run ${n}: score ${end.score} in ${end.seconds.toFixed(1)} s (wave ${run.world.wave}, ${run.world.kills} kills, hit by a ${hit?.by ?? "?"}) · moves ${MOVES.map((m) => `${m} ${counts[m]}`).join(", ")} · avg answer ${avg} ms · ${pauses} outage pauses`,
    );
  }
  process.exit(0);
}
main();
