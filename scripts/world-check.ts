// Checks the shooter's rules that the game, Jev's descriptions and the tests depend on.
// Run: pnpm world-check
import { describe, describeFight, describeMoves } from "../lib/describe";
import { bulletsAt, debrisAt, enemyAt, flashAt, shakeAt, startAftermath } from "../lib/game/aftermath";
import { readFileSync } from "node:fs";
import { createCueTracker, type Cue } from "../lib/game/cues";
import { LIBRARY } from "../lib/library";
import { LETTERS, SPRITES } from "../lib/game/sprites";
import { createRecorder, type Death } from "../lib/learn/recorder";
import { afterDeath, emptyBook, type Book } from "../lib/learn/judge";
import { playback, replay, type Decide } from "../lib/learn/replay";
import { parseCoaching, writeRule, type Coaching } from "../lib/system2/coach";
import { fake } from "../lib/system1/fake";
import { instructionsFor, MAX_MOVE_LENGTH, MAX_STATE_LENGTH } from "../lib/system1/types";
import {
  act,
  advance,
  batZigX,
  arriving,
  BEAM_WARN,
  swarming,
  waveRules,
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
  PICKUP_FALL,
  PICKUP_STAYS,
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
// Something already overlapping the ship (left over from keeping it alive): no fair comparison.
const shipTouching = (w: World) => {
  const v = structuredClone(w);
  v.nextDive = v.nextVolley = 1e9;
  return stepN(v, 1) === "hit";
};
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

// Carriers: which kinds carry, by wave, and the carrier makes the wave's second dive.
{
  const w = newWorld(3);
  const carriers = (v: World) => v.enemies.filter((e) => e.carries).map((e) => `${["Cyclops", "Bat", "Drone"][e.kind]}:${e.carries}`).sort().join(",");
  const byWave: string[] = [carriers(w)];
  for (let wave = 2; wave <= 7; wave++) {
    for (const e of w.enemies) e.alive = false;
    stepN(w, 1);
    byWave.push(carriers(w));
  }
  check(
    `carriers by wave: ${byWave.join(" | ")}`,
    JSON.stringify(byWave) ===
      JSON.stringify(["Bat:fan", "Drone:wingmen", "Cyclops:beam", "Bat:fan,Drone:wingmen", "Bat:fan,Cyclops:beam,Drone:wingmen", "Bat:fan,Cyclops:beam,Drone:wingmen", "Bat:fan,Cyclops:beam,Drone:wingmen"]),
  );
  let second = true;
  let seen = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const v = newWorld(seed);
    const carrier = v.enemies.find((e) => e.carries)!;
    let dives = 0;
    for (let i = 0; i < 40 / 0.02 && v.divesThisWave < 2 && carrier.alive; i++) {
      stepN(v, 1);
      immortal(v);
      if (v.divesThisWave !== dives) dives = v.divesThisWave;
    }
    if (v.divesThisWave === 2) {
      seen++;
      if (!carrier.diving) second = false;
    }
  }
  check(`the carrier makes the wave's second dive (${seen} fights)`, second && seen >= 15);
  // and only once each: in a wave with two carriers, dives 2 and 3 send them, then anyone can dive
  const v = newWorld(11);
  for (let wave = 2; wave <= 4; wave++) {
    for (const e of v.enemies) e.alive = false;
    stepN(v, 1);
  }
  const order: number[] = [];
  const started = new Set<number>();
  for (let i = 0; i < 90 / 0.02 && order.length < 10; i++) {
    stepN(v, 1);
    immortal(v);
    for (const e of v.enemies)
      if (e.diving && ["rev", "flap", "open"].includes(e.diving.phase) && !started.has(e.diving.since)) {
        started.add(e.diving.since);
        order.push(e.carries ? 1 : 0);
      }
  }
  check(`with two carriers, dives 2 and 3 are the carriers and later dives are anyone (${order.join("")})`, order.length >= 8 && order[1] === 1 && order[2] === 1 && order.slice(3).filter((c) => c === 1).length <= 2);
}

// A carrier Bat's Fan: every bullet it fires becomes three.
{
  const w = quiet();
  w.ship.x = 7;
  const bat = find(w, 1, 4);
  bat.carries = "fan";
  startDive(w, bat);
  const shots: Bullet[] = [];
  until(w, () => {
    for (const b of w.bullets) if (!shots.includes(b)) shots.push(b);
    return bat.diving?.phase === "commit";
  });
  const drifts = shots.map((b) => b.vx).sort((a, b) => a - b);
  check(`a carrier Bat's two dive shots come as fans of three (${shots.length} bullets, drifts ${[...new Set(drifts)].join(" ")})`, shots.length === 6 && drifts[0] === -2 && drifts[5] === 2 && drifts.filter((v) => v === 0).length === 2);
}

// A carrier Drone's Wingmen fall a column either side of it: one column aside isn't safe, two is.
{
  const run = (shipAfter: number) => {
    const w = quiet();
    w.ship.x = 5;
    const d = find(w, 2, 3);
    d.carries = "wingmen";
    startDive(w, d);
    w.ship.x = shipAfter;
    const minis = new Set<number>();
    const hit = until(w, () => {
      for (const m of w.minis) minis.add(m.x);
      return e0(w) && false;
    }, 6);
    return { hit, by: w.hitBy?.by, minis: [...minis].sort() };
  };
  const e0 = (w: World) => w.minis.length > 0;
  const aside = run(4);
  const clear = run(3);
  check(`two mini-drones fall beside a carrier Drone (x ${aside.minis.join(", ")}), and one column aside is hit by one (${aside.by})`, JSON.stringify(aside.minis) === "[4,6]" && aside.hit === "hit" && aside.by === "Drone");
  check("two columns clear of a carrier Drone is safe", clear.hit === null);
}

// A carrier Cyclops's Eye Beam: no aimed shots, a warning line for 0.8 s, then the column is deadly for 0.5 s.
{
  const w = quiet();
  w.ship.x = 3;
  const c = find(w, 0, 5);
  c.carries = "beam";
  startDive(w, c);
  until(w, () => c.diving?.phase === "park");
  const parked = w.t;
  const predicted = threatAt(w, 3, 2.5);
  const hit = until(w, () => false, 3);
  check(`a ship that stays in the column is hit by the Cyclops beam when it fires (${(w.t - parked).toFixed(2)} s after it parks)`, hit === "hit" && w.hitBy?.by === "Cyclops beam" && near(w.t - parked, BEAM_WARN, 0.03));
  check("the beam's warning replaces the aimed shots", w.bullets.every((b) => b.from !== 0));
  check("threatAt predicts the beam exactly", !!predicted && predicted.by === "Cyclops beam" && near(parked + predicted.at, w.t, 1e-6));
  const v = quiet();
  v.ship.x = 3;
  const c2 = find(v, 0, 5);
  c2.carries = "beam";
  startDive(v, c2);
  until(v, () => c2.diving?.phase === "park");
  v.ship.x = 4.5;
  check("a ship a column and a half away is missed by the beam and the drop", until(v, () => c2.diving?.phase === "home", 5) === null);
  const k = quiet();
  k.ship.x = 3;
  const c3 = find(k, 0, 5);
  c3.carries = "beam";
  startDive(k, c3);
  until(k, () => c3.diving?.phase === "park");
  stepN(k, 10);
  c3.hp = 1;
  const p = enemyPos(c3, k.t);
  k.shots.push({ x: p.x, y: p.y + 0.3, vx: 0, lead: true });
  stepN(k, 1);
  check("shooting a carrier Cyclops during its warning puts the beam out", !c3.alive && k.beams.length === 0 && until(k, () => false, 1.5) === null);
}

// A carrier drops its weapon: it falls to your row, waits 4 s, and gliding onto it takes it.
{
  const w = quiet();
  w.ship.x = 0;
  const bat = find(w, 1, 4);
  bat.carries = "fan";
  const p0 = enemyPos(bat, 0);
  for (const e of w.enemies) if (e.slot.col === 4 && e.kind === 2) e.alive = false;
  w.shots.push({ x: p0.x, y: p0.y + 0.3, vx: 0, lead: true });
  stepN(w, 1);
  const drop = w.pickups[0];
  check("shooting a carrier drops its weapon", !bat.alive && !!drop && drop.weapon === "fan" && drop.x === Math.round(p0.x));
  const from = drop.y;
  const t0 = w.t;
  until(w, () => drop.landed !== null);
  check(`it falls at ${PICKUP_FALL} rows a second to your row (${(w.t - t0).toFixed(2)} s)`, near(w.t - t0, (SHIP_ROW - from) / PICKUP_FALL, 0.03));
  const landed = w.t;
  until(w, () => w.pickups.length === 0, 6);
  check(`left alone, it's gone ${PICKUP_STAYS} s after it lands`, near(w.t - landed, PICKUP_STAYS, 0.03) && w.weapon === null);
  const v = quiet();
  const bat2 = find(v, 1, 4);
  bat2.carries = "fan";
  for (const e of v.enemies) if (e.slot.col === 4 && e.kind === 2) e.alive = false;
  const q = enemyPos(bat2, 0);
  v.shots.push({ x: q.x, y: q.y + 0.3, vx: 0, lead: true });
  stepN(v, 1);
  v.ship.x = v.pickups[0].x;
  until(v, () => v.weapon !== null, 4);
  check("gliding onto it takes it", v.weapon === "fan" && v.pickups.length === 0);
}

// Your weapons.
{
  const w = quiet();
  w.weapon = "fan";
  fire(w);
  check("with the Fan, one shot is three", w.shots.length === 3 && w.shots.filter((s) => s.lead).length === 1);
  stepN(w, 18);
  fire(w);
  stepN(w, 18);
  fire(w);
  check("and a fan counts as one of your three shots on screen", w.shots.filter((s) => s.lead).length === 3 && w.shots.length >= 7);
  const side = w.shots.find((s) => s.vx > 0)!;
  check("its side shots angle out a column for every three rows", near(side.vx, 4, 1e-9));
}
{
  const w = quiet();
  w.weapon = "beam";
  const x = enemyPos(find(w, 0, 4), 0).x;
  w.ship.x = x;
  const before = w.kills;
  fire(w);
  check("your Eye Beam hits everything in your column at once (the Drone and the Bat go, the Cyclops loses one hit)", w.kills === before + 2 && find(w, 0, 4).alive && find(w, 0, 4).hp === 1 && w.shots.length === 0);
  check("and reloads in 0.7 s", near(gunReadyIn(w), 0.7));
}
{
  const w = quiet();
  w.weapon = "wingmen";
  w.wings = [true, true];
  w.ship.x = 4;
  fire(w);
  check("your Wingmen fire with you", JSON.stringify(w.shots.map((s) => s.x).sort()) === "[3,4,5]");
  w.bullets.push(batBullet(5, SHIP_ROW - 2));
  const hit = until(w, () => w.bullets.length === 0, 1);
  check("a bullet that reaches a wingman destroys it instead of the ship", hit === null && w.alive && JSON.stringify(w.wings) === "[true,false]");
  w.pickups.push({ weapon: "fan", x: w.ship.x, y: SHIP_ROW, landed: w.t });
  stepN(w, 1);
  const held = (v: World) => v.weapon;
  check("a second weapon replaces the first", held(w) === "fan" && w.pickups.length === 0);
  w.weapon = "wingmen";
  for (const e of w.enemies) e.alive = false;
  stepN(w, 1);
  check("a weapon lasts until the wave ends", w.weapon === null);
}

// Review fixes, 2026-09-26: the text and cues around carriers match the engine.
{
  const w = quiet();
  w.ship.x = 0;
  const d = find(w, 2, 1);
  d.carries = "wingmen";
  startDive(w, d);
  const said = describeFight(w);
  until(w, () => d.diving?.phase === "fall");
  check(`a carrier Drone at the edge is described with the one mini-drone it brings (${w.minis.length})`, /with a mini-drone falling beside it down x 1\.0/.test(said) && w.minis.length === 1);
  const v = quiet();
  v.weapon = "wingmen";
  v.wings = [true, true];
  const cues = createCueTracker();
  cues.update(v);
  v.pickups.push({ weapon: "fan", x: v.ship.x, y: SHIP_ROW, landed: v.t });
  cues.update(v); // a frame with the Fan on the floor
  stepN(v, 1);
  const heard = cues.update(v).map((c) => c.name);
  check(`swapping Wingmen for another weapon sounds like a grab, not a wingman lost (${heard.join(", ")})`, heard.includes("grab") && !heard.includes("shield"));
}

// Waves escalate (enemy-design.md, section 4).
{
  const rows = Array.from({ length: 12 }, (_, i) => waveRules(i + 1));
  check(
    `speed by wave ${rows.map((r) => r.speed.toFixed(2)).join(" ")}, at once ${rows.map((r) => r.atOnce).join("")}`,
    JSON.stringify(rows.map((r) => +r.speed.toFixed(2))) === JSON.stringify([1, 1, 1.05, 1.1, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.4]) &&
      rows.map((r) => r.atOnce).join("") === "111222223333",
  );
  // a wave-n world: clear waves by hand, formation settled, nothing scheduled
  const at = (wave: number, seed = 1) => {
    const w = newWorld(seed);
    while (w.wave < wave) {
      for (const e of w.enemies) e.alive = false;
      stepN(w, 1);
    }
    w.nextDive = w.nextVolley = 1e9;
    for (const e of w.enemies) e.diving = null;
    return w;
  };
  const kinds2 = new Set<Kind>();
  const w2 = at(2, 4);
  w2.nextDive = w2.t + 1;
  for (let i = 0; i < 120 / 0.02; i++) {
    stepN(w2, 1);
    immortal(w2);
    for (const e of w2.enemies) if (e.diving && ["rev", "flap", "open"].includes(e.diving.phase)) kinds2.add(e.kind);
  }
  check(`from wave 2 all three kinds dive (${[...kinds2].sort().join(", ")})`, kinds2.size === 3);
  // speed: a wave-11 Drone falls 1.4x faster, but a Bat's last leg after it commits still takes a full second
  const fast = at(11);
  const d = find(fast, 2, 3);
  startDive(fast, d);
  until(fast, () => d.diving?.phase === "fall");
  const y0 = d.diving!.y;
  stepN(fast, 10);
  check("a wave-11 Drone falls at 1.4x speed", near((d.diving!.y - y0) / 0.2, 4.5 * 1.4, 0.01));
  const b = find(fast, 1, 4);
  fast.ship.x = 7;
  startDive(fast, b);
  until(fast, () => b.diving?.phase === "commit");
  const committed = fast.t;
  until(fast, () => (b.diving?.y ?? 0) >= SHIP_ROW - 0.6, 3);
  check(`a Bat's commit still gives at least 0.8 s at wave 11 (${(fast.t - committed).toFixed(2)} s)`, fast.t - committed >= 0.8);
  // at once: no dive launches once the wave's limit is taken (escorts ride along until they break away)
  for (const [wave, want] of [[3, 1], [4, 2], [9, 3]] as const) {
    let violations = 0;
    let most = 0;
    let launches = 0;
    for (const seed of [7, 8, 9]) {
      const w = at(wave, seed);
      w.nextDive = w.t + 0.5;
      const counted = () => w.enemies.filter((e) => e.alive && e.diving && !["home", "enter", "settle", "escort"].includes(e.diving.phase) && e.diving.lead < 0).length;
      let before = counted();
      for (let i = 0; i < 60 / 0.02; i++) {
        const limit = waveRules(w.wave).atOnce + (swarming(w) ? 1 : 0);
        stepN(w, 1);
        immortal(w);
        if (w.wave !== wave) break;
        const fresh = w.enemies.filter((e) => e.diving && ["rev", "flap", "open"].includes(e.diving.phase) && near(e.diving.since, w.t, 1e-9) && !e.diving.anchor).length;
        if (fresh) {
          launches++;
          if (before + fresh > limit) violations++;
        }
        before = counted();
        most = Math.max(most, before);
      }
    }
    check(`wave ${wave}: dives launch only while fewer than ${want} are under way (${launches} launches, ${violations} over the limit, up to ${most} out with ex-escorts)`, violations === 0 && launches > 10 && most >= want);
  }
  // escorts
  const w3 = at(3);
  w3.ship.x = 2;
  const c = find(w3, 0, 4);
  startDive(w3, c);
  const escorts = w3.enemies.filter((e) => e.diving?.phase === "escort");
  check(`from wave 3 a diving Cyclops takes the two Bats beside it (${escorts.map((e) => e.slot.col).join(", ")})`, escorts.length === 2 && escorts.every((e) => e.kind === 1 && Math.abs(e.slot.col - 4) === 1));
  stepN(w3, 50);
  const cp = enemyPos(c, w3.t);
  check("they keep station a column out and a row behind", escorts.every((e) => near(Math.abs(e.diving!.x - cp.x), 1, 0.35) && near(e.diving!.y, cp.y - 1, 0.35)));
  until(w3, () => c.diving?.phase === "park");
  stepN(w3, 1);
  check("when it parks, they zigzag down on their own", escorts.every((e) => e.diving?.phase === "zig"));
  const k = at(3);
  const c2 = find(k, 0, 4);
  startDive(k, c2);
  until(k, () => c2.diving?.phase === "slide" && c2.diving.y > 3); // clear of the formation, escorts still with it
  c2.hp = 1;
  const p2 = enemyPos(c2, k.t);
  k.shots.push({ x: p2.x, y: p2.y + 0.3, vx: 0, lead: true });
  stepN(k, 1);
  check(`shooting an escorted Cyclops pays double (${k.score})`, !c2.alive && k.score === 800);
  // mirrored Drone pairs and the second pass, wave 4
  const w4 = at(4);
  for (const e of w4.enemies) if (e.kind !== 2) e.alive = false;
  w4.ship.x = 2;
  w4.nextDive = w4.t;
  stepN(w4, 1);
  const pair = w4.enemies.filter((e) => e.diving?.phase === "rev").map((e) => e.diving!.col).sort();
  check(`from wave 4 Drones dive in mirrored pairs (columns ${pair.join(" and ")})`, JSON.stringify(pair) === "[2,6]");
  w4.nextDive = 1e9;
  const one = w4.enemies.find((e) => e.diving?.col === 2)!;
  w4.ship.x = 4;
  let falls = 0;
  let prevY = 0;
  const hit4 = until(w4, () => {
    const y = one.diving?.y ?? 0;
    if (one.diving?.phase === "fall" && prevY < SHIP_ROW && y >= SHIP_ROW) falls++; // passing the ship's row
    prevY = y;
    return one.diving?.phase === "home";
  }, 12);
  check(`a wave-4 Drone that misses comes back down its column once more, then goes home (${falls} falls)`, hit4 === null && falls === 2 && one.diving?.col === 2);
  // the swarm
  const sw = at(2);
  const keep = [find(sw, 1, 3), find(sw, 2, 5), find(sw, 2, 6), find(sw, 0, 2)];
  for (const e of sw.enemies) if (!keep.includes(e)) e.alive = false;
  sw.ship.x = 7;
  const bat = keep[0];
  startDive(sw, bat);
  sw.ship.x = 0; // it commits to x 0 and misses a ship that moves away
  until(sw, () => bat.diving?.phase === "commit");
  sw.ship.x = 5;
  until(sw, () => bat.diving?.phase === "wrap", 5);
  check("in the swarm a diver that misses doesn't go home: it waits above the screen", bat.diving?.phase === "wrap");
  sw.ship.x = 7;
  const wrapped = sw.t;
  until(sw, () => bat.diving?.phase === "flap", 1);
  check(
    `and dives again ${(sw.t - wrapped).toFixed(2)} s later from the top, toward where the ship is now (first zig ${bat.diving?.dir})`,
    bat.diving?.phase === "flap" && bat.diving.y === 0 && bat.diving.dir === 1 && near(sw.t - wrapped, 0.5, 0.03),
  );
}

// A Cyclops takes two hits.
{
  const w = quiet();
  const c = find(w, 0, 4);
  for (const e of w.enemies) if (e.slot.col === 4 && e.kind !== 0) e.alive = false; // clear its column
  // A shot just under it (the formation drifts, so a shot from the ship could miss).
  const shoot = () => {
    const p = enemyPos(c, w.t);
    w.shots.push({ x: p.x, y: p.y + 0.3, vx: 0, lead: true });
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
    v.shots.push({ x: p.x, y: p.y + 0.3, vx: 0, lead: true });
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

// Jev starts on one line; the rulebook comes with the line that keeps it firing when nothing is coming.
{
  const none = instructionsFor([]);
  const one = instructionsFor(["If a Drone is revving above where you stop, glide to the side where nothing arrives soon."]);
  check(
    "with no rules Jev gets one line, and a rulebook brings the fire-when-clear line with it",
    !none.includes("\n") && /nothing is arriving where you'd stop and an enemy is above, fire\./.test(one) && one.endsWith("nothing arrives soon."),
  );
}

// The public API routes reject anything longer than a real fight: long fights into later waves stay well under the caps.
{
  let longestState = 0;
  let longestMove = 0;
  let waves = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const w = newWorld(seed);
    for (let i = 0; i < 320; i++) {
      const { state, moves } = describe(w);
      longestState = Math.max(longestState, state.length);
      longestMove = Math.max(longestMove, ...Object.values(moves).map((m) => m.length));
      stepN(w, 14);
      immortal(w);
      act(w, (["fire", "left", "fire", "right", "fire", "stay"] as const)[(i + seed) % 6]);
    }
    waves = Math.max(waves, w.wave);
  }
  check(
    `fight descriptions stay under the API caps through wave ${waves} (longest ${longestState} of ${MAX_STATE_LENGTH} chars, move ${longestMove} of ${MAX_MOVE_LENGTH})`,
    longestState * 2 <= MAX_STATE_LENGTH && longestMove * 2 <= MAX_MOVE_LENGTH && waves >= 3,
  );
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

// One attack at a time in wave 1, where the Cyclopes stay in the formation.
{
  const w = newWorld(4);
  let most = 0;
  const kinds = new Set<Kind>();
  for (let i = 0; i < 90 / 0.02; i++) {
    stepN(w, 1);
    for (const e of w.enemies) if (e.diving && !["home", "enter", "settle"].includes(e.diving.phase)) kinds.add(e.kind);
    most = Math.max(most, attacking(w));
    if (!w.alive) {
      w.alive = true;
      w.hitBy = null;
      w.bullets = [];
    }
  }
  check(`never more than one attack at once in wave 1 (most: ${most})`, most === 1);
  check(`in wave 1 Drones and Bats dive and Cyclopes don't (${[...kinds].sort().join(", ")})`, kinds.size === 2 && !kinds.has(0));
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

// ...and in the harder waves: escorts, mirrored pairs, second passes, carriers and the swarm.
{
  let agree = 0;
  let total = 0;
  const names = new Set<string>();
  for (const wave of [3, 4, 9])
    for (let seed = 1; seed <= 25; seed++) {
      const w = newWorld(seed);
      while (w.wave < wave) {
        for (const e of w.enemies) e.alive = false;
        stepN(w, 1);
      }
      if (seed % 3 === 0) for (const e of w.enemies.slice(0, 17)) e.alive = false; // some in the swarm
      w.ship.x = seed % 9;
      for (let i = 0; i < (9 + (seed % 7) * 1.5) / 0.02; i++) {
        stepN(w, 1);
        immortal(w); // a parked ship dies fast in these waves; keep it going until the comparison
      }
      if (shipTouching(w)) continue;
      const predicted = threatAt(w, w.ship.x, 2.5);
      const copy = structuredClone(w);
      copy.nextDive = copy.nextVolley = 1e9;
      const e = advance(copy, 2.5);
      total++;
      if (predicted) names.add(predicted.by);
      if ((predicted === null) === (e === null) && (!predicted || (near(predicted.at, copy.t - w.t, 1e-6) && predicted.by === copy.hitBy?.by))) agree++;
    }
  check(`threatAt matches the simulation in waves 3, 4 and 9 on ${agree}/${total} fights (${[...names].join(", ")})`, agree === total && total > 30);
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
    const hp = new Map(w.enemies.map((e) => [e.id, e.hp])); // before firing: an Eye Beam wounds the moment it fires
    if (i % 14 === 0) {
      const before = w.ship.reloadUntil;
      act(w, (["fire", "left", "fire", "right", "fire", "stay"] as const)[(i / 14) % 6]);
      if (w.ship.reloadUntil !== before) fired++;
    }
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
  check(`one start cue, then one shot or lance cue per trigger pull (${n("shot")} + ${n("lance")} of ${fired})`, n("start") === 1 && n("shot") + n("lance") === fired && fired > 50);
  check(`a pop per kill (${n("pop")} of ${w.kills}), a tink per first Cyclops hit (${n("tink")} of ${wounded})`, n("pop") === w.kills && w.kills > 10 && n("tink") === wounded);
  check(`a boom per hit (${n("boom")} of ${hits}), three swoops per fly-in (${n("swoop")} over ${waves} waves)`, n("boom") === hits && hits > 0 && n("swoop") === 3 * waves);
  check(`a rev per Drone dive (${n("rev")}/${launched.rev}), a flutter per Bat (${n("flutter")}/${launched.flutter}), a loop per Cyclops (${n("loop")}/${launched.loop})`, n("rev") === launched.rev && n("flutter") === launched.flutter && n("loop") === launched.loop && launched.rev > 0);
  const copy = structuredClone(w);
  check("swapping in a replay's world gives one rewind cue and nothing for what's already on screen", JSON.stringify(cues.update(copy, true)) === JSON.stringify([{ name: "rewind" }]) && cues.update(copy, true).length === 0);
}

// After a hit: the death sequence starts from a copy of the world and never changes it.
{
  const w = newWorld(5);
  while (w.alive) {
    act(w, (["fire", "stay", "left", "fire", "right"] as const)[w.steps % 5]);
    stepN(w, 14);
  }
  const before = JSON.stringify(w);
  const a = startAftermath(w);
  const b = startAftermath(w);
  check("the death sequence leaves the dead world untouched and comes out the same every time", JSON.stringify(w) === before && JSON.stringify(a) === JSON.stringify(b));
  const out = a.enemies.filter((e) => e.flight > 0).length;
  const home = a.enemies.every((e) => {
    const p = enemyAt(a, e, a.danceAt);
    return near(p.y, e.row, 1e-9) && near(p.x, e.col + drift(a.tHit + a.danceAt), 1e-9);
  });
  check(`every enemy is back in its slot before the dance (${out} flew home, dance at ${a.danceAt.toFixed(2)} s)`, home && a.danceAt < 2.6);
  let wander = 0;
  for (let s = a.danceAt; s < a.danceAt + 20; s += 0.05)
    for (const e of a.enemies) {
      const p = enemyAt(a, e, s);
      wander = Math.max(wander, Math.abs(p.x - (e.col + drift(a.tHit + s))), Math.abs(p.y - e.row));
    }
  check(`the dance stays within half a cell of each slot (at most ${wander.toFixed(2)})`, wander <= 0.5);
  check("the flash, the shake and the pieces are over within 1.6 s", flashAt(0.2) === 0 && shakeAt(0.8).x === 0 && shakeAt(0.8).y === 0 && debrisAt(a, 1.6).length === 0 && debrisAt(a, 0.1).length > 10);
  check("bullets in the air keep falling off the screen", bulletsAt(a, 3).length === 0);
}

// The Enemy Library: a page for every enemy in the game, saying what the design doc says, with no em dashes.
{
  const doc = readFileSync(new URL("../devpost/enemy-design.md", import.meta.url), "utf8");
  const kinds = new Set(LIBRARY.map((p) => p.kind));
  const texts = LIBRARY.flatMap((p) => [p.lore, p.attack, p.weapon.text, p.spot, p.firstSeen]);
  const missing = texts.filter((t) => !doc.includes(t));
  check(`the library has a page for each of the ${kinds.size} kinds of enemy`, kinds.size === 3 && LIBRARY.length === 3);
  check(`every library paragraph is word for word in enemy-design.md (${missing.length} differ)`, missing.length === 0);
  check("no em dashes in the library", !texts.some((t) => t.includes("\u2014")));
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

// Failing honestly: whatever part of judging a death loses Jev or Nemotron, no
// rule is kept and the rulebook is exactly what it was.
async function failureChecks() {
  // A death: a ship that sits still until something hits it.
  const w = newWorld(5);
  const rec = createRecorder();
  for (let i = 0; i < 600 && w.alive; i++) {
    rec.onAsk({ state: "s", moves: describeMoves(w), rules: [] }, w);
    rec.onDecision({ move: "stay", probabilities: { left: 0, right: 0, stay: 1, fire: 0 }, confidence: 1, source: "simulated" });
    stepN(w, 14);
  }
  const death = rec.toDeath(1, w)!;
  const answer = (move: "left" | "right" | "stay" | "fire") => ({ move, probabilities: { left: 0, right: 0, stay: 0, fire: 0, [move]: 1 }, confidence: 1, source: "simulated" as const });
  const sitStill: Decide = async () => answer("stay");
  const down: Decide = async () => {
    throw new Error("Jev returned 401");
  };
  // Rules make this pilot dodge; without them it sits still, so the death happens again.
  const learner: Decide = async (input) => (input.rules.length ? fake.decide({ ...input, rules: [...input.rules, "a", "b", "c"] }) : answer("stay"));
  const rule: Coaching = { happened: "sat still under a bullet", change: { kind: "add" }, rule: "Move when something arrives within 1 s." };
  const coach = async () => rule;
  const before: Book = { ...emptyBook(), rules: ["An earlier rule."], controls: [{ state: "CALM", moves: death.asked[0].moves }] };
  const same = (b: Book) => JSON.stringify(b.rules) === JSON.stringify(before.rules);

  const v1 = await afterDeath(death, before, { decide: down, coach });
  check(`Jev down while checking the death happens again: not tested, rulebook unchanged (${v1.kind})`, v1.kind === "untested" && same(v1.book) && !!v1.error);

  let asks = 0;
  const failsAfterReproduce: Decide = async (input) => {
    asks++;
    if (input.rules.length > 1) throw new Error("Jev timed out"); // the replay with the new rule
    return sitStill(input);
  };
  const v2 = await afterDeath(death, before, { decide: failsAfterReproduce, coach });
  check(`Jev down partway through the rule's replay: not tested, rulebook unchanged (${v2.kind}, ${asks} questions)`, v2.kind === "untested" && same(v2.book));

  const failsOnControls: Decide = async (input) => {
    if (input.state === "CALM") throw new Error("Jev returned 502");
    return learner(input);
  };
  const v3 = await afterDeath(death, before, { decide: failsOnControls, coach });
  check(`Jev down during the calm-moment check: not tested, rulebook unchanged (${v3.kind})`, v3.kind === "untested" && same(v3.book));

  let coachCalls = 0;
  const nemotronDown = async (): Promise<Coaching> => {
    coachCalls++;
    throw new Error("Token Factory returned 401");
  };
  const v4 = await afterDeath(death, before, { decide: sitStill, coach: nemotronDown });
  check(`Nemotron down: no rule after ${coachCalls} tries, rulebook unchanged (${v4.kind})`, v4.kind === "coach-failed" && coachCalls === 3 && same(v4.book));

  let coachAsks = 0;
  const repeats = async (input: { retry?: string }): Promise<Coaching> => {
    coachAsks++;
    return input.retry ? rule : { happened: "sat still", change: { kind: "add" }, rule: "an earlier rule" };
  };
  const vDup = await afterDeath(death, before, { decide: learner, coach: repeats });
  check(
    `a rule the book already has is turned down before any replay, and the retry is kept (${vDup.kind}, ${vDup.book.rules.length} rules)`,
    vDup.kind === "kept" && vDup.book.rules.length === 2 && coachAsks === 2 && /already rule 1/.test(vDup.attempts[0].why ?? ""),
  );

  const v5 = await afterDeath(death, before, { decide: learner, coach });
  check(`with everything up, the same death gets its rule kept (${v5.kind})`, v5.kind === "kept" && v5.book.rules.length === 2);

  // Fake Jev: labeled SIMULATED, and each rule makes it dodge earlier.
  const moves = { left: "Glide left to about x 2.8. On the way and there: nothing for 2.5+ s; no enemy above.", right: "Glide right to about x 5.3. On the way and there: nothing for 2.5+ s; no enemy above.", stay: "Stop at x 4.0. Here: Bat bullet in 0.9 s.", fire: "Stop at x 4.0 and fire: no enemy above. Here: Bat bullet in 0.9 s." };
  const calm = await fake.decide({ state: "", moves, rules: [] });
  const careful = await fake.decide({ state: "", moves, rules: ["one", "two"] });
  check(`fake Jev is labeled simulated, and with two rules it dodges a bullet 0.9 s away that it ignores with none (${calm.move}, then ${careful.move})`, calm.source === "simulated" && calm.move === "stay" && careful.move !== "stay" && careful.move !== "fire");
}

// The coach: its reply is read even when the model slips on the format, and a
// slow or overloaded Lightning hands the death to Nemotron Nano.
async function coachChecks() {
  const read = (content: string, rules = 0) => {
    try {
      return parseCoaching({ finish_reason: "stop", message: { content } }, rules);
    } catch {
      return null;
    }
  };
  const echoed = read("What happened: stayed under a Cyclops shot.\nChange: add | replace 0 | none\nRule: If a Cyclops shot arrives in under 1 s, pick the option where nothing arrives soon.");
  const oneLine = read("What happened: stayed under a Cyclops shot.\nChange: add | Rule: When a Cyclops shot arrives in under 1 s, pick the option where nothing arrives soon.");
  const plain = read("What happened: stayed.\nChange: replace 1\nRule: Glide away from a revving Drone.", 1);
  const barred = read("What happened: stayed.\nChange: replace | 2\nRule: Glide away from a revving Drone.", 2);
  check(
    "the coach's reply is read when it echoes the template's choices or puts the rule on the change line",
    echoed?.change.kind === "add" && !!echoed.rule?.startsWith("If a Cyclops") && oneLine?.change.kind === "add" && !!oneLine.rule?.startsWith("When a Cyclops") && plain?.change.kind === "replace" && barred?.change.kind === "replace" && barred.change.n === 2,
  );

  const realFetch = globalThis.fetch;
  const realKey = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test";
  const reply = { choices: [{ finish_reason: "stop", message: { content: "What happened: stayed.\nChange: add\nRule: Glide away from a revving Drone." } }], usage: { prompt_tokens: 4000, completion_tokens: 50 } };
  const asked: string[] = [];
  const input = { asked: [], tHit: 1, hitBy: { by: "Drone" as const, x: 4, y: 11 }, rules: [] };
  try {
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      const model = JSON.parse(init.body).model as string;
      asked.push(model);
      if (model.includes("Lightning")) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return new Response(JSON.stringify(reply), { status: 200 });
    }) as typeof fetch;
    const c = await writeRule(input);
    check(`a timed-out Lightning hands the death to Nano (${asked.join(", ")})`, asked.length === 2 && c.model === "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B" && c.rule === "Glide away from a revving Drone.");

    asked.length = 0;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      asked.push(JSON.parse(init.body).model);
      return new Response("{}", { status: 401 });
    }) as typeof fetch;
    const refused = await writeRule(input).then(() => null, (e: Error) => e.message);
    check(`a bad key isn't retried on another model (${refused})`, asked.length === 1 && refused === "Token Factory returned 401");
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = realKey;
  }
}

replayChecks().then(failureChecks).then(coachChecks).then(() => {
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
});
