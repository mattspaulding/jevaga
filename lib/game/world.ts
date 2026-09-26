import { nextRandom } from "./rng";

// Jevaga: a Galaga-style fight in continuous time. Positions are in columns
// (x, 0-8) and rows (y, 0 at the top). Everything moves continuously: the
// ship glides along the bottom row while it's steered, bullets fall straight
// down from where they were dropped, and each kind of enemy dives its own way.

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
const RELOAD = 0.35; // seconds between shots
const MAX_SHOTS = 3;
const VOLLEY_EVERY = 1.2; // a formation enemy fires this often
export const diveEvery = (wave: number) => Math.max(1.5, 3 * 0.9 ** (wave - 1));

// Each kind dives its own way (devpost/enemy-design.md, section 2). Numbers
// are rows or columns per second, and seconds.
// Drone, "Plunge": revs, slides along its row to the column the ship was in,
// falls straight down it. Never turns, never shoots.
export const DRONE_REV = 0.8;
export const DRONE_SLIDE = 4;
export const DRONE_FALL = 4.5;
// Bat, "Flutter": zigzags down on a path fixed at launch, fires straight down
// at rows 5 and 8, and at COMMIT_ROW reads the ship once and flies at that spot.
export const BAT_FLAP = 0.3;
export const BAT_DROP = 3;
const BAT_ZIG = 2.5; // sideways, flipping every leg
const BAT_LEG = 0.5;
export const BAT_COMMIT = 4;
const BAT_FIRE_ROWS = [5, 8];
export const COMMIT_ROW = SHIP_ROW - 4;
// Cyclops, "Hover": loops once, parks over the ship's column at HOVER_ROW,
// fires two aimed shots with its eye glowing before each, then drops.
export const CY_OPEN = 0.3;
const CY_LOOP = 0.8;
const CY_LOOP_R = 0.7;
const CY_SLIDE = 3;
export const HOVER_ROW = 6;
export const CY_GLOW = 0.8; // the eye glows this long before every aimed shot
const CY_SHOTS = 2;
export const CY_DROP = 4.5;
const AIMED_SPEED = 6;
const HOME_SPEED = 5; // a diver that missed flies back to its slot from the top, and a new enemy flies to its slot after the fly-in

// The fly-in (enemy-design.md, section 3): every wave starts empty, and three
// groups of 7 swoop in single file along fixed paths, dip to row 9 and climb
// to their slots. Nothing dives or volleys until they're all in place.
export const ENTRY_SPEED = 7; // cells per second along the path
const ENTRY_SPACING = 0.18; // seconds between enemies in one file
const ENTRY_GROUP_GAP = 1.2; // seconds between groups
export const ENTRY_LEAD = 1; // a group's path is drawn this long before its first enemy appears
export const ENTRY_FIRE_ROW = 5; // from wave 2, an entering Bat drops a bullet here on the way down
const ENTRY_GLOW_ROW = 3; // and an entering Cyclops starts its eye glow here
const ENTRY_REST = 1; // after the last enemy reaches its slot, dives and volleys wait this long
const CY_HP = 2; // a Cyclops takes two hits
const DIVE_WEIGHT = [1, 2, 3]; // Cyclops, Bat, Drone: Drones dive most often
const AT_ONCE = 1; // attacks under way at once
const DIVE_GAP = 0.8; // the next dive waits at least this long after an attack ends

export type Move = "left" | "right" | "stay" | "fire";
export const MOVES: Move[] = ["left", "right", "stay", "fire"];

export type Kind = 0 | 1 | 2; // Cyclops (row 1), Bat (row 2), Drone (row 3)
export const KIND_NAME = ["Cyclops", "Bat", "Drone"] as const;

// rev/flap/open: still in its slot, winding up. home: missed, flying back.
// enter: flying in along a fly-in path. settle: from the end of that path to its slot.
export type Phase = "rev" | "slide" | "fall" | "flap" | "zig" | "commit" | "open" | "loop" | "park" | "drop" | "home" | "enter" | "settle";
export type Dive = {
  phase: Phase;
  since: number; // when this phase began
  x: number;
  y: number;
  col: number; // Drone: the column it falls down; Cyclops: the column it parks over; Bat: the spot it committed to
  x0: number; // Bat: where its zigzag starts; Cyclops: where its loop starts
  y0: number;
  dir: 1 | -1; // Bat: its first zig; Cyclops: which way it loops
  vx: number; // Bat: sideways speed once committed
  fired: number;
  path: number; // enter: which fly-in path (ENTRY_PATHS); -1 otherwise
};
export type Enemy = {
  id: number;
  slot: { col: number; row: number };
  kind: Kind;
  alive: boolean;
  hp: number; // hits left: a Cyclops takes two
  hurt: number; // when it last took a hit that didn't kill it, for the flash
  diving: Dive | null;
  charge: number | null; // a Cyclops fires an aimed shot at this time
};
export type Bullet = { x: number; y: number; vx: number; vy: number; from: Kind };
export type Shot = { x: number; y: number };
export type Pop = { x: number; y: number; kind: Kind; t: number }; // an enemy destroyed at (x, y) at time t

// What hits the ship, by name, so Jev and the coach can tell enemies apart.
export const THREATS = ["Drone", "Bat", "Cyclops", "Bat bullet", "Cyclops shot"] as const;
export type Threat = (typeof THREATS)[number];
export type HitBy = { by: Threat; x: number; y: number };

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

// Fly-in paths, as waypoints in cells: in from the top left, the top right
// (its mirror) and the top middle, down to row 9, looping back up. Each is
// sampled once into a smooth line an enemy follows at ENTRY_SPEED.
const ENTRY_WAYPOINTS: [number, number][][] = (() => {
  const left: [number, number][] = [[-1.5, -1.5], [0.6, 1.2], [2.2, 4.4], [3.2, 7.4], [4.5, 8.9], [5.8, 8.2], [6.3, 6.6], [5.4, 5.4], [4, 5.5]];
  const middle: [number, number][] = [[4, -1.5], [4, 1.4], [3.1, 4.4], [2.3, 7.2], [3.1, 8.8], [4.7, 8.6], [5.6, 7.3], [5.2, 5.8], [4, 5.4]];
  return [left, left.map(([x, y]) => [COLS - 1 - x, y] as [number, number]), middle];
})();
export const ENTRY_SIDE = ["top left", "top right", "top middle"] as const;

type Pt = { x: number; y: number; at: number }; // at: distance along the path
function sample(way: [number, number][]): Pt[] {
  const p = (i: number) => way[Math.max(0, Math.min(way.length - 1, i))];
  const out: Pt[] = [];
  for (let i = 0; i < way.length - 1; i++)
    for (let k = 0; k < 10; k++) {
      // Catmull-Rom through the waypoints
      const u = k / 10;
      const [a, b, c, d] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
      const f = (j: 0 | 1) => 0.5 * (2 * b[j] + (c[j] - a[j]) * u + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * u * u + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * u * u * u);
      out.push({ x: f(0), y: f(1), at: 0 });
    }
  out.push({ x: way[way.length - 1][0], y: way[way.length - 1][1], at: 0 });
  for (let i = 1; i < out.length; i++) out[i].at = out[i - 1].at + Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
  return out;
}
export const ENTRY_PATHS: Pt[][] = ENTRY_WAYPOINTS.map(sample);
export const entryLength = (path: number) => ENTRY_PATHS[path][ENTRY_PATHS[path].length - 1].at;

// Where an enemy is `along` cells into a fly-in path.
export function entryAt(path: number, along: number): { x: number; y: number } {
  const pts = ENTRY_PATHS[path];
  if (along <= 0) return { x: pts[0].x, y: pts[0].y };
  let lo = 0;
  let hi = pts.length - 1;
  if (along >= pts[hi].at) return { x: pts[hi].x, y: pts[hi].y };
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].at <= along) lo = mid;
    else hi = mid;
  }
  const u = (along - pts[lo].at) / (pts[hi].at - pts[lo].at);
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * u, y: pts[lo].y + (pts[hi].y - pts[lo].y) * u };
}

// Which kind comes in along which path, in the order the groups come in.
// Three patterns, one per wave in turn (Galaga has three).
const ENTRY_PATTERNS: [Kind, number][][] = [
  [[1, 0], [2, 1], [0, 2]], // Bats from the top left, Drones from the top right, Cyclopes from the top middle
  [[2, 0], [0, 1], [1, 2]],
  [[0, 0], [1, 1], [2, 2]],
];
export const entryPattern = (wave: number) => ENTRY_PATTERNS[(wave - 1) % ENTRY_PATTERNS.length];

// A new wave: 3 rows of 7, each flying in along its group's path. Its first
// enemy appears ENTRY_LEAD after the wave starts, so the path shows first.
// From wave 2, every Bat and every other Cyclops fires on the way in
// (fired 0 = still to fire).
function formation(t: number, wave: number): Enemy[] {
  const out: Enemy[] = [];
  let id = 0;
  for (let row = 1; row <= 3; row++)
    for (let col = 1; col <= 7; col++) {
      const kind = (row - 1) as Kind;
      const group = entryPattern(wave).findIndex(([k]) => k === kind);
      const path = entryPattern(wave)[group][1];
      const order = path === 1 ? 7 - col : col - 1; // the file fills the far slots first
      const since = t + ENTRY_LEAD + group * ENTRY_GROUP_GAP + order * ENTRY_SPACING;
      const fires = wave >= 2 && kind !== 2 && (kind === 1 || order % 2 === 0);
      const start = entryAt(path, 0);
      out.push({
        id: id++,
        slot: { col, row },
        kind,
        alive: true,
        hp: kind === 0 ? CY_HP : 1,
        hurt: -1,
        charge: null,
        diving: { phase: "enter", since, x: start.x, y: start.y, col: 0, x0: 0, y0: 0, dir: 1, vx: 0, fired: fires ? 0 : 1, path },
      });
    }
  return out;
}
export const drift = (t: number) => Math.sin(0.6 * t);
const slotPos = (e: Enemy, t: number) => ({ x: e.slot.col + drift(t), y: e.slot.row });

export function enemyPos(e: Enemy, t: number): { x: number; y: number } {
  return e.diving ? { x: e.diving.x, y: e.diving.y } : slotPos(e, t);
}

export function newWorld(seed: number): World {
  return {
    seed,
    rngState: seed >>> 0,
    t: 0,
    steps: 0,
    ship: { x: 4, vx: 0, glideUntil: 0, reloadUntil: 0 },
    enemies: formation(0, 1),
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

const bulletHits = (b: { x: number; y: number }, x: number) => Math.abs(b.x - x) < SHIP_HALF && Math.abs(b.y - SHIP_ROW) < 0.5;
export const DIVER_REACH = 0.6; // a diver this close to the ship, across and up, hits it
const diverHits = (d: { x: number; y: number }, x: number) => Math.abs(d.x - x) < DIVER_REACH && Math.abs(d.y - SHIP_ROW) < DIVER_REACH;
// Arriving: flying in or settling into its slot at the start of a wave.
export const arriving = (e: Enemy) => e.alive && !!e.diving && (e.diving.phase === "enter" || e.diving.phase === "settle");
// Attacking: a dive under way, as opposed to arriving or flying home.
export const attacking = (e: Enemy) => e.alive && !!e.diving && !arriving(e) && e.diving.phase !== "home";

function shipHit(world: World): HitBy | null {
  const { x } = world.ship;
  const b = world.bullets.find((b) => bulletHits(b, x));
  if (b) return { by: b.from === 0 ? "Cyclops shot" : "Bat bullet", x: b.x, y: b.y };
  const e = world.enemies.find((e) => attacking(e) && diverHits(e.diving!, x));
  return e ? { by: KIND_NAME[e.kind], x: e.diving!.x, y: e.diving!.y } : null;
}

const straight = (x: number, y: number): Bullet => ({ x, y: y + 0.5, vx: 0, vy: BULLET_SPEED, from: 1 });
// A Cyclops shot flies straight at where the ship is when it fires, and never turns.
function aimed(world: World, x: number, y: number): Bullet {
  const dx = world.ship.x - x;
  const dy = SHIP_ROW - (y + 0.5);
  const len = Math.hypot(dx, dy) || 1;
  return { x, y: y + 0.5, vx: (dx / len) * AIMED_SPEED, vy: (dy / len) * AIMED_SPEED, from: 0 };
}

// The Bat's zigzag, fixed at launch: `age` seconds into it, how far across it is.
export function batZigX(d: Dive, age: number): number {
  const leg = Math.floor(age / BAT_LEG);
  const into = age - leg * BAT_LEG;
  return d.x0 + d.dir * BAT_ZIG * (leg % 2 === 0 ? into : BAT_LEG - into);
}
export const batCommitAge = (d: Dive) => (COMMIT_ROW - d.y0) / BAT_DROP;

// Launches a dive. Its whole plan is fixed here from where the ship is now,
// except the two moments the design names: a Bat reads the ship once at
// COMMIT_ROW, and a Cyclops aims each shot when it fires.
export function startDive(world: World, e: Enemy) {
  const t = world.t;
  const p = slotPos(e, t);
  const col = clamp(Math.round(world.ship.x), 0, COLS - 1);
  const d: Dive = { phase: (["open", "flap", "rev"] as const)[e.kind], since: t, x: p.x, y: p.y, col, x0: p.x, y0: p.y, dir: 1, vx: 0, fired: 0, path: -1 };
  if (e.kind === 1) {
    d.x0 = e.slot.col + drift(t + BAT_FLAP); // where it leaves the formation
    d.dir = world.ship.x >= d.x0 ? 1 : -1; // its first zig heads toward the ship's side
    const reach = d.x0 + d.dir * BAT_ZIG * BAT_LEG;
    if (reach < 0 || reach > COLS - 1) d.dir = d.dir === 1 ? -1 : 1;
  }
  if (e.kind === 0) d.dir = col >= p.x ? 1 : -1;
  e.charge = null;
  e.diving = d;
}

function stepDive(world: World, e: Enemy, d: Dive, dt: number) {
  const t = world.t;
  const age = t - d.since;
  const next = (phase: Phase) => {
    d.phase = phase;
    d.since = t;
    d.x0 = d.x;
    d.y0 = d.y;
  };
  const toward = (tx: number, ty: number, speed: number) => {
    const dx = tx - d.x;
    const dy = ty - d.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= speed * dt) {
      d.x = tx;
      d.y = ty;
      return true;
    }
    d.x += (dx / dist) * speed * dt;
    d.y += (dy / dist) * speed * dt;
    return false;
  };
  switch (d.phase) {
    case "rev":
    case "flap":
    case "open": {
      const p = slotPos(e, t);
      d.x = p.x;
      d.y = p.y;
      if (d.phase === "rev" && age >= DRONE_REV) next("slide");
      if (d.phase === "open" && age >= CY_OPEN) {
        next("loop");
        // the loop swings 2 × CY_LOOP_R to one side: keep it on the field
        const far = d.x0 + 2 * CY_LOOP_R * d.dir;
        if (far < 0 || far > COLS - 1) d.dir = d.dir === 1 ? -1 : 1;
      }
      if (d.phase === "flap" && age >= BAT_FLAP) {
        d.phase = "zig"; // keeps the start fixed at launch, so the drawn path is the flown one
        d.since = t;
      }
      break;
    }
    case "slide":
      if (e.kind === 2 ? toward(d.col, d.y, DRONE_SLIDE) : toward(d.col, HOVER_ROW, CY_SLIDE)) next(e.kind === 2 ? "fall" : "park");
      break;
    case "fall":
      d.y += DRONE_FALL * dt;
      break;
    case "zig":
      d.x = batZigX(d, age);
      d.y = d.y0 + BAT_DROP * age;
      if (d.y >= COMMIT_ROW) {
        d.col = world.ship.x; // the one time a Bat looks at the ship
        d.vx = (d.col - d.x) / ((SHIP_ROW - d.y) / BAT_COMMIT);
        next("commit");
      }
      break;
    case "commit":
      d.x += d.vx * dt;
      d.y += BAT_COMMIT * dt;
      break;
    case "loop": {
      const a = (2 * Math.PI * Math.min(age, CY_LOOP)) / CY_LOOP;
      // one small circle beside where it started: down first, round, and back
      d.x = d.x0 + d.dir * CY_LOOP_R * (1 - Math.cos(a));
      d.y = d.y0 + CY_LOOP_R * Math.sin(a);
      if (age >= CY_LOOP) next("slide");
      break;
    }
    case "park":
      if (d.fired < CY_SHOTS && age >= CY_GLOW * (d.fired + 1)) {
        world.bullets.push(aimed(world, d.x, d.y));
        d.fired++;
      }
      if (d.fired >= CY_SHOTS) next("drop");
      break;
    case "drop":
      d.y += CY_DROP * dt;
      break;
    case "home":
    case "settle": {
      const p = slotPos(e, t);
      if (toward(p.x, p.y, HOME_SPEED)) e.diving = null;
      return;
    }
    case "enter": {
      const along = (t - d.since) * ENTRY_SPEED;
      const was = d.y;
      const p = entryAt(d.path, along);
      d.x = p.x;
      d.y = p.y;
      if (d.fired === 0 && e.kind === 1 && was < ENTRY_FIRE_ROW && d.y >= ENTRY_FIRE_ROW) {
        world.bullets.push(straight(d.x, d.y));
        d.fired = 1;
      }
      if (d.fired === 0 && e.kind === 0 && was < ENTRY_GLOW_ROW && d.y >= ENTRY_GLOW_ROW) {
        e.charge = t + CY_GLOW; // fires from wherever the path has it 0.8 s from now
        d.fired = 1;
      }
      if (along >= entryLength(d.path)) next("settle");
      return;
    }
  }
  if (e.kind === 1 && d.fired < BAT_FIRE_ROWS.length && d.y >= BAT_FIRE_ROWS[d.fired]) {
    world.bullets.push(straight(d.x, d.y));
    d.fired++;
  }
  if (d.y > ROWS + 0.5) {
    next("home"); // flew off the bottom: back in at the top of the same column
    d.y = -1;
  }
}

// One physics step. `sim` is for prediction: the ship is put where a planned
// path says, and nothing new launches (no new dives, no new volleys).
function step(world: World, dt: number, sim?: { shipX: number }): RunEvent {
  const ship = world.ship;
  if (sim) ship.x = sim.shipX;
  else {
    const glide = Math.max(0, Math.min(dt, ship.glideUntil - world.t));
    ship.x = clamp(ship.x + ship.vx * glide, 0, COLS - 1);
  }
  world.t += dt;
  world.steps++;
  const t = world.t;
  if (t >= ship.glideUntil) ship.vx = 0;

  for (const s of world.shots) s.y -= SHOT_SPEED * dt;
  world.shots = world.shots.filter((s) => s.y > -1);
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  world.bullets = world.bullets.filter((b) => b.y < ROWS && b.x > -1 && b.x < COLS);

  for (const e of world.enemies) {
    if (!e.alive) continue;
    if (e.diving) stepDive(world, e, e.diving, dt);
    if (e.charge !== null && t >= e.charge) {
      const p = enemyPos(e, t);
      world.bullets.push(aimed(world, p.x, p.y));
      e.charge = null;
    }
  }

  if (!sim && world.enemies.some(arriving)) {
    // The formation is still flying in: nothing dives or volleys yet.
    world.nextDive = Math.max(world.nextDive, t + ENTRY_REST);
    world.nextVolley = Math.max(world.nextVolley, t + ENTRY_REST);
  } else if (!sim) {
    const waiting = () => world.enemies.filter((e) => e.alive && !e.diving && e.charge === null);
    if (world.enemies.filter(attacking).length >= AT_ONCE) world.nextDive = Math.max(world.nextDive, t + DIVE_GAP);
    else if (t >= world.nextDive) {
      const pool = waiting();
      const total = pool.reduce((n, e) => n + DIVE_WEIGHT[e.kind], 0);
      if (total) {
        let r = rand(world) * total;
        const e = pool.find((e) => (r -= DIVE_WEIGHT[e.kind]) < 0) ?? pool[pool.length - 1];
        startDive(world, e);
      }
      world.nextDive = t + diveEvery(world.wave);
    }
    // In formation, Bats drop straight bullets and a Cyclops fires an aimed
    // shot after its eye glows. Drones never fire.
    if (t >= world.nextVolley) {
      const pool = waiting().filter((e) => e.kind !== 2);
      if (pool.length) {
        const e = pool[Math.floor(rand(world) * pool.length)];
        if (e.kind === 1) {
          const p = slotPos(e, t);
          world.bullets.push(straight(p.x, p.y));
        } else e.charge = t + CY_GLOW;
      }
      world.nextVolley = t + VOLLEY_EVERY;
    }
  }

  for (const s of world.shots) {
    const target = world.enemies.find((e) => {
      if (!e.alive) return false;
      const p = enemyPos(e, t);
      return Math.abs(p.x - s.x) < 0.5 && Math.abs(p.y - s.y) < 0.5;
    });
    if (target) {
      s.y = -99;
      target.hp--;
      if (target.hp > 0) {
        target.hurt = t; // a Cyclops's first hit shuts its eye
        continue;
      }
      const at = enemyPos(target, t);
      world.pops.push({ x: at.x, y: at.y, kind: target.kind, t });
      world.score += target.kind === 0 ? (attacking(target) ? 400 : 150) : attacking(target) ? 200 : 100;
      target.alive = false;
      world.kills++;
    }
  }
  world.shots = world.shots.filter((s) => s.y > -1);
  world.pops = world.pops.filter((p) => t - p.t < 1);

  if (!world.enemies.some((e) => e.alive)) {
    world.wave++;
    world.enemies = formation(t, world.wave);
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

// True when nothing on screen or already committed can reach the ship: no
// bullets, no charged eyes, no dives under way, and nobody flying in who still
// fires. New launches don't count (see threatOnPath), so the simulation can be skipped.
function nothingCanHit(world: World): boolean {
  if (world.bullets.length) return false;
  return world.enemies.every((e) => {
    if (!e.alive) return true;
    if (e.charge !== null) return false;
    const d = e.diving;
    return !d || d.phase === "home" || d.phase === "settle" || (d.phase === "enter" && d.fired !== 0);
  });
}

// When would a ship parked at `x` first be hit, from now? Follows what's
// already on screen or already committed (not dives or volleys that haven't
// launched yet).
export function threatAt(world: World, x: number, horizon = 2.5) {
  return threatOnPath(world, () => x, horizon);
}

// The same for a ship that is moving: `path(s)` is where it is s seconds from
// now. Runs a copy of the fight with the same code as the real one, so every
// enemy is predicted exactly: a Bat commits to where the path has the ship at
// that moment, and a Cyclops aims at it.
export function threatOnPath(world: World, path: (s: number) => number, horizon = 2.5): { at: number; by: Threat } | null {
  if (!world.alive || nothingCanHit(world)) return null;
  const w = structuredClone(world);
  for (let i = 1; i * SUBSTEP <= horizon + 1e-9; i++) if (step(w, SUBSTEP, { shipX: path(i * SUBSTEP) })) return { at: i * SUBSTEP, by: w.hitBy!.by };
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
export function targetAbove(world: World, x: number): { rowsUp: number; seconds: number; diving: boolean; kind: Kind; hp: number } | null {
  let best: { y: number; diving: boolean; kind: Kind; hp: number } | null = null;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const p = enemyPos(e, world.t);
    if (Math.abs(p.x - x) < 0.5 && p.y < SHIP_ROW && p.y >= 0 && (!best || p.y > best.y)) best = { y: p.y, diving: attacking(e), kind: e.kind, hp: e.hp };
  }
  if (!best) return null;
  const rowsUp = SHIP_ROW - best.y;
  return { rowsUp, seconds: (rowsUp - 0.5) / SHOT_SPEED, diving: best.diving, kind: best.kind, hp: best.hp };
}
