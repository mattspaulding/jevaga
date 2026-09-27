import { makeRng } from "./rng";
import { COLS, drift, enemyPos, ROWS, SHIP_ROW, type Bullet, type Kind, type Shot, type World } from "./world";

// What the screen does after the ship is hit. The engine stops at the hit
// (recorded deaths and replays depend on that), so this is a separate
// animation that starts from a copy of the world at the hit and is worked out
// from the seconds since: the ship blows apart, every enemy that was out flies
// home, and then the formation dances. Same world, same seconds, same picture,
// so the video can render it too.

const HOME_SPEED = 5; // cells per second on the way home
const SWING = 0.8; // how far a homecoming enemy swings out sideways, in cells
const DANCE_WAIT = 0.25; // after the last one is home
const HOPS = 1.4; // hops a second
const HOP = 0.45; // how high, in rows
const DEBRIS = 24;
const DEBRIS_S = 1.6; // how long the pieces stay visible
const GRAVITY = 12; // rows per second², pulling debris back down

export type AfterEnemy = {
  kind: Kind;
  hp: number;
  col: number;
  row: number;
  from: { x: number; y: number }; // where it was at the hit
  flight: number; // seconds to get home; 0 if it was already in its slot
};
export type Debris = { vx: number; vy: number; color: "body" | "gold" | "white"; size: 2 | 3 }; // size in pixels
export type Aftermath = {
  tHit: number;
  shipX: number;
  enemies: AfterEnemy[];
  bullets: Bullet[];
  shots: Shot[];
  debris: Debris[];
  danceAt: number; // seconds after the hit when everyone is home and the dance starts
};

export function startAftermath(world: World): Aftermath {
  const t = world.t;
  const enemies = world.enemies
    .filter((e) => e.alive)
    .map((e): AfterEnemy => {
      const from = enemyPos(e, t);
      const inSlot = !e.diving || ["rev", "flap", "open"].includes(e.diving.phase); // still winding up in its slot
      const slot = { x: e.slot.col + drift(t), y: e.slot.row };
      const flight = inSlot ? 0 : Math.min(2.2, Math.max(0.6, Math.hypot(slot.x - from.x, slot.y - from.y) / HOME_SPEED));
      return { kind: e.kind, hp: e.hp, col: e.slot.col, row: e.slot.row, from: inSlot ? slot : from, flight };
    });
  const r = makeRng((world.seed * 7919 + world.steps) >>> 0);
  const debris = Array.from({ length: DEBRIS }, (): Debris => {
    const angle = -Math.PI * (0.1 + 0.8 * r()); // up and out
    const speed = 3 + 6 * r();
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: (["body", "gold", "white"] as const)[Math.floor(r() * 3)], size: r() < 0.4 ? 3 : 2 };
  });
  return {
    tHit: t,
    shipX: world.ship.x,
    enemies,
    bullets: world.bullets.map((b) => ({ ...b })),
    shots: world.shots.map((s) => ({ ...s })),
    debris,
    danceAt: Math.max(0, ...enemies.map((e) => e.flight)) + DANCE_WAIT,
  };
}

const smooth = (u: number) => u * u * (3 - 2 * u);

// Where an enemy is `s` seconds after the hit, and whether it's winking (a Cyclops's dance move).
export function enemyAt(a: Aftermath, e: AfterEnemy, s: number): { x: number; y: number; wink: boolean } {
  const slotX = e.col + drift(a.tHit + s);
  if (s < e.flight) {
    const u = s / e.flight;
    const k = smooth(u);
    const side = (e.from.x < (COLS - 1) / 2 ? -1 : 1) * SWING * Math.sin(Math.PI * u);
    return { x: e.from.x + (slotX - e.from.x) * k + side, y: e.from.y + (e.row - e.from.y) * k, wink: false };
  }
  const d = s - a.danceAt;
  if (d <= 0) return { x: slotX, y: e.row, wink: false };
  const ramp = Math.min(1, d / 0.3);
  const beat = 2 * Math.PI * HOPS * d;
  const hop = Math.max(0, Math.sin(beat - e.col * 0.7)); // a wave rolling across the columns
  return {
    x: slotX + ramp * 0.12 * Math.sin(beat / 2 + e.row),
    y: e.row - ramp * HOP * hop,
    wink: e.kind === 0 && Math.sin(beat / 2 + e.col) > 0.7,
  };
}

export const dancing = (a: Aftermath, s: number) => s > a.danceAt;

export function bulletsAt(a: Aftermath, s: number): Bullet[] {
  return a.bullets.map((b) => ({ ...b, x: b.x + b.vx * s, y: b.y + b.vy * s })).filter((b) => b.y < ROWS && b.x > -1 && b.x < COLS);
}

export function shotsAt(a: Aftermath, s: number): Shot[] {
  return a.shots.map((sh) => ({ x: sh.x, y: sh.y - 12 * s })).filter((sh) => sh.y > -1);
}

// Each piece of the ship: where it is and how much of it is left to see.
export function debrisAt(a: Aftermath, s: number): { x: number; y: number; alpha: number; d: Debris }[] {
  const alpha = Math.max(0, 1 - s / DEBRIS_S);
  if (alpha === 0) return [];
  return a.debris
    .map((d) => ({ x: a.shipX + d.vx * s, y: SHIP_ROW + d.vy * s + 0.5 * GRAVITY * s * s, alpha, d }))
    .filter((p) => p.y < ROWS + 1 && p.x > -1 && p.x < COLS);
}

export const flashAt = (s: number) => Math.max(0, 0.55 * (1 - s / 0.18)); // the whole screen, white
// The playfield's shake, in screen pixels.
export const shakeAt = (s: number) => {
  const k = 2.5 * Math.exp(-s * 8);
  return { x: Math.round(k * Math.sin(s * 70)), y: Math.round(k * Math.cos(s * 55)) };
};
