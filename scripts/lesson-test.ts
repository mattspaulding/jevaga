// Build step 1: does a written lesson change Jev's move?
// Uses the game's own world, describe and model code against real Jev and Nemotron.
// Run: pnpm lesson-test   (reads keys from .env.local)
import { describeMoves, describeState } from "../lib/describe";
import { isHit, Lane, newWorld, World } from "../lib/game/world";
import { jev } from "../lib/system1/jev";
import type { Decision } from "../lib/system1/types";
import { writeLesson } from "../lib/system2/nemotron";

const LESSON = "If a car in lane +1 reaches your column this beat, wait.";
const REPEATS = 3;

// Frog on grass at column 4. Lane +1 is the only thing that matters.
function scenario(lane1: Lane): World {
  const w = newWorld(1);
  w.rows[0] = { kind: "grass" };
  w.rows[1] = lane1;
  w.rows[2] = { kind: "road", dir: 1, speed: 1, cars: [{ head: 0, len: 1 }] }; // far from column 4
  w.rows[3] = { kind: "grass" };
  w.frog = { row: 0, col: 4 };
  w.beat = 0;
  return w;
}
// Speed-2 car at column 5 moving left sweeps 5, 4, 3 this beat: forward is fatal.
const FATAL = scenario({ kind: "road", dir: -1, speed: 2, cars: [{ head: 5, len: 1 }] });
// Speed-1 car at column 6 moving left reaches column 4 next beat: forward is safe.
const CONTROL = scenario({ kind: "road", dir: -1, speed: 1, cars: [{ head: 6, len: 1 }] });

let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};

check("game rules agree: forward is fatal in the fatal case", isHit(FATAL.rows[1], 4, 0));
check("game rules agree: forward is safe in the control case", !isHit(CONTROL.rows[1], 4, 0));

// Jev through the gateway has short outages; retry a few times before failing.
async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

type Placement = "none" | "instructions" | "wait-desc";
async function ask(world: World, placement: Placement, rule = LESSON): Promise<Decision[]> {
  const moves = describeMoves(world);
  const playbook = ["Jump forward."];
  if (placement === "instructions") playbook.push(rule);
  if (placement === "wait-desc") moves.wait += ` Playbook rule: ${rule}`;
  const out: Decision[] = [];
  for (let i = 0; i < REPEATS; i++) out.push(await withRetry(() => jev.decide({ state: describeState(world), moves, playbook })));
  return out;
}
const fmt = (ds: Decision[]) => {
  const d = ds[0];
  const picks = ds.map((x) => x.move).join("/");
  return `${picks.padEnd(24)} fwd ${d.probabilities.forward.toFixed(2)}  wait ${d.probabilities.wait.toFixed(2)}  conf ${d.confidence.toFixed(2)}`;
};
const majority = (ds: Decision[], move: string) => ds.filter((d) => d.move === move).length * 2 > ds.length;

async function main() {
  console.log("\nState Jev reads in the fatal case:\n" + describeState(FATAL));
  console.log("Forward description: " + describeMoves(FATAL).forward + "\n");

  const results: Record<Placement, { fatal: Decision[]; control: Decision[] }> = {} as never;
  for (const p of ["none", "instructions", "wait-desc"] as Placement[]) {
    results[p] = { fatal: await ask(FATAL, p), control: await ask(CONTROL, p) };
    console.log(`${p.padEnd(13)} FATAL   ${fmt(results[p].fatal)}`);
    console.log(`${"".padEnd(13)} control ${fmt(results[p].control)}`);
  }
  console.log();
  check('"Jump forward." only: forward wins the fatal case (run 1 dies)', majority(results.none.fatal, "forward"));
  check('"Jump forward." only: forward wins the control case', majority(results.none.control, "forward"));
  check("lesson in instructions: wait wins the fatal case", majority(results.instructions.fatal, "wait"));
  check("lesson in instructions: forward still wins the control case", majority(results.instructions.control, "forward"));

  // Nemotron writes a lesson from the real fatal death.
  const t = Date.now();
  const lesson = await writeLesson({
    playbook: ["Jump forward."],
    beats: [
      { state: describeState(FATAL), move: "forward", moveText: describeMoves(FATAL).forward, confidence: results.none.fatal[0].confidence },
    ],
    cause: "hit",
  });
  console.log(`\nNemotron (${Date.now() - t} ms):\n  What happened: ${lesson.whatHappened}\n  Rule: ${lesson.rule}\n`);
  check("Nemotron returned both lines", Boolean(lesson.whatHappened && lesson.rule));
  check('Nemotron\'s rule uses the game\'s words ("lane +1")', /lane \+1/i.test(lesson.rule));

  // The real loop: Nemotron's own rule, handed to Jev.
  const own = { fatal: await ask(FATAL, "instructions", lesson.rule), control: await ask(CONTROL, "instructions", lesson.rule) };
  console.log(`Nemotron's rule FATAL   ${fmt(own.fatal)}`);
  console.log(`${"".padEnd(15)} control ${fmt(own.control)}`);
  console.log(
    majority(own.fatal, "wait") && majority(own.control, "forward")
      ? "INFO  Nemotron's own rule flips the fatal case and leaves the control alone"
      : "INFO  Nemotron's own rule did not cleanly flip the fatal case (tune the prompt in slice 3)",
  );

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("ERROR", e.message);
  process.exit(1);
});
