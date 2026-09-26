import { nextRandom } from "./rng";

// Jevaga: a Galaga-style fight in continuous time. Positions are in columns
// (x, 0-8) and rows (y, 0 at the top). Everything moves continuously: the
// ship glides along the bottom row while it's steered, bullets fall straight
// down from where they were dropped, divers swoop toward the ship.

export const COLS = 9;
export const ROWS = 14;
export const SHIP_ROW = 13;
export const SUBSTEP = 0.02; // seconds per physics step
export const SHIP_SPEED = 5; // columns per second while steering
// Jev's next answer lands about this long after its last one, so a "left" or
// "right" from Jev glides that way for this long and then stops.
export const DECISION_SECONDS = 0.25;
const SHIP_HALF = 0.45; // half the ship's width, in columns

const SHOT_SPEED = 12; // rows per second, upward
const BULLET_SPEED = 7; // rows per second, downward
const DIVE_SPEED = 3.5; // rows per second
const DIVE_STEER = 2; // columns per second toward the ship
// Below this row a diver stops turning and falls straight, about a second
// before it reaches the ship, so there is always a moment to get out of its way.
export const DIVE_LOCK_ROW = SHIP_ROW - 4;
const RELOAD = 0.35; // seconds between shots
const MAX_SHOTS = 3;
const VOLLEY_EVERY = 1.2; // a formation enemy drops a bullet this often
const DIVE_FIRE_ROWS = [5, 8];
export const diveEvery = (wave: number) => Math.max(1.5, 3 * 0.9 ** (wave - 1));

export type Move = "left" | "right" | "stay" | "fire";
export const MOVES: Move[] = ["left", "right", "stay", "fire"];

export type Dive = { x: number; y: number; fired: number };
export type Enemy = { id: number; slot: { col: number; row: number }; kind: 0 | 1 | 2; alive: boolean; diving: Dive | null };
export type Bullet = { x: number; y: number };
export type Shot = { x: number; y: number };
export type Pop = { x: number; y: number; kind: 0 | 1 | 2; t: number }; // an enemy destroyed at (x, y) at time t

export type HitBy = { by: "bullet" | "diver"; x: number; y: number };

// Plain data only (no functions or class instances), so structuredClone
// copies a fight exactly and a copy plays out the same as the original.
export type World = {
  seed: number;
  rngState: number; // mulberry32 state; see rand()
  t: number;
  steps: number; // physics steps taken, so a replay can act on exactly the same step
  ship: { x: number; vx: number; glideUntil: number; reloadUntil: number };
  enemies: Enemy[];
  bullets: Bullet[];
  shots: Shot[];
  pops: Pop[]; // recent kills, kept briefly so the canvas can draw them bursting
  score: number;
  kills: number;
  wave: number;
  nextDive: number;
  nextVolley: number;
  alive: boolean;
  hitBy: HitBy | null; // what hit the ship, once something has
};

export type RunEvent = null | "hit";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Formation: 3 rows of 7, drifting side to side by up to one column.
function formation(): Enemy[] {
  const out: Enemy[] = [];
  let id = 0;
  for (let row = 1; row <= 3; row++)
    for (let col = 1; col <= 7; col++) out.push({ id: id++, slot: { col, row }, kind: (row - 1) as 0 | 1 | 2, alive: true, diving: null });
  return out;
}
export const drift = (t: number) => Math.sin(0.6 * t);

export function enemyPos(e: Enemy, t: number): { x: number; y: number } {
  return e.diving ? { x: e.diving.x, y: e.diving.y } : { x: e.slot.col + drift(t), y: e.slot.row };
}

export function newWorld(seed: number): World {
  return {
    seed,
    rngState: seed >>> 0,
    t: 0,
    steps: 0,
    ship: { x: 4, vx: 0, glideUntil: 0, reloadUntil: 0 },
    enemies: formation(),
    bullets: [],
    shots: [],
    pops: [],
    score: 0,
    kills: 0,
    wave: 1,
    nextDive: 2,
    nextVolley: 1,
    alive: true,
    hitBy: null,
  };
}

// The fight's random numbers: dive and volley picks. Advances world.rngState.
function rand(world: World): number {
  const r = nextRandom(world.rngState);
  world.rngState = r.state;
  return r.value;
}

// Every run on a seed replays the same fight: same formation, same dive order.
export const resetRun = (world: World) => newWorld(world.seed);

const bulletHits = (b: Bullet, x: number) => Math.abs(b.x - x) < SHIP_HALF && Math.abs(b.y - SHIP_ROW) < 0.5;
const diverHits = (d: { x: number; y: number }, x: number) => Math.abs(d.x - x) < 0.6 && Math.abs(d.y - SHIP_ROW) < 0.6;

function shipHit(world: World): HitBy | null {
  const { x } = world.ship;
  const b = world.bullets.find((b) => bulletHits(b, x));
  if (b) return { by: "bullet", x: b.x, y: b.y };
  const d = world.enemies.find((e) => e.alive && e.diving && diverHits(e.diving, x))?.diving;
  return d ? { by: "diver", x: d.x, y: d.y } : null;
}

function step(world: World, dt: number): RunEvent {
  const ship = world.ship;
  const glide = Math.max(0, Math.min(dt, ship.glideUntil - world.t));
  ship.x = clamp(ship.x + ship.vx * glide, 0, COLS - 1);
  world.t += dt;
  world.steps++;
  const t = world.t;
  if (t >= ship.glideUntil) ship.vx = 0;

  for (const s of world.shots) s.y -= SHOT_SPEED * dt;
  world.shots = world.shots.filter((s) => s.y > -1);
  for (const b of world.bullets) b.y += BULLET_SPEED * dt;
  world.bullets = world.bullets.filter((b) => b.y < ROWS);

  for (const e of world.enemies) {
    const d = e.diving;
    if (!e.alive || !d) continue;
    if (d.y < DIVE_LOCK_ROW) d.x += clamp(world.ship.x - d.x, -DIVE_STEER * dt, DIVE_STEER * dt);
    d.y += DIVE_SPEED * dt;
    if (d.fired < DIVE_FIRE_ROWS.length && d.y >= DIVE_FIRE_ROWS[d.fired]) {
      world.bullets.push({ x: d.x, y: d.y + 0.5 });
      d.fired++;
    }
    if (d.y > ROWS + 0.5) e.diving = null; // flew off the bottom: back to its slot
  }

  const waiting = () => world.enemies.filter((e) => e.alive && !e.diving);
  if (t >= world.nextDive) {
    const pool = waiting();
    if (pool.length) {
      const e = pool[Math.floor(rand(world) * pool.length)];
      const p = enemyPos(e, t);
      e.diving = { x: p.x, y: p.y, fired: 0 };
    }
    world.nextDive = t + diveEvery(world.wave);
  }
  if (t >= world.nextVolley) {
    const pool = waiting();
    if (pool.length) {
      const e = pool[Math.floor(rand(world) * pool.length)];
      const p = enemyPos(e, t);
      world.bullets.push({ x: p.x, y: p.y + 0.5 });
    }
    world.nextVolley = t + VOLLEY_EVERY;
  }

  for (const s of world.shots) {
    const target = world.enemies.find((e) => {
      if (!e.alive) return false;
      const p = enemyPos(e, t);
      return Math.abs(p.x - s.x) < 0.5 && Math.abs(p.y - s.y) < 0.5;
    });
    if (target) {
      const at = enemyPos(target, t);
      world.pops.push({ x: at.x, y: at.y, kind: target.kind, t });
      target.alive = false;
      world.score += target.diving ? 200 : 100;
      world.kills++;
      s.y = -99;
    }
  }
  world.shots = world.shots.filter((s) => s.y > -1);
  world.pops = world.pops.filter((p) => t - p.t < 1);

  if (!world.enemies.some((e) => e.alive)) {
    world.wave++;
    world.enemies = formation();
    world.nextDive = t + diveEvery(world.wave);
  }

  const hit = shipHit(world);
  if (hit) {
    world.alive = false;
    world.hitBy = hit;
    return "hit";
  }
  return null;
}

// Exactly n physics steps. Replays use this so a copy of the world and the
// original take identical steps and stay identical.
export function stepN(world: World, n: number): RunEvent {
  for (let i = 0; i < n && world.alive; i++) if (step(world, SUBSTEP)) return "hit";
  return world.alive ? null : "hit";
}

// Moves time forward in small steps, checking hits after each one.
export function advance(world: World, seconds: number): RunEvent {
  let left = seconds;
  while (world.alive && left > 0) {
    const dt = Math.min(SUBSTEP, left);
    left -= dt;
    if (step(world, dt)) return "hit";
  }
  return null;
}

// Steering: -1 glides left, 1 glides right, 0 stops. The ship glides for
// `seconds` (the keyboard: until steered again) and then stops.
export function steer(world: World, dir: -1 | 0 | 1, seconds = Infinity) {
  if (!world.alive) return;
  world.ship.vx = dir * SHIP_SPEED;
  world.ship.glideUntil = dir === 0 ? world.t : world.t + seconds;
}

export function fire(world: World) {
  if (!world.alive || world.t < world.ship.reloadUntil || world.shots.length >= MAX_SHOTS) return;
  world.shots.push({ x: world.ship.x, y: SHIP_ROW - 0.5 });
  world.ship.reloadUntil = world.t + RELOAD;
}

// Jev's four moves: left and right glide that way for one decision's worth,
// stay stops, fire stops and shoots.
export function act(world: World, move: Move): RunEvent {
  if (!world.alive) return null;
  if (move === "left") steer(world, -1, DECISION_SECONDS);
  if (move === "right") steer(world, 1, DECISION_SECONDS);
  if (move === "stay") steer(world, 0);
  if (move === "fire") {
    steer(world, 0);
    fire(world);
  }
  return null;
}

// Where the ship stops if nobody steers it again. A glide still under way
// finishes first (at most one decision's worth, about when Jev's answer lands).
export function restX(world: World): number {
  const { x, vx, glideUntil } = world.ship;
  const left = Math.min(DECISION_SECONDS, Math.max(0, glideUntil - world.t));
  return clamp(x + vx * left, 0, COLS - 1);
}

// Where a move answered now would leave the ship: from where it stops, one glide over.
export function landingX(world: World, move: Move): number {
  const d = move === "left" ? -1 : move === "right" ? 1 : 0;
  return clamp(restX(world) + d * SHIP_SPEED * DECISION_SECONDS, 0, COLS - 1);
}

export const gunReadyIn = (world: World) => Math.max(0, world.ship.reloadUntil - world.t);

// ---------- prediction (for describing the fight and for tests) ----------

// When would a ship parked at `x` first be hit, from now? Follows the
// bullets and divers already on screen (not ones that haven't launched yet).
export function threatAt(world: World, x: number, horizon = 2.5) {
  return threatOnPath(world, () => x, horizon);
}

// The same for a ship that is moving: `path(s)` is where it is s seconds from now.
export function threatOnPath(world: World, path: (s: number) => number, horizon = 2.5): { at: number; by: "bullet" | "diver" } | null {
  const bullets = world.bullets.map((b) => ({ ...b }));
  const divers = world.enemies.filter((e) => e.alive && e.diving).map((e) => ({ ...e.diving! }));
  for (let s = 0; s <= horizon; s += SUBSTEP) {
    const x = path(s);
    if (bullets.some((b) => bulletHits(b, x))) return { at: s, by: "bullet" };
    if (divers.some((d) => diverHits(d, x))) return { at: s, by: "diver" };
    for (const b of bullets) b.y += BULLET_SPEED * SUBSTEP;
    for (const d of divers) {
      if (d.y < DIVE_LOCK_ROW) d.x += clamp(x - d.x, -DIVE_STEER * SUBSTEP, DIVE_STEER * SUBSTEP);
      d.y += DIVE_SPEED * SUBSTEP;
      if (d.fired < DIVE_FIRE_ROWS.length && d.y >= DIVE_FIRE_ROWS[d.fired]) {
        bullets.push({ x: d.x, y: d.y + 0.5 });
        d.fired++;
      }
    }
  }
  return null;
}

// Where the ship goes if Jev answers `move` now: it finishes the glide under
// way, the answer lands about a decision later, then it glides to landingX.
export function movePath(world: World, move: Move): (s: number) => number {
  const from = world.ship.x;
  const rest = restX(world);
  const to = landingX(world, move);
  const toward = (a: number, b: number, d: number) => a + Math.sign(b - a) * Math.min(Math.abs(b - a), d);
  return (s) => (s < DECISION_SECONDS ? toward(from, rest, SHIP_SPEED * s) : toward(rest, to, SHIP_SPEED * (s - DECISION_SECONDS)));
}

// The lowest enemy above `x` now, and how long a shot fired now takes to reach it.
export function targetAbove(world: World, x: number): { rowsUp: number; seconds: number; diving: boolean } | null {
  let best: { y: number; diving: boolean } | null = null;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const p = enemyPos(e, world.t);
    if (Math.abs(p.x - x) < 0.5 && p.y < SHIP_ROW && (!best || p.y > best.y)) best = { y: p.y, diving: !!e.diving };
  }
  if (!best) return null;
  const rowsUp = SHIP_ROW - best.y;
  return { rowsUp, seconds: (rowsUp - 0.5) / SHOT_SPEED, diving: best.diving };
}
