import { makeRng } from "./rng";

// A continuous road-crossing world. Time `t` is in seconds. Cars glide at a
// steady speed and wrap around the 9 columns; the frog hops instantly from
// square to square. The frog is hit whenever a car overlaps its square.

export const COLS = 9;
export const START_COL = 4;
export const STALL_SECONDS = 9;
// Car speeds: tier 1 moves one column every 0.6 s, tier 2 twice as fast.
export const TIER_SECONDS = 0.6;
export const colsPerSecond = (tier: 1 | 2) => tier / TIER_SECONDS;
// The frog's hitbox is a little narrower than its square, so a car has to
// really overlap it, not just touch the edge.
const FROG_PAD = 0.15;
const SUBSTEP = 0.02; // seconds per physics step when time jumps (e.g. a background tab)

// What's on screen: 12 rows, with the frog 3 rows from the bottom.
export const VIEW_ROWS = 12;
export const ROWS_BELOW_FROG = 3;
export function visibleRows(frogRow: number): { bottom: number; top: number } {
  const bottom = Math.max(0, frogRow - ROWS_BELOW_FROG);
  return { bottom, top: bottom + VIEW_ROWS - 1 };
}
const MAX_ROAD_RUN = 3;
const LANE_BUDGET = 5; // sum of (length + speed tier) over a lane's cars

export type Move = "forward" | "left" | "right" | "back" | "wait";
export const MOVES: Move[] = ["forward", "left", "right", "back", "wait"];

// `head` is the car's front square at t = 0, in its direction of travel; the
// body extends behind it.
export type Car = { head: number; len: 1 | 2 };
export type Lane = { kind: "grass" } | { kind: "road"; dir: -1 | 1; speed: 1 | 2; cars: Car[] };

export type World = {
  seed: number;
  rows: Lane[];
  gen: { next: () => number };
  frog: { row: number; col: number };
  t: number;
  furthest: number;
  lastProgressT: number;
  alive: boolean;
};

export type RunEvent = null | "hit" | "stalled";

export const mod = (n: number, m: number) => ((n % m) + m) % m;

// ---------- continuous car positions ----------

// Left edge of a car at time t, in columns (0 to 9, wrapping).
function leftEdge(car: Car, lane: Extract<Lane, { kind: "road" }>, t: number) {
  const left0 = lane.dir > 0 ? car.head - car.len + 1 : car.head;
  return mod(left0 + lane.dir * colsPerSecond(lane.speed) * t, COLS);
}

// Each car as [start, end) spans in columns; a car crossing the edge is split in two.
export function carSpans(lane: Lane, t: number): { car: number; x: number; len: number }[] {
  if (lane.kind !== "road") return [];
  return lane.cars.map((car, i) => ({ car: i, x: leftEdge(car, lane, t), len: car.len }));
}

function overlaps(a0: number, a1: number, x: number, len: number) {
  // Car occupies [x, x+len) on a circle of length COLS.
  const pieces = x + len > COLS ? [[x, COLS], [0, x + len - COLS]] : [[x, x + len]];
  return pieces.some(([b0, b1]) => a0 < b1 && b0 < a1);
}

// Is any car overlapping the frog's hitbox in `col` at time t?
export function occupied(lane: Lane, col: number, t: number): boolean {
  if (lane.kind !== "road") return false;
  const a0 = col + FROG_PAD;
  const a1 = col + 1 - FROG_PAD;
  return lane.cars.some((car) => overlaps(a0, a1, leftEdge(car, lane, t), car.len));
}

// The next time a car overlaps `col`, from time t: when it arrives and when it
// has passed. `from` is 0 if a car is there now. null if clear for the horizon.
export function busyWindow(lane: Lane, col: number, t: number, horizon = 3): { from: number; until: number } | null {
  if (lane.kind !== "road") return null;
  const dt = 0.02;
  let from = -1;
  for (let s = 0; s <= horizon + 2; s += dt) {
    const busy = occupied(lane, col, t + s);
    if (from < 0 && busy) {
      if (s > horizon) return null;
      from = s;
    } else if (from >= 0 && !busy) return { from, until: s };
  }
  return from >= 0 ? { from, until: horizon + 2 } : null;
}

// Would a frog that lands in (row, col) at time t stay unhit for `seconds`?
export function clearFor(world: World, row: number, col: number, t: number, seconds: number): boolean {
  const lane = world.rows[row];
  for (let s = 0; s <= seconds; s += SUBSTEP) if (occupied(lane, col, t + s)) return false;
  return true;
}

export function targetOf(frog: { row: number; col: number }, move: Move) {
  let { row, col } = frog;
  if (move === "forward") row += 1;
  if (move === "back") row = row === 0 ? 0 : row - 1;
  if (move === "left") col = col === 0 ? 0 : col - 1;
  if (move === "right") col = col === COLS - 1 ? COLS - 1 : col + 1;
  return { row, col };
}

// ---------- the frog ----------

// Hops instantly. Returns "hit" if the square it lands in is occupied.
export function hop(world: World, move: Move): RunEvent {
  if (!world.alive || move === "wait") return null;
  const to = targetOf(world.frog, move);
  ensureRows(world, to.row + VIEW_ROWS + 2);
  world.frog = to;
  if (to.row > world.furthest) {
    world.furthest = to.row;
    world.lastProgressT = world.t;
  }
  if (occupied(world.rows[to.row], to.col, world.t)) {
    world.alive = false;
    return "hit";
  }
  return null;
}

// Moves time forward in small steps, checking the frog after each one.
export function advance(world: World, seconds: number): RunEvent {
  let left = seconds;
  while (world.alive && left > 0) {
    const dt = Math.min(SUBSTEP, left);
    world.t += dt;
    left -= dt;
    if (occupied(world.rows[world.frog.row], world.frog.col, world.t)) {
      world.alive = false;
      return "hit";
    }
    if (world.t - world.lastProgressT >= STALL_SECONDS) {
      world.alive = false;
      return "stalled";
    }
  }
  return null;
}

// ---------- road generation ----------
// Generation reasons in 0.6 s beats (the tier-1 car speed), which is a
// conservative stand-in for continuous time: if a road can be crossed hopping
// only on beats, it can be crossed hopping any time.

function body(head: number, len: number, dir: number): number[] {
  const cells: number[] = [];
  for (let i = 0; i < len; i++) cells.push(mod(head - dir * i, COLS));
  return cells;
}

// Squares any car covers or passes through during beat b (discrete, for generation).
export function beatSwept(lane: Lane, b: number): Set<number> {
  const out = new Set<number>();
  if (lane.kind !== "road") return out;
  for (const car of lane.cars) {
    const start = car.head + lane.dir * lane.speed * b;
    for (let k = 0; k <= lane.speed; k++) for (const c of body(start + lane.dir * k, car.len, lane.dir)) out.add(c);
  }
  return out;
}

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

// Car positions repeat every 9 beats. Search (row, col, beat mod 9) from the
// grass below a road run to the grass above it.
export function runIsCrossable(lanes: Lane[]): boolean {
  const rows = [{ kind: "grass" } as Lane, ...lanes, { kind: "grass" } as Lane];
  const top = rows.length - 1;
  const seen = new Set<string>();
  const queue: [number, number, number][] = [];
  for (let c = 0; c < COLS; c++)
    for (let b = 0; b < COLS; b++) {
      queue.push([0, c, b]);
      seen.add(`0,${c},${b}`);
    }
  while (queue.length) {
    const [row, col, b] = queue.shift()!;
    for (const m of MOVES) {
      const to = targetOf({ row, col }, m);
      if (to.row > top) continue;
      if (to.row === top) return true;
      if (beatSwept(rows[to.row], b).has(to.col)) continue;
      const key = `${to.row},${to.col},${(b + 1) % COLS}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push([to.row, to.col, (b + 1) % COLS]);
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
    gen: { next: makeRng(seed) },
    frog: { row: 0, col: START_COL },
    t: 0,
    furthest: 0,
    lastProgressT: 0,
    alive: true,
  };
  ensureRows(w, 40);
  return w;
}

// Start a new run on the same road, with the clock back at zero.
export function resetRun(world: World): World {
  return { ...world, frog: { row: 0, col: START_COL }, t: 0, furthest: 0, lastProgressT: 0, alive: true };
}
