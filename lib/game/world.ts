import { makeRng } from "./rng";

export const COLS = 9;
export const START_COL = 4;
export const STALL_BEATS = 15;
// What's on screen: 12 rows, with the frog 3 rows from the bottom.
export const VIEW_ROWS = 12;
export const ROWS_BELOW_FROG = 3;
export function visibleRows(frogRow: number): { bottom: number; top: number } {
  const bottom = Math.max(0, frogRow - ROWS_BELOW_FROG);
  return { bottom, top: bottom + VIEW_ROWS - 1 };
}
const MAX_ROAD_RUN = 3;
const LANE_BUDGET = 5; // sum of (length + speed) over a lane's cars

export type Move = "forward" | "left" | "right" | "back" | "wait";
export const MOVES: Move[] = ["forward", "left", "right", "back", "wait"];

// `head` is the car's front cell at beat 0, in its direction of travel.
// The body extends behind the head. Cars wrap around the 9 columns.
export type Car = { head: number; len: 1 | 2 };
export type Lane =
  | { kind: "grass" }
  | { kind: "road"; dir: -1 | 1; speed: 1 | 2; cars: Car[] };

export type World = {
  seed: number;
  rows: Lane[];
  gen: { next: () => number; built: number };
  frog: { row: number; col: number };
  beat: number;
  furthest: number;
  sinceProgress: number;
  alive: boolean;
};

export type StepResult = { event: null | "hit" | "stalled" };

export const mod = (n: number, m: number) => ((n % m) + m) % m;

// Cells a car covers when its head is at `head`.
function body(head: number, len: number, dir: number): number[] {
  const cells: number[] = [];
  for (let i = 0; i < len; i++) cells.push(mod(head - dir * i, COLS));
  return cells;
}

// Every cell any car in this lane covers or passes through during `beat`:
// its cells at the start of the beat plus every cell its body crosses while
// advancing `speed` columns. A car can't skip over the frog.
export function sweptCells(lane: Lane, beat: number): Set<number> {
  const out = new Set<number>();
  if (lane.kind !== "road") return out;
  for (const car of lane.cars) {
    const start = car.head + lane.dir * lane.speed * beat;
    for (let k = 0; k <= lane.speed; k++) {
      for (const c of body(start + lane.dir * k, car.len, lane.dir)) out.add(c);
    }
  }
  return out;
}

// Cells covered at the start of `beat` (for drawing).
export function carCells(lane: Lane, beat: number): { car: number; cells: number[] }[] {
  if (lane.kind !== "road") return [];
  return lane.cars.map((car, i) => ({
    car: i,
    cells: body(car.head + lane.dir * lane.speed * beat, car.len, lane.dir),
  }));
}

// Would standing in `col` of this lane during `beat` get the frog hit?
export function isHit(lane: Lane, col: number, beat: number): boolean {
  return sweptCells(lane, beat).has(col);
}

// Beats until a car covers `col`, counting this beat as 1. Returns null if no
// car reaches it within `horizon` beats.
export function beatsUntilHit(lane: Lane, col: number, beat: number, horizon = 9): number | null {
  if (lane.kind !== "road") return null;
  for (let n = 1; n <= horizon; n++) if (isHit(lane, col, beat + n - 1)) return n;
  return null;
}

export function targetOf(frog: { row: number; col: number }, move: Move) {
  let { row, col } = frog;
  if (move === "forward") row += 1;
  if (move === "back") row = row === 0 ? 0 : row - 1;
  if (move === "left") col = col === 0 ? 0 : col - 1;
  if (move === "right") col = col === COLS - 1 ? COLS - 1 : col + 1;
  return { row, col };
}

// ---------- road generation ----------

function makeRoadLane(r: () => number): Lane {
  for (;;) {
    const dir: -1 | 1 = r() < 0.5 ? -1 : 1;
    const speed: 1 | 2 = r() < 0.55 ? 1 : 2;
    const want = 1 + Math.floor(r() * 3);
    const cars: Car[] = [];
    const used = new Set<number>();
    let budget = LANE_BUDGET;
    for (let i = 0; i < want; i++) {
      const len: 1 | 2 = r() < 0.5 ? 1 : 2;
      if (len + speed > budget) break;
      const head = Math.floor(r() * COLS);
      const cells = body(head, len, dir);
      if (cells.some((c) => used.has(c))) continue;
      cells.forEach((c) => used.add(c));
      cars.push({ head, len });
      budget -= len + speed;
    }
    if (cars.length > 0) return { kind: "road", dir, speed, cars };
  }
}

// Car positions repeat every 9 beats (9 columns; speeds 1 and 2 are coprime
// with 9). Search (row, col, beat mod 9) from the grass below a road run to
// the grass above it. The frog can wait on grass, so any start beat counts.
export function runIsCrossable(lanes: Lane[]): boolean {
  const rows = [{ kind: "grass" } as Lane, ...lanes, { kind: "grass" } as Lane];
  const top = rows.length - 1;
  const seen = new Set<string>();
  const queue: [number, number, number][] = [];
  for (let c = 0; c < COLS; c++)
    for (let t = 0; t < COLS; t++) {
      queue.push([0, c, t]);
      seen.add(`0,${c},${t}`);
    }
  while (queue.length) {
    const [row, col, t] = queue.shift()!;
    for (const m of MOVES) {
      const to = targetOf({ row, col }, m);
      if (to.row > top) continue;
      if (to.row === top) return true;
      if (isHit(rows[to.row], to.col, t)) continue;
      const key = `${to.row},${to.col},${(t + 1) % COLS}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push([to.row, to.col, (t + 1) % COLS]);
      }
    }
  }
  return false;
}

// Rows are built in order from one seeded stream, so a seed always gives the
// same road. Row 0 is the starting grass; road runs of 1-3 lanes alternate
// with grass strips of 1-2 rows. Uncrossable runs are rebuilt.
export function ensureRows(world: World, upTo: number) {
  const r = world.gen.next;
  while (world.rows.length <= upTo) {
    const runLen = 1 + Math.floor(r() * MAX_ROAD_RUN);
    let lanes: Lane[];
    do {
      lanes = Array.from({ length: runLen }, () => makeRoadLane(r));
    } while (!runIsCrossable(lanes));
    world.rows.push(...lanes);
    const grass = 1 + Math.floor(r() * 2);
    for (let i = 0; i < grass; i++) world.rows.push({ kind: "grass" });
  }
}

export function newWorld(seed: number): World {
  const w: World = {
    seed,
    rows: [{ kind: "grass" }],
    gen: { next: makeRng(seed), built: 0 },
    frog: { row: 0, col: START_COL },
    beat: 0,
    furthest: 0,
    sinceProgress: 0,
    alive: true,
  };
  ensureRows(w, 40);
  return w;
}

// Start a new run on the same road.
export function resetRun(world: World): World {
  return { ...world, frog: { row: 0, col: START_COL }, beat: 0, furthest: 0, sinceProgress: 0, alive: true };
}

// The frog moves first; then every car advances. The frog is hit if its new
// cell is anywhere a car covers or sweeps through during this beat.
export function step(world: World, move: Move): StepResult {
  const to = targetOf(world.frog, move);
  ensureRows(world, to.row + 12);
  const hit = isHit(world.rows[to.row], to.col, world.beat);
  world.frog = to;
  world.beat += 1;
  if (to.row > world.furthest) {
    world.furthest = to.row;
    world.sinceProgress = 0;
  } else {
    world.sinceProgress += 1;
  }
  if (hit) {
    world.alive = false;
    return { event: "hit" };
  }
  if (world.sinceProgress >= STALL_BEATS) {
    world.alive = false;
    return { event: "stalled" };
  }
  return { event: null };
}
