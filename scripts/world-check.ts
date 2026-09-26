// Checks the game rules the lesson test and the game both depend on.
// Run: pnpm world-check
import { describeMoves } from "../lib/describe";
import {
  COLS,
  carCells,
  ensureRows,
  isHit,
  Lane,
  newWorld,
  resetRun,
  runIsCrossable,
  STALL_BEATS,
  step,
  sweptCells,
  targetOf,
} from "../lib/game/world";

let failures = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}
const same = (a: Iterable<number>, b: number[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// Cars wrap around the 9 columns; `head` is the front cell.
const wrapLane: Lane = { kind: "road", dir: 1, speed: 1, cars: [{ head: 8, len: 2 }] };
check("length-2 car at column 8 moving right covers 8 and 7", same(carCells(wrapLane, 0)[0].cells, [8, 7]));
check("one beat later it covers 0 and 8 (wrapped)", same(carCells(wrapLane, 1)[0].cells, [0, 8]));

// Swept cells include every cell the body passes through.
const fast: Lane = { kind: "road", dir: -1, speed: 2, cars: [{ head: 2, len: 1 }] };
check("speed-2 car at column 2 moving left sweeps 2, 1, 0", same(sweptCells(fast, 0), [2, 1, 0]));
check("frog moving into column 1 is hit (car passes through)", isHit(fast, 1, 0));
check("frog moving into column 3 is safe (car is moving away)", !isHit(fast, 3, 0));
const slow: Lane = { kind: "road", dir: 1, speed: 1, cars: [{ head: 3, len: 1 }] };
check("frog can't hop onto a car (column 3)", isHit(slow, 3, 0));
check("frog is hit where the car arrives (column 4)", isHit(slow, 4, 0));
check("column 2, just behind the car, is safe", !isHit(slow, 2, 0));

// Edges.
check("left at column 0 is a wait", targetOf({ row: 3, col: 0 }, "left").col === 0);
check(`right at column ${COLS - 1} is a wait`, targetOf({ row: 3, col: COLS - 1 }, "right").col === COLS - 1);
check("back at row 0 is a wait", targetOf({ row: 0, col: 4 }, "back").row === 0);

// Stall: waiting on grass ends the run after 15 beats.
{
  const w = newWorld(7);
  let event = null;
  let n = 0;
  while (!event && n < 40) {
    event = step(w, "wait").event;
    n++;
  }
  check(`waiting on grass stalls after ${STALL_BEATS} beats`, event === "stalled" && n === STALL_BEATS);
}

// Determinism: same seed, same road; resetRun keeps the road.
{
  const a = newWorld(123);
  const b = newWorld(123);
  check("same seed gives the same road", JSON.stringify(a.rows) === JSON.stringify(b.rows));
  const r = resetRun(a);
  check("a new run keeps the same road", r.rows === a.rows && r.frog.row === 0 && r.beat === 0);
}

// Describe never states a verdict, and "this beat" matches the collision rule.
{
  const w = newWorld(5);
  w.rows[1] = fast;
  w.frog = { row: 0, col: 1 };
  const m = describeMoves(w);
  check('forward into a sweep is described as "this beat"', /reaches column 1 this beat/.test(m.forward));
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
        const cells = lane.cars.flatMap((c, i) => carCells(lane, 0)[i].cells);
        if (new Set(cells).size !== cells.length) overlaps++;
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
