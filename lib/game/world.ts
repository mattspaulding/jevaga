import { makeRng } from "./rng";

// Jevaga: a Galaga-style fight in continuous time. Positions are in columns
// (x, 0-8, a column's center is its number) and rows (y, 0 at the top).
// The ship sits on the bottom row and moves a whole column at a time; bullets
// fall straight down their column; divers swoop freely.

export const COLS = 9;
export const ROWS = 14;
export const SHIP_ROW = 13;
const SUBSTEP = 0.02;

const SHOT_SPEED = 12; // rows per second, upward
const BULLET_SPEED = 7; // rows per second, downward
const DIVE_SPEED = 3.5; // rows per second
const DIVE_STEER = 2; // columns per second toward the ship
const RELOAD = 0.35; // seconds between shots
const MAX_SHOTS = 3;
const VOLLEY_EVERY = 1.2; // a formation enemy drops a bullet this often
const DIVE_FIRE_ROWS = [5, 8];
export const diveEvery = (wave: number) => Math.max(1.5, 3 * 0.9 ** (wave - 1));

export type Move = "left" | "right" | "stay" | "fire";
export const MOVES: Move[] = ["left", "right", "stay", "fire"];

export type Dive = { x: number; y: number; fired: number };
export type Enemy = { id: number; slot: { col: number; row: number }; kind: 0 | 1 | 2; alive: boolean; diving: Dive | null };
export type Bullet = { col: number; y: number };
export type Shot = { col: number; y: number };

export type World = {
  seed: number;
  rng: () => number;
  t: number;
  ship: { col: number; reloadUntil: number };
  enemies: Enemy[];
  bullets: Bullet[];
  shots: Shot[];
  score: number;
  kills: number;
  wave: number;
  nextDive: number;
  nextVolley: number;
  alive: boolean;
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
    rng: makeRng(seed),
    t: 0,
    ship: { col: 4, reloadUntil: 0 },
    enemies: formation(),
    bullets: [],
    shots: [],
    score: 0,
    kills: 0,
    wave: 1,
    nextDive: 2,
    nextVolley: 1,
    alive: true,
  };
}

// Every run on a seed replays the same fight: same formation, same dive order.
export const resetRun = (world: World) => newWorld(world.seed);

function shipHit(world: World): boolean {
  const { col } = world.ship;
  if (world.bullets.some((b) => b.col === col && Math.abs(b.y - SHIP_ROW) < 0.5)) return true;
  return world.enemies.some((e) => e.alive && e.diving && Math.abs(e.diving.x - col) < 0.6 && Math.abs(e.diving.y - SHIP_ROW) < 0.6);
}

function step(world: World, dt: number): RunEvent {
  world.t += dt;
  const t = world.t;

  for (const s of world.shots) s.y -= SHOT_SPEED * dt;
  world.shots = world.shots.filter((s) => s.y > -1);
  for (const b of world.bullets) b.y += BULLET_SPEED * dt;
  world.bullets = world.bullets.filter((b) => b.y < ROWS);

  for (const e of world.enemies) {
    const d = e.diving;
    if (!e.alive || !d) continue;
    d.y += DIVE_SPEED * dt;
    d.x += clamp(world.ship.col - d.x, -DIVE_STEER * dt, DIVE_STEER * dt);
    if (d.fired < DIVE_FIRE_ROWS.length && d.y >= DIVE_FIRE_ROWS[d.fired]) {
      world.bullets.push({ col: clamp(Math.round(d.x), 0, COLS - 1), y: d.y + 0.5 });
      d.fired++;
    }
    if (d.y > ROWS + 0.5) e.diving = null; // flew off the bottom: back to its slot
  }

  const waiting = () => world.enemies.filter((e) => e.alive && !e.diving);
  if (t >= world.nextDive) {
    const pool = waiting();
    if (pool.length) {
      const e = pool[Math.floor(world.rng() * pool.length)];
      const p = enemyPos(e, t);
      e.diving = { x: p.x, y: p.y, fired: 0 };
    }
    world.nextDive = t + diveEvery(world.wave);
  }
  if (t >= world.nextVolley) {
    const pool = waiting();
    if (pool.length) {
      const e = pool[Math.floor(world.rng() * pool.length)];
      const p = enemyPos(e, t);
      world.bullets.push({ col: clamp(Math.round(p.x), 0, COLS - 1), y: p.y + 0.5 });
    }
    world.nextVolley = t + VOLLEY_EVERY;
  }

  for (const s of world.shots) {
    const target = world.enemies.find((e) => {
      if (!e.alive) return false;
      const p = enemyPos(e, t);
      return Math.abs(p.x - s.col) < 0.5 && Math.abs(p.y - s.y) < 0.5;
    });
    if (target) {
      target.alive = false;
      world.score += target.diving ? 200 : 100;
      world.kills++;
      s.y = -99;
    }
  }
  world.shots = world.shots.filter((s) => s.y > -1);

  if (!world.enemies.some((e) => e.alive)) {
    world.wave++;
    world.enemies = formation();
    world.nextDive = t + diveEvery(world.wave);
  }

  if (shipHit(world)) {
    world.alive = false;
    return "hit";
  }
  return null;
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

// The ship acts instantly. Sliding into a bullet is a hit.
export function act(world: World, move: Move): RunEvent {
  if (!world.alive) return null;
  if (move === "left") world.ship.col = clamp(world.ship.col - 1, 0, COLS - 1);
  if (move === "right") world.ship.col = clamp(world.ship.col + 1, 0, COLS - 1);
  if (move === "fire" && world.t >= world.ship.reloadUntil && world.shots.length < MAX_SHOTS) {
    world.shots.push({ col: world.ship.col, y: SHIP_ROW - 0.5 });
    world.ship.reloadUntil = world.t + RELOAD;
  }
  if (shipHit(world)) {
    world.alive = false;
    return "hit";
  }
  return null;
}

export const gunReadyIn = (world: World) => Math.max(0, world.ship.reloadUntil - world.t);

// ---------- prediction (for describing the fight and for tests) ----------

// When would a ship parked in `col` first be hit, from now? Follows the
// bullets and divers already on screen (not ones that haven't launched yet).
export function threatAt(world: World, col: number, horizon = 2.5): { at: number; by: "bullet" | "diver" } | null {
  const bullets = world.bullets.map((b) => ({ ...b }));
  const divers = world.enemies.filter((e) => e.alive && e.diving).map((e) => ({ ...e.diving! }));
  for (let s = 0; s <= horizon; s += SUBSTEP) {
    if (bullets.some((b) => b.col === col && Math.abs(b.y - SHIP_ROW) < 0.5)) return { at: s, by: "bullet" };
    if (divers.some((d) => Math.abs(d.x - col) < 0.6 && Math.abs(d.y - SHIP_ROW) < 0.6)) return { at: s, by: "diver" };
    for (const b of bullets) b.y += BULLET_SPEED * SUBSTEP;
    for (const d of divers) {
      d.y += DIVE_SPEED * SUBSTEP;
      d.x += clamp(col - d.x, -DIVE_STEER * SUBSTEP, DIVE_STEER * SUBSTEP);
      if (d.fired < DIVE_FIRE_ROWS.length && d.y >= DIVE_FIRE_ROWS[d.fired]) {
        bullets.push({ col: clamp(Math.round(d.x), 0, COLS - 1), y: d.y + 0.5 });
        d.fired++;
      }
    }
  }
  return null;
}

// The lowest enemy above `col` now, and how long a shot fired now takes to reach it.
export function targetAbove(world: World, col: number): { rowsUp: number; seconds: number; diving: boolean } | null {
  let best: { y: number; diving: boolean } | null = null;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const p = enemyPos(e, world.t);
    if (Math.abs(p.x - col) < 0.5 && p.y < SHIP_ROW && (!best || p.y > best.y)) best = { y: p.y, diving: !!e.diving };
  }
  if (!best) return null;
  const rowsUp = SHIP_ROW - best.y;
  return { rowsUp, seconds: (rowsUp - 0.5) / SHOT_SPEED, diving: best.diving };
}
