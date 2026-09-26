// Checks the shooter's rules that the game, Jev's descriptions and the tests depend on.
// Run: pnpm world-check
import { describeMoves } from "../lib/describe";
import { LETTERS, SPRITES } from "../lib/game/sprites";
import { createRecorder, type Death } from "../lib/learn/recorder";
import { playback, replay } from "../lib/learn/replay";
import { fake } from "../lib/system1/fake";
import {
  act,
  advance,
  DECISION_SECONDS,
  DIVE_LOCK_ROW,
  drift,
  enemyPos,
  fire,
  gunReadyIn,
  landingX,
  movePath,
  newWorld,
  resetRun,
  restX,
  SHIP_ROW,
  SHIP_SPEED,
  steer,
  stepN,
  targetAbove,
  threatAt,
  threatOnPath,
  type World,
} from "../lib/game/world";

let failures = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}
const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) < eps;
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
  w.bullets.push({ x: 4, y: SHIP_ROW - 3.5 });
  const th = threatAt(w, 4);
  check(`threatAt sees the bullet at x 4 in about 0.43 s (got ${th?.at.toFixed(2)})`, !!th && th.by === "bullet" && th.at > 0.35 && th.at < 0.5);
  check("threatAt says x 3 is clear", threatAt(w, 3) === null);
  check("a near miss counts: x 4.4 is still hit, x 4.6 is clear", threatAt(w, 4.4) !== null && threatAt(w, 4.6) === null);
  const e = advance(w, 1);
  check("the bullet hits a ship that stays", e === "hit" && w.t > 0.35 && w.t < 0.5);
}
{
  const w = quiet();
  w.bullets.push({ x: 4, y: SHIP_ROW - 3.5 });
  steer(w, -1);
  check("gliding out of its way in time dodges it", advance(w, 1) === null);
}

// Divers steer toward the ship and fire.
{
  const w = quiet();
  w.ship.x = 6;
  const d = w.enemies[0];
  d.diving = { x: 1, y: 1, fired: 0 };
  advance(w, 1.4);
  check("a diver steers toward the ship", d.diving !== null && d.diving.x > 3);
  check("a diver fires on its way down", w.bullets.length >= 1);
}

// Near the bottom a diver stops turning, so moving aside in time gets clear.
{
  const w = quiet();
  const d = w.enemies[0];
  d.diving = { x: 4, y: DIVE_LOCK_ROW + 0.1, fired: 2 };
  w.ship.x = 6;
  advance(w, 0.3);
  check("a diver below the lock row falls straight", d.diving !== null && near(d.diving.x, 4, 1e-9));
  const v = quiet();
  v.enemies[0].diving = { x: 4, y: DIVE_LOCK_ROW + 0.1, fired: 2 };
  check("threatAt: parked under it, it hits", threatAt(v, 4)?.by === "diver");
  check("threatAt: 1.25 columns aside is clear", threatAt(v, 4 + SHIP_SPEED * DECISION_SECONDS) === null);
}

// A glide is judged by what it passes under, not only where it ends.
{
  const w = quiet();
  w.bullets.push({ x: 4.6, y: 10.4 });
  const to = landingX(w, "right");
  check(`a bullet at x 4.6 misses a ship parked at x 4 or x ${to.toFixed(2)}`, threatAt(w, 4) === null && threatAt(w, to) === null);
  check("but the glide between them runs into it", threatOnPath(w, movePath(w, "right"))?.by === "bullet");
}

// Prediction agrees with the simulation (ship parked).
{
  let agree = 0;
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const lead = 1 + (seed % 4) * 0.5;
    const w = newWorld(seed);
    advance(w, lead);
    if (!w.alive) continue;
    const predicted = threatAt(w, w.ship.x, 2.5);
    const copy = newWorld(seed);
    advance(copy, lead);
    copy.nextDive = copy.nextVolley = 1e9; // prediction ignores launches that haven't happened
    const e = advance(copy, 2.5);
    total++;
    if ((predicted === null) === (e === null) && (!predicted || near(predicted.at, copy.t - lead, 0.06))) agree++;
  }
  check(`threatAt matches the simulation on ${agree}/${total} fights`, agree === total && total > 20);
}

// Same seed, same fight.
{
  const a = newWorld(9);
  const b = resetRun(a);
  advance(a, 10);
  advance(b, 10);
  check("the same seed replays the same fight", a.alive === b.alive && a.bullets.length === b.bullets.length && a.t === b.t);
}

// Descriptions give facts, never verdicts.
{
  const w = quiet();
  w.bullets.push({ x: 4, y: SHIP_ROW - 2 });
  const m = describeMoves(w);
  check('stopping under a bullet is described as "bullet in …"', /Here: bullet in 0\.\d s/.test(m.stay));
  check("move descriptions never say safe/unsafe", !Object.values(m).some((s) => /\b(safe|unsafe|danger|best)\b/i.test(s)));
}

// The sprite grids copied from the design canvas are well formed.
{
  const bad = Object.entries(SPRITES).filter(
    ([, rows]) => rows.some((r) => r.length !== rows[0].length) || [...rows.join("")].some((ch) => !LETTERS.has(ch)),
  );
  check(`all ${Object.keys(SPRITES).length} sprites are rectangular and use only the legend's letters`, bad.length === 0);
  const needed = ["ship", "ship-thrust", "shot", "bullet", "star-bright", ...[0, 1, 2].flatMap((k) => [`enemy${k}-a`, `enemy${k}-b`, `dive${k}`])];
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
