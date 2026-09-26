// Checks the shooter's rules that the game, Jev's descriptions and the tests depend on.
// Run: pnpm world-check
import { describeMoves } from "../lib/describe";
import { act, advance, drift, enemyPos, gunReadyIn, newWorld, resetRun, SHIP_ROW, targetAbove, threatAt, type World } from "../lib/game/world";

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

// Ship moves and edges.
{
  const w = quiet();
  act(w, "left");
  check("left moves one column", w.ship.col === 3);
  for (let i = 0; i < 6; i++) act(w, "left");
  check("the ship stops at the left edge", w.ship.col === 0);
  for (let i = 0; i < 12; i++) act(w, "right");
  check("the ship stops at the right edge", w.ship.col === 8);
}

// Shots, reload and kills.
{
  const w = quiet();
  w.ship.col = 4;
  act(w, "fire");
  check("fire launches a shot", w.shots.length === 1);
  act(w, "fire");
  check("the gun needs 0.35 s to reload", w.shots.length === 1 && near(gunReadyIn(w), 0.35));
  const t = targetAbove(w, 4);
  check("an enemy is above column 4 with a shot time", !!t && t.seconds > 0.5 && t.seconds < 1.2);
  const before = w.enemies.filter((e) => e.alive).length;
  advance(w, 1.2);
  // Column 4 lines up with a formation enemy only while the drift is near zero; check a kill or a clean miss.
  const after = w.enemies.filter((e) => e.alive).length;
  check("a shot either destroys one enemy (+100) or flies off the top", (after === before - 1 && w.score === 100) || (after === before && w.shots.length === 0));
}

// Bullets fall down their column and hit the ship only in that column.
{
  const w = quiet();
  w.ship.col = 4;
  w.bullets.push({ col: 4, y: SHIP_ROW - 3.5 });
  const th = threatAt(w, 4);
  check(`threatAt sees the bullet at column 4 in about 0.43 s (got ${th?.at.toFixed(2)})`, !!th && th.by === "bullet" && th.at > 0.35 && th.at < 0.5);
  check("threatAt says column 3 is clear", threatAt(w, 3) === null);
  const e = advance(w, 1);
  check("the bullet hits a ship that stays", e === "hit" && w.t > 0.35 && w.t < 0.5);
}
{
  const w = quiet();
  w.ship.col = 4;
  w.bullets.push({ col: 4, y: SHIP_ROW - 3.5 });
  advance(w, 0.1);
  act(w, "left");
  check("sliding out of the column dodges it", advance(w, 1) === null);
}
{
  const w = quiet();
  w.ship.col = 4;
  w.bullets.push({ col: 3, y: SHIP_ROW - 0.2 });
  check("sliding into a bullet is a hit", act(w, "left") === "hit");
}

// Divers steer toward the ship and fire.
{
  const w = quiet();
  w.ship.col = 6;
  const d = w.enemies[0];
  d.diving = { x: 1, y: 1, fired: 0 };
  advance(w, 1.4);
  check("a diver steers toward the ship's column", d.diving !== null && d.diving.x > 3);
  check("a diver fires on its way down", w.bullets.length >= 1);
}

// Prediction agrees with the simulation.
{
  let agree = 0;
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const w = newWorld(seed);
    advance(w, 1 + (seed % 4) * 0.5);
    if (!w.alive) continue;
    const predicted = threatAt(w, w.ship.col, 2.5);
    const copy = newWorld(seed);
    advance(copy, 1 + (seed % 4) * 0.5);
    copy.nextDive = copy.nextVolley = 1e9; // prediction ignores launches that haven't happened
    const e = advance(copy, 2.5);
    total++;
    if ((predicted === null) === (e === null) && (!predicted || near(predicted.at, copy.t - (1 + (seed % 4) * 0.5), 0.06))) agree++;
  }
  check(`threatAt matches the simulation on ${agree}/${total} fights`, agree === total);
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
  w.ship.col = 4;
  w.bullets.push({ col: 4, y: SHIP_ROW - 2 });
  const m = describeMoves(w);
  check('staying under a bullet is described as "bullet in …"', /Column 4: bullet in 0\.\d s/.test(m.stay));
  check("move descriptions never say safe/unsafe", !Object.values(m).some((s) => /\b(safe|unsafe|danger|best)\b/i.test(s)));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
