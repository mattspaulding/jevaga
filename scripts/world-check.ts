// Checks the shooter's rules that the game, Jev's descriptions and the tests depend on.
// Run: pnpm world-check
import { describeFight, describeMoves } from "../lib/describe";
import { LETTERS, SPRITES } from "../lib/game/sprites";
import { createRecorder, type Death } from "../lib/learn/recorder";
import { playback, replay } from "../lib/learn/replay";
import { fake } from "../lib/system1/fake";
import {
  act,
  advance,
  batZigX,
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
const attacking = (w: World) => w.enemies.filter((e) => e.alive && e.diving && e.diving.phase !== "home").length;
// Steps until `done` is true, the ship is hit, or `seconds` pass.
function until(w: World, done: () => boolean, seconds = 10) {
  for (let i = 0; i < seconds / 0.02 && !done(); i++) if (stepN(w, 1)) return "hit";
  return null;
}
// A fight with nothing scheduled, so a check sees only what it sets up.
function quiet(seed = 1): World {
  const w = newWorld(seed);
  w.nextDive = w.nextVolley = 1e9;
  return w;
}

// Formation.
{
  const w = newWorld(1);
  check("21 enemies in 3 rows of 7", w.enemies.length === 21 && new Set(w.enemies.map((e) => e.slot.row)).size === 3);
  check("the formation drifts side to side", near(enemyPos(w.enemies[0], 0).x, 1) && near(enemyPos(w.enemies[0], 2.6).x, 1 + drift(2.6)));
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
    const lead = 1 + (seed % 10) * 0.6;
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
  stepN(w, 150); // 3 s in, a dive and volleys already under way
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
