// Checks the game rules the lesson test and the game both depend on.
// Run: pnpm world-check
import { describeMoves } from "../lib/describe";
import {
  advance,
  beatSwept,
  busyWindow,
  carSpans,
  COLS,
  colsPerSecond,
  ensureRows,
  hop,
  Lane,
  newWorld,
  occupied,
  resetRun,
  runIsCrossable,
  STALL_SECONDS,
  targetOf,
} from "../lib/game/world";

let failures = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}
const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) < eps;

// Cars glide and wrap.
const right: Lane = { kind: "road", dir: 1, speed: 1, cars: [{ head: 8, len: 2 }] };
check("length-2 car with head 8 moving right starts at x = 7", near(carSpans(right, 0)[0].x, 7));
check(`after 0.6 s it has moved one column and wrapped to x = 8`, near(carSpans(right, 0.6)[0].x, 8));
check(`tier-1 speed is ${colsPerSecond(1).toFixed(2)} columns per second`, near(colsPerSecond(1), 1 / 0.6, 0.001));
check("a car overlapping the wrap covers column 0 and column 8", occupied(right, 0, 0.9) && occupied(right, 8, 0.9));

// Occupancy and timing windows.
const left: Lane = { kind: "road", dir: -1, speed: 1, cars: [{ head: 6, len: 1 }] };
check("car at column 6 occupies 6 now", occupied(left, 6, 0));
check("column 4 is clear now", !occupied(left, 4, 0));
const w4 = busyWindow(left, 4, 0);
check(`column 4 gets a car in about 0.7 s, when it reaches the frog hitbox (got ${w4?.from.toFixed(2)})`, !!w4 && w4.from > 0.6 && w4.from < 0.8);
check("column 4 is free again about 1.2 s later", !!w4 && w4.until - w4.from > 0.8 && w4.until - w4.from < 1.6);

// Hops are instant; landing on a car is a hit; the clock hits whoever stands still.
{
  const w = newWorld(5);
  w.rows[1] = left;
  w.frog = { row: 0, col: 6 };
  check("hopping onto a car is a hit", hop(w, "forward") === "hit");
}
{
  const w = newWorld(5);
  w.rows[1] = left;
  w.frog = { row: 0, col: 4 };
  check("hopping into a clear square is safe", hop(w, "forward") === null);
  check("standing there until the car arrives is a hit", advance(w, 2) === "hit" && w.t < 1.5);
}

// Edges.
check("left at column 0 stays put", targetOf({ row: 3, col: 0 }, "left").col === 0);
check(`right at column ${COLS - 1} stays put`, targetOf({ row: 3, col: COLS - 1 }, "right").col === COLS - 1);
check("back at row 0 stays put", targetOf({ row: 0, col: 4 }, "back").row === 0);

// Stall: no forward progress for 9 seconds ends the run.
{
  const w = newWorld(7);
  const e = advance(w, 20);
  check(`standing on grass stalls after ${STALL_SECONDS} s`, e === "stalled" && near(w.t, STALL_SECONDS, 0.05));
}

// Determinism: same seed, same road; a new run keeps the road and resets the clock.
{
  const a = newWorld(123);
  const b = newWorld(123);
  check("same seed gives the same road", JSON.stringify(a.rows) === JSON.stringify(b.rows));
  a.t = 5;
  const r = resetRun(a);
  check("a new run keeps the road and resets the clock", r.rows === a.rows && r.frog.row === 0 && r.t === 0);
}

// Describe gives facts, never verdicts, and "car now" matches occupancy.
{
  const w = newWorld(5);
  w.rows[1] = left;
  w.frog = { row: 0, col: 6 };
  const m = describeMoves(w);
  check('forward onto a car is described as "car now"', /Car now/.test(m.forward));
  check("move descriptions never say safe/unsafe", !Object.values(m).some((s) => /\b(safe|unsafe|danger|best)\b/i.test(s)));
}

// Generation: 200 seeds, 80 rows each.
{
  let lanes = 0;
  let overBudget = 0;
  let overlaps = 0;
  let longRuns = 0;
  let uncrossable = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const w = newWorld(seed);
    ensureRows(w, 80);
    let run: Lane[] = [];
    for (const lane of w.rows.slice(0, 80)) {
      if (lane.kind === "road") {
        lanes++;
        if (lane.cars.reduce((s, c) => s + c.len + lane.speed, 0) > 5) overBudget++;
        const cells = [...beatSwept({ ...lane, speed: 1, cars: lane.cars }, 0)].length;
        const expected = lane.cars.reduce((s, c) => s + c.len + 1, 0);
        if (cells > expected) overlaps++;
        run.push(lane);
      } else if (run.length) {
        if (run.length > 3) longRuns++;
        if (!runIsCrossable(run)) uncrossable++;
        run = [];
      }
    }
  }
  check(`every road lane keeps sum(len+speed) <= 5 (${lanes} lanes)`, overBudget === 0);
  check("no cars overlap at the start", overlaps === 0);
  check("no road run is longer than 3 lanes", longRuns === 0);
  check("every road run on 200 seeds can be crossed", uncrossable === 0);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
