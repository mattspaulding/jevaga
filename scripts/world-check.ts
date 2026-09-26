// Checks the shooter's rules that the game, Jev's descriptions and the tests depend on.
// Run: pnpm world-check
import { describe, describeFight, describeMoves } from "../lib/describe";
import { createCueTracker, type Cue } from "../lib/game/cues";
import { LETTERS, SPRITES } from "../lib/game/sprites";
import { createRecorder, type Death } from "../lib/learn/recorder";
import { playback, replay } from "../lib/learn/replay";
import { fake } from "../lib/system1/fake";
import {
  act,
  advance,
  batZigX,
  arriving,
  COMMIT_ROW,
  DECISION_SECONDS,
  drift,
  enemyPos,
  fire,
  gunReadyIn,
  HOVER_ROW,
  landingX,
  movePath,
  newWorld,
  resetRun,
  restX,
  SHIP_ROW,
  SHIP_SPEED,
  startDive,
  steer,
  stepN,
  targetAbove,
  threatAt,
  threatOnPath,
  type Bullet,
  type Enemy,
  type Kind,
  type World,
} from "../lib/game/world";

let failures = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}
const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) < eps;
const batBullet = (x: number, y: number): Bullet => ({ x, y, vx: 0, vy: 7, from: 1 });
const find = (w: World, kind: Kind, col: number) => w.enemies.find((e) => e.kind === kind && e.slot.col === col)!;
const attacking = (w: World) => w.enemies.filter((e) => e.alive && e.diving && !["home", "enter", "settle"].includes(e.diving.phase)).length;
// Steps until `done` is true, the ship is hit, or `seconds` pass.
function until(w: World, done: () => boolean, seconds = 10) {
  for (let i = 0; i < seconds / 0.02 && !done(); i++) if (stepN(w, 1)) return "hit";
  return null;
}
// A fight with nothing scheduled and the formation already in place, so a check sees only what it sets up.
function quiet(seed = 1): World {
  const w = newWorld(seed);
  w.nextDive = w.nextVolley = 1e9;
  for (const e of w.enemies) e.diving = null;
  return w;
}
// Keeps a fight going after a hit, so a check can watch a long stretch of it.
function immortal(w: World) {
  if (w.alive) return;
  w.alive = true;
  w.hitBy = null;
  w.bullets = w.bullets.filter((b) => b.y < SHIP_ROW - 1);
}

// Formation.
{
  const w = quiet();
  check("21 enemies in 3 rows of 7", w.enemies.length === 21 && new Set(w.enemies.map((e) => e.slot.row)).size === 3);
  check("the formation drifts side to side", near(enemyPos(w.enemies[0], 0).x, 1) && near(enemyPos(w.enemies[0], 2.6).x, 1 + drift(2.6)));
}

// The fly-in: every wave starts empty and swoops in, and nothing dives or volleys until it's in place.
{
  const w = newWorld(2);
  check("a new fight starts with all 21 enemies waiting to fly in, off the top", w.enemies.every((e) => e.diving?.phase === "enter" && enemyPos(e, 0).y < -1));
  let deepest = 0;
  let early = 0;
  const shown = new Set<number>();
  const hit = until(w, () => {
    for (const e of w.enemies) if (e.diving?.phase === "enter") deepest = Math.max(deepest, e.diving.y);
    if (w.enemies.some(arriving) && (w.bullets.length || attacking(w))) early++;
    for (const e of w.enemies) if (e.diving?.phase === "enter" && e.diving.y > -1) shown.add(e.id);
    return !w.enemies.some(arriving);
  }, 15);
  check(`every enemy flies in and reaches its slot, in ${w.t.toFixed(1)} s`, hit === null && shown.size === 21 && w.enemies.every((e) => !e.diving && near(enemyPos(e, w.t).y, e.slot.row, 1e-9)) && w.t < 10);
  check(`the fly-in dips no lower than row 9 (deepest ${deepest.toFixed(2)})`, deepest <= 9.001 && deepest > 8.5);
  check("in wave 1 nobody fires on the way in, and nothing dives or volleys until the formation is in place", early === 0);
  const settled = w.t;
  until(w, () => w.bullets.length > 0 || attacking(w) > 0);
  check(`then the fight starts a second later (${(w.t - settled).toFixed(2)} s)`, w.t - settled >= 0.98 && w.t - settled < 1.6);
}
{
  // Clear wave 1 by hand; wave 2 flies in firing.
  const w = quiet();
  for (const e of w.enemies) e.alive = false;
  stepN(w, 1);
  check("clearing a wave starts the next one flying in", w.wave === 2 && w.enemies.every((e) => e.diving?.phase === "enter"));
  const shots = [0, 0, 0];
  const seen = new Set<Bullet>();
  for (let i = 0; i < 15 / 0.02 && w.enemies.some(arriving); i++) {
    stepN(w, 1);
    for (const b of w.bullets)
      if (!seen.has(b)) {
        seen.add(b);
        shots[b.from]++;
      }
    immortal(w);
  }
  check(`from wave 2, every Bat drops a bullet on the way in (${shots[1]} of 7) and every other Cyclops fires an aimed shot (${shots[0]} of 4)`, shots[1] === 7 && shots[0] === 4);
}

// A Cyclops takes two hits.
{
  const w = quiet();
  const c = find(w, 0, 4);
  for (const e of w.enemies) if (e.slot.col === 4 && e.kind !== 0) e.alive = false; // clear its column
  // A shot just under it (the formation drifts, so a shot from the ship could miss).
  const shoot = () => {
    const p = enemyPos(c, w.t);
    w.shots.push({ x: p.x, y: p.y + 0.3 });
    stepN(w, 1);
  };
  shoot();
  w.ship.x = enemyPos(c, w.t).x;
  check("the first hit on a Cyclops doesn't kill it (its eye shuts)", c.alive && c.hp === 1 && w.score === 0);
  check('Jev reads it as "hit once, one more shot kills it"', /hit once, one more shot kills it/.test(describeMoves(w).fire));
  shoot();
  check("the second kills it: 150 in formation", !c.alive && w.score === 150);
  const v = quiet();
  const d = find(v, 0, 2);
  startDive(v, d);
  until(v, () => d.diving?.phase === "slide");
  for (let i = 0; i < 2; i++) {
    const p = enemyPos(d, v.t);
    v.shots.push({ x: p.x, y: p.y + 0.3 });
    stepN(v, 1);
  }
  check("a diving Cyclops is worth 400", !d.alive && v.score === 400);
}

// Continuous steering.
{
  const w = quiet();
  steer(w, -1);
  advance(w, 0.2);
  check(`steering left glides at ${SHIP_SPEED} columns a second (x 4 → ${w.ship.x.toFixed(2)})`, near(w.ship.x, 4 - SHIP_SPEED * 0.2, 0.03));
  check("positions in between are real, not whole columns", Math.abs(w.ship.x - Math.round(w.ship.x)) > 0.01 || near(w.ship.x, 3, 0.03));
  steer(w, 0);
  const x = w.ship.x;
  advance(w, 0.5);
  check("stopping holds the position", near(w.ship.x, x, 1e-9));
  steer(w, -1);
  advance(w, 3);
  check("the ship stops at the left edge", w.ship.x === 0);
  steer(w, 1);
  advance(w, 3);
  check("the ship stops at the right edge", w.ship.x === 8);
  check(`Jev's "left" lands about ${(SHIP_SPEED * 0.25).toFixed(2)} columns over`, near(landingX(w, "left"), 8 - SHIP_SPEED * 0.25));
}

// Jev's glides are one decision long, so its moves go where their descriptions say.
{
  const w = quiet();
  act(w, "left");
  advance(w, 0.6);
  check(`Jev's "left" glides ${DECISION_SECONDS} s and stops (x 4 → ${w.ship.x.toFixed(2)})`, near(w.ship.x, 4 - SHIP_SPEED * DECISION_SECONDS, 0.03) && w.ship.vx === 0);
  const v = quiet();
  act(v, "right");
  advance(v, 0.1);
  check(`mid-glide, Jev is told where the ship stops (x ${v.ship.x.toFixed(2)} → ${restX(v).toFixed(2)})`, near(restX(v), 4 + SHIP_SPEED * DECISION_SECONDS, 0.03));
  check("and its next move is measured from there", near(landingX(v, "right"), 4 + 2 * SHIP_SPEED * DECISION_SECONDS, 0.03));
  act(v, "right");
  advance(v, 0.1);
  check("a second right before the first ends keeps gliding", v.ship.vx > 0);
}

// Shots, reload and kills.
{
  const w = quiet();
  fire(w);
  check("fire launches a shot from the ship", w.shots.length === 1 && w.shots[0].x === 4);
  fire(w);
  check("the gun needs 0.35 s to reload", w.shots.length === 1 && near(gunReadyIn(w), 0.35));
  const t = targetAbove(w, 4);
  check("an enemy is above x 4 with a shot time", !!t && t.seconds > 0.5 && t.seconds < 1.2);
  const before = w.enemies.filter((e) => e.alive).length;
  advance(w, 1.2);
  const after = w.enemies.filter((e) => e.alive).length;
  check("a shot either destroys one enemy (+100) or flies off the top", (after === before - 1 && w.score === 100) || (after === before && w.shots.length === 0));
}
{
  const w = quiet();
  act(w, "right");
  act(w, "fire");
  check('Jev\'s "fire" stops the ship and shoots', w.ship.vx === 0 && w.shots.length === 1);
}

// Bullets.
{
  const w = quiet();
  w.bullets.push(batBullet(4, SHIP_ROW - 3.5));
  const th = threatAt(w, 4);
  check(`threatAt sees the Bat bullet at x 4 in about 0.43 s (got ${th?.at.toFixed(2)})`, !!th && th.by === "Bat bullet" && th.at > 0.35 && th.at < 0.5);
  check("threatAt says x 3 is clear", threatAt(w, 3) === null);
  check("a near miss counts: x 4.4 is still hit, x 4.6 is clear", threatAt(w, 4.4) !== null && threatAt(w, 4.6) === null);
  const e = advance(w, 1);
  check("the bullet hits a ship that stays", e === "hit" && w.t > 0.35 && w.t < 0.5);
}
{
  const w = quiet();
  w.bullets.push(batBullet(4, SHIP_ROW - 3.5));
  steer(w, -1);
  check("gliding out of its way in time dodges it", advance(w, 1) === null);
}

// Drone, "Plunge": locks a column, revs 0.8 s, slides over, falls straight down it, never shoots.
{
  const w = quiet();
  w.ship.x = 6;
  const e = find(w, 2, 2);
  startDive(w, e);
  const d = e.diving!;
  check("a Drone locks onto the ship's column when it starts revving", d.col === 6 && d.phase === "rev");
  w.ship.x = 5; // moving later doesn't change where it falls
  stepN(w, 35);
  check("it revs in its slot for 0.8 s", d.phase === "rev" && near(d.y, 3, 1e-9));
  const xs = new Set<number>();
  const hit = until(w, () => {
    if (d.phase === "fall") xs.add(d.x);
    return e.diving?.phase === "home";
  });
  check("then falls straight down that column, never turning", xs.size === 1 && xs.has(6));
  check("a Drone never shoots", w.bullets.length === 0);
  check("one column aside, the ship isn't hit", hit === null && w.alive);
  until(w, () => e.diving === null);
  check("a Drone that missed flies back to its slot", e.diving === null && near(enemyPos(e, w.t).y, 3, 1e-9));
}
{
  const w = quiet();
  w.ship.x = 6;
  const e = find(w, 2, 2);
  startDive(w, e);
  const before = threatAt(w, 6, 5);
  const hit = until(w, () => false);
  check(`staying in the Drone's column gets the ship hit by the Drone (${w.hitBy?.by} at ${w.t.toFixed(2)} s)`, hit === "hit" && w.hitBy?.by === "Drone");
  check("the plunge takes rev + slide + a 2.2 s fall", w.t > 3.5 && w.t < 4.6);
  check("threatAt predicts it exactly from the start of the rev", !!before && before.by === "Drone" && near(before.at, w.t, 1e-6));
}

// Bat, "Flutter": zigzags on a path fixed at launch, fires at rows 5 and 8, commits once at row 9.
{
  const w = quiet();
  w.ship.x = 7;
  const e = find(w, 1, 4);
  startDive(w, e);
  const d = e.diving!;
  const plan = structuredClone(d);
  check("a Bat's first zig heads toward the ship's side", d.dir === 1 && d.phase === "flap");
  let turns = 0;
  let last = 0;
  let prev = d.x;
  let offPlan = 0;
  const shots: Bullet[] = [];
  until(w, () => {
    for (const b of w.bullets) if (!shots.includes(b)) shots.push(b);
    if (d.phase === "zig") {
      const dx = d.x - prev;
      if (last && dx && Math.sign(dx) !== Math.sign(last)) turns++;
      if (dx) last = dx;
      if (Math.abs(d.x - batZigX(plan, w.t - d.since)) > 1e-9) offPlan++;
    }
    prev = d.x;
    if (d.y > COMMIT_ROW - 0.3) w.ship.x = 2; // the ship moves just before the Bat commits
    return d.phase === "commit";
  });
  check(`it zigzags down (${turns} turns) on exactly the path drawn at launch`, turns >= 3 && offPlan === 0);
  check("it fires straight down twice on the way, at rows 5 and 8", shots.length === 2 && shots.every((b) => b.vx === 0 && b.from === 1));
  check(`at row ${COMMIT_ROW} it reads the ship once and commits to that spot`, near(d.col, 2, 1e-9));
  w.ship.x = 0; // moving after it committed
  let crossed = -1;
  const hit = until(w, () => {
    if (crossed < 0 && d.y >= SHIP_ROW) crossed = d.x;
    return e.diving?.phase === "home";
  });
  check(`it flies straight to the spot it committed to (reached row 13 at x ${crossed.toFixed(2)})`, near(crossed, 2, 0.1));
  check("a ship that moved after the commit is not hit", hit === null);
}
{
  const w = quiet();
  w.ship.x = 7;
  startDive(w, find(w, 1, 4));
  check("a ship still sitting where the Bat committed is hit by the Bat", until(w, () => false) === "hit" && w.hitBy?.by === "Bat");
}

// Cyclops, "Hover": loops, parks over the ship's column at row 6, two aimed shots with a glow before each, then drops.
{
  const w = quiet();
  w.ship.x = 2;
  const e = find(w, 0, 5);
  startDive(w, e);
  const d = e.diving!;
  check("a Cyclops picks the ship's column to park over", d.col === 2 && d.phase === "open");
  w.ship.x = 7;
  until(w, () => d.phase === "park");
  check(`it loops, then parks over that column at row ${HOVER_ROW}`, near(d.x, 2, 1e-9) && near(d.y, HOVER_ROW, 1e-9));
  const parked = w.t;
  until(w, () => w.bullets.length === 1);
  const first = w.bullets[0];
  check(`its eye glows 0.8 s before the first shot (${(w.t - parked).toFixed(2)} s)`, near(w.t - parked, 0.8, 0.03));
  check("the shot flies straight at where the ship was when it fired", near(first.vx / first.vy, (7 - first.x) / (SHIP_ROW - first.y), 1e-9) && first.from === 0);
  w.ship.x = 0;
  until(w, () => w.bullets.length === 2);
  const second = w.bullets[1];
  check("the second shot comes 0.8 s later, aimed at where the ship is then", near(w.t - parked, 1.6, 0.03) && second.vx < 0);
  w.ship.x = 4;
  const xs = new Set<number>();
  const hit = until(w, () => {
    if (d.phase === "drop") xs.add(d.x);
    return e.diving?.phase === "home";
  });
  check("then it drops straight down its column", xs.size === 1 && xs.has(2));
  check("a ship that left the column and dodged the shots is not hit", hit === null);
}
{
  const w = quiet();
  w.ship.x = 7;
  const e = find(w, 0, 5);
  startDive(w, e);
  const d = e.diving!;
  until(w, () => d.phase === "park");
  until(w, () => false, 4);
  check(`an aimed shot reaches where the ship was and hits a ship that stays (${w.hitBy?.by} at x ${w.hitBy?.x.toFixed(2)})`, w.hitBy?.by === "Cyclops shot" && near(w.hitBy.x, 7, 0.15));
}

// A Cyclops at the end of the formation loops without leaving the field (review, 2026-09-26).
{
  let worst = 0;
  for (const col of [1, 7])
    for (let t0 = 0; t0 < 11; t0 += 0.25) {
      const w = quiet();
      stepN(w, Math.round(t0 / 0.02));
      w.ship.x = col === 1 ? 8 : 0; // it heads away from the edge it's looping at
      const e = find(w, 0, col);
      startDive(w, e);
      until(w, () => {
        if (e.diving?.phase === "loop") worst = Math.max(worst, -e.diving.x, e.diving.x - 8);
        return e.diving?.phase === "slide";
      }, 3);
    }
  check(`a Cyclops's opening loop stays on the field from the end slots (worst overshoot ${worst.toFixed(2)})`, worst <= 1e-9);
}

// A revving Drone's "reaching your row in" counts the formation's drift during the rev (review, 2026-09-26).
{
  let worst = 0;
  for (let t0 = 0; t0 < 11; t0 += 0.5)
    for (const shipX of [0, 4, 8]) {
      const w = quiet();
      stepN(w, Math.round(t0 / 0.02));
      w.ship.x = shipX;
      const e = find(w, 2, 2);
      startDive(w, e);
      const said = Number(describeFight(w).match(/a Drone revving .*?reaching your row in (\d+\.\d) s/)?.[1]);
      const t = w.t;
      until(w, () => (e.diving?.y ?? 0) >= SHIP_ROW - 0.6, 6);
      worst = Math.max(worst, Math.abs(w.t - t - said));
    }
  check(`a revving Drone's arrival time is right to the tenth of a second (worst miss ${worst.toFixed(2)} s)`, worst <= 0.13);
}

// One ask describes the fight and the moves from one set of predictions, and says the same as describing them apart.
{
  const w = newWorld(6);
  let same = 0;
  let asks = 0;
  for (let i = 0; i < 90 && w.alive; i++) {
    const both = describe(w);
    asks++;
    if (both.state === describeFight(w) && JSON.stringify(both.moves) === JSON.stringify(describeMoves(w))) same++;
    stepN(w, 14);
    act(w, (["left", "fire", "right", "fire", "stay"] as const)[i % 5]);
  }
  check(`describe() matches describeFight + describeMoves on ${same}/${asks} asks`, same === asks && asks > 40);
}

// In formation: Bats drop straight bullets, a Cyclops fires an aimed shot after its eye glows, Drones never fire.
{
  const w = newWorld(3);
  w.nextDive = 1e9;
  const from = [0, 0, 0];
  let aimedRight = 0;
  let glowedFirst = 0;
  const glowStart = new Map<number, number>();
  for (let i = 0; i < 60 / 0.02; i++) {
    const n = w.bullets.length;
    const charging = new Map(w.enemies.filter((e) => e.charge !== null).map((e) => [e.id, e]));
    stepN(w, 1);
    for (const e of w.enemies) if (e.charge !== null && !glowStart.has(e.id)) glowStart.set(e.id, w.t);
    for (const b of w.bullets.slice(n)) {
      const shooter = w.enemies.find((e) => e.alive && Math.abs(enemyPos(e, w.t).x - b.x) < 1e-9 && Math.abs(e.slot.row + 0.5 - b.y) < 1e-9);
      if (!shooter) continue;
      from[shooter.kind]++;
      if (shooter.kind === 0) {
        if (near(b.vx / b.vy, (w.ship.x - b.x) / (SHIP_ROW - b.y), 1e-9)) aimedRight++;
        const start = glowStart.get(shooter.id);
        if (charging.has(shooter.id) && start !== undefined && near(w.t - start, 0.8, 0.03)) glowedFirst++;
        glowStart.delete(shooter.id);
      }
    }
    if (!w.alive) {
      w.alive = true; // keep going after a hit, to see many volleys
      w.hitBy = null;
      w.bullets = w.bullets.filter((b) => b.y < SHIP_ROW - 1);
    }
  }
  check(`in formation, Bats fire straight bullets (${from[1]}) and Cyclopes aimed shots (${from[0]}); Drones fire none (${from[2]})`, from[1] > 5 && from[0] > 5 && from[2] === 0);
  check(`every Cyclops shot is aimed at the ship and comes after 0.8 s of eye glow (${aimedRight}, ${glowedFirst} of ${from[0]})`, aimedRight === from[0] && glowedFirst === from[0]);
}

// One attack at a time, and every kind takes a turn.
{
  const w = newWorld(4);
  let most = 0;
  const kinds = new Set<Kind>();
  for (let i = 0; i < 90 / 0.02; i++) {
    stepN(w, 1);
    for (const e of w.enemies) if (e.diving && e.diving.phase !== "home") kinds.add(e.kind);
    most = Math.max(most, attacking(w));
    if (!w.alive) {
      w.alive = true;
      w.hitBy = null;
      w.bullets = [];
    }
  }
  check(`never more than one attack at once in wave 1 (most: ${most})`, most === 1);
  check("Drones, Bats and Cyclopes all dive", kinds.size === 3);
}

// A glide is judged by what it passes under, not only where it ends.
{
  const w = quiet();
  w.bullets.push(batBullet(4.6, 10.4));
  const to = landingX(w, "right");
  check(`a bullet at x 4.6 misses a ship parked at x 4 or x ${to.toFixed(2)}`, threatAt(w, 4) === null && threatAt(w, to) === null);
  check("but the glide between them runs into it", threatOnPath(w, movePath(w, "right"))?.by === "Bat bullet");
}

// Prediction agrees with the simulation (ship parked), for every kind of dive in every phase.
{
  let agree = 0;
  let total = 0;
  const names = new Set<string>();
  for (let seed = 1; seed <= 80; seed++) {
    const lead = 1 + (seed % 10) * 2; // from the fly-in into the dives
    const w = newWorld(seed);
    w.ship.x = seed % 9;
    advance(w, lead);
    if (!w.alive) continue;
    const predicted = threatAt(w, w.ship.x, 2.5);
    const copy = structuredClone(w);
    copy.nextDive = copy.nextVolley = 1e9; // prediction ignores launches that haven't happened
    const e = advance(copy, 2.5);
    total++;
    if (predicted) names.add(predicted.by);
    if ((predicted === null) === (e === null) && (!predicted || (near(predicted.at, copy.t - w.t, 1e-6) && predicted.by === copy.hitBy?.by))) agree++;
  }
  check(`threatAt matches the simulation on ${agree}/${total} fights, naming what hits (${[...names].join(", ")})`, agree === total && total > 40 && names.size >= 3);
}

// Same seed, same fight.
{
  const a = newWorld(9);
  const b = resetRun(a);
  advance(a, 10);
  advance(b, 10);
  check("the same seed replays the same fight", a.alive === b.alive && a.bullets.length === b.bullets.length && a.t === b.t);
}

// Descriptions give facts, never verdicts, and name the enemy.
{
  const w = quiet();
  w.bullets.push(batBullet(4, SHIP_ROW - 2));
  const m = describeMoves(w);
  check('stopping under a bullet is described as "Bat bullet in …"', /Here: Bat bullet in 0\.\d s/.test(m.stay));
  check("move descriptions never say safe/unsafe", !Object.values(m).some((s) => /\b(safe|unsafe|danger|best)\b/i.test(s)));
  const v = quiet();
  startDive(v, find(v, 2, 4));
  startDive(v, find(v, 1, 2));
  startDive(v, find(v, 0, 6));
  const f = describeFight(v);
  check("each dive is described by its enemy's name and plan", /a Drone revving .* locked on x 4\.0/.test(f) && /a Bat zigzagging down/.test(f) && /a Cyclops looping .* park over x 4\.0/.test(f));
  const drone = find(v, 2, 4);
  until(v, () => drone.diving?.phase === "fall" && drone.diving.y > 9);
  check(`a falling Drone reads as "Drone in …" (${describeMoves(v).stay})`, /Here: Drone in \d\.\d s/.test(describeMoves(v).stay));
}

// Sound cues come off the fight frame by frame: one per thing that happened, none for a swapped-in replay.
{
  const w = newWorld(5);
  const cues = createCueTracker();
  const heard: Record<string, number> = {};
  const hear = (cs: Cue[]) => cs.forEach((c) => (heard[c.name] = (heard[c.name] ?? 0) + 1));
  hear(cues.update(w));
  let fired = 0;
  let hits = 0;
  let launched = { rev: 0, flutter: 0, loop: 0 };
  let wounded = 0;
  let waves = 1;
  for (let i = 0; i < 120 / 0.02; i++) {
    if (i % 14 === 0) {
      const before = w.ship.reloadUntil;
      act(w, (["fire", "left", "fire", "right", "fire", "stay"] as const)[(i / 14) % 6]);
      if (w.ship.reloadUntil !== before) fired++;
    }
    const hp = new Map(w.enemies.map((e) => [e.id, e.hp]));
    const wave = w.wave;
    stepN(w, 1);
    if (w.wave !== wave) waves++;
    else for (const e of w.enemies) if (e.kind === 0 && hp.get(e.id) === 2 && e.hp === 1) wounded++;
    for (const e of w.enemies)
      if (e.diving && e.diving.since === w.t && ["rev", "flap", "open"].includes(e.diving.phase))
        launched = { ...launched, [({ rev: "rev", flap: "flutter", open: "loop" } as Record<string, "rev" | "flutter" | "loop">)[e.diving.phase]]: launched[({ rev: "rev", flap: "flutter", open: "loop" } as Record<string, "rev" | "flutter" | "loop">)[e.diving.phase]] + 1 };
    if (!w.alive) hits++;
    hear(cues.update(w));
    if (!w.alive) {
      immortal(w); // a real hit ends the run; here the fight goes on, and the next frame sees the ship alive again
      hear(cues.update(w));
    }
    if (i % 3 === 0) hear(cues.update(w)); // frames and steps don't line up; a second look changes nothing
  }
  const n = (k: string) => heard[k] ?? 0;
  check(`one start cue, then a shot cue per shot fired (${n("shot")} of ${fired})`, n("start") === 1 && n("shot") === fired && fired > 50);
  check(`a pop per kill (${n("pop")} of ${w.kills}), a tink per first Cyclops hit (${n("tink")} of ${wounded})`, n("pop") === w.kills && w.kills > 10 && n("tink") === wounded);
  check(`a boom per hit (${n("boom")} of ${hits}), three swoops per fly-in (${n("swoop")} over ${waves} waves)`, n("boom") === hits && hits > 0 && n("swoop") === 3 * waves);
  check(`a rev per Drone dive (${n("rev")}/${launched.rev}), a flutter per Bat (${n("flutter")}/${launched.flutter}), a loop per Cyclops (${n("loop")}/${launched.loop})`, n("rev") === launched.rev && n("flutter") === launched.flutter && n("loop") === launched.loop && launched.rev > 0);
  const copy = structuredClone(w);
  check("swapping in a replay's world gives one rewind cue and nothing for what's already on screen", JSON.stringify(cues.update(copy, true)) === JSON.stringify([{ name: "rewind" }]) && cues.update(copy, true).length === 0);
}

// The sprite grids copied from the design canvas are well formed.
{
  const bad = Object.entries(SPRITES).filter(
    ([, rows]) => rows.some((r) => r.length !== rows[0].length) || [...rows.join("")].some((ch) => !LETTERS.has(ch)),
  );
  check(`all ${Object.keys(SPRITES).length} sprites are rectangular and use only the legend's letters`, bad.length === 0);
  const needed = ["ship", "ship-thrust", "shot", "bullet", "bullet-aim", "star-bright", ...[0, 1, 2].flatMap((k) => [`enemy${k}-a`, `enemy${k}-b`, `dive${k}`])];
  const frames = [1, 2, 3].map((n) => `pop-${n}`).concat([1, 2, 3, 4].map((n) => `boom-${n}`));
  check("every sprite the renderer draws exists", [...needed, ...frames].every((n) => n in SPRITES));
}

// Replays depend on a copied fight playing out exactly like the original.
{
  const w = newWorld(5);
  const plan: [number, "left" | "right" | "stay" | "fire"][] = [
    [40, "left"], [14, "fire"], [30, "right"], [14, "fire"], [25, "stay"], [14, "fire"], [60, "left"], [14, "fire"],
  ];
  stepN(w, 700); // 14 s in: after the fly-in, a dive and volleys under way
  const copy = structuredClone(w);
  check("a world is plain data (the copy equals the original)", JSON.stringify(copy) === JSON.stringify(w));
  for (const world of [w, copy])
    for (const [n, move] of plan) {
      stepN(world, n);
      act(world, move);
    }
  stepN(w, 400);
  stepN(copy, 400);
  check("a copied world plays out the same with the same moves (same dives, volleys, score, fate)", JSON.stringify(copy) === JSON.stringify(w));
  check("the random state travels with the copy", copy.rngState === w.rngState && copy.rngState !== newWorld(5).rngState);
}

// A recorded death replays deterministically, and playback shows exactly the replayed flight.
async function replayChecks() {
  const w = newWorld(5);
  const rec = createRecorder();
  let death: Death | null = null;
  for (let i = 0; i < 400 && w.alive; i++) {
    const input = { state: "s", moves: describeMoves(w), rules: [] };
    rec.onAsk(input, w);
    rec.onDecision({ move: "stay", probabilities: { left: 0, right: 0, stay: 1, fire: 0 }, confidence: 1, source: "simulated" });
    stepN(w, 14);
  }
  death = rec.toDeath(1, w);
  check("a ship that never moves dies, and the recorder turns it into a death", death !== null && death.hitBy !== null);
  if (death) {
    check("the replay starts about 1.5 s before the hit", near(death.tHit - death.start.t, 1.5, 0.3));
    const sitStill = async () => ({ move: "stay" as const, probabilities: { left: 0, right: 0, stay: 1, fire: 0 }, confidence: 1, source: "simulated" as const });
    const d = death;
    const again = await replay(d, [], sitStill);
    check(`sitting still again dies again (${again.outcome})`, again.outcome === "hit");
    const dodger = await replay(d, [], fake.decide);
    const pb = playback(d, dodger);
    while (!pb.done()) pb.step();
    check(`playback ends exactly where the replay did (${dodger.outcome}, ${dodger.moves.length} moves)`, JSON.stringify(pb.world) === JSON.stringify(dodger.final));
    const twice = await replay(d, [], fake.decide);
    check("the same replay twice gives the same flight", JSON.stringify(twice.final) === JSON.stringify(dodger.final));
  }

  // A live flight with slow answers (20 steps) and one question lost to an outage:
  // replaying Jev's own answers must still retrace it to the exact step, even when
  // the unanswered last question is answered "left" in the replay.
  {
    const w = newWorld(5);
    const rec2 = createRecorder();
    const picks: ("left" | "right" | "stay" | "fire")[] = ["fire", "left", "fire", "right", "stay", "fire"];
    let k = 0;
    for (let i = 0; i < 600 && w.alive; i++) {
      rec2.onAsk({ state: "s", moves: describeMoves(w), rules: [] }, w);
      if (i === 5) {
        rec2.onAskFailed(); // an outage: no answer, the fight runs on without a move
        if (stepN(w, 125)) break;
        continue;
      }
      if (stepN(w, 20)) break; // the hit came before this answer
      const move = picks[k++ % picks.length];
      act(w, move);
      rec2.onDecision({ move, probabilities: { left: 0, right: 0, stay: 0, fire: 0, [move]: 1 }, confidence: 1, source: "simulated" });
    }
    const slow = rec2.toDeath(2, w);
    check("a slow flight with an outage still dies and records a death", slow !== null);
    if (slow) {
      let i = 0;
      const own = async () => {
        const a = slow.asked[i++];
        const move = a ? a.pick : ("left" as const);
        return { move, probabilities: { left: 0, right: 0, stay: 0, fire: 0, [move]: 1 }, confidence: 1, source: "simulated" as const };
      };
      const r = await replay(slow, [], own);
      check(`with Jev's own answers it retraces to the exact step (${r.outcome} at step ${r.final.steps}, died at ${slow.hitStep})`, r.outcome === "hit" && r.final.steps === slow.hitStep);
      check("the lost question left no beat in the recording", slow.schedule.filter((b) => b.answer === null).length <= 1);
    }
  }
}

replayChecks().then(() => {
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
});
