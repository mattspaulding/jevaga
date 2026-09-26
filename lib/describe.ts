import { COLS, drift, enemyPos, gunReadyIn, SHIP_ROW, targetAbove, threatAt, type Move, type World } from "./game/world";

// Turns the fight into the plain sentences Jev reads, at the moment it's
// asked. Facts only, never a verdict. Times are seconds from now:
//   "bullet in 0.4 s" = a bullet reaches the ship's row in that column in 0.4 s
//   "nothing for 2.5+ s" = clear for now
// The same words go to Nemotron, so its plans line up with what Jev reads.

const s1 = (x: number) => `${x.toFixed(1)} s`;

function incoming(world: World, col: number): string {
  const th = threatAt(world, col);
  return th ? `${th.by} in ${s1(th.at)}` : "nothing for 2.5+ s";
}

function above(world: World, col: number): string {
  const t = targetAbove(world, col);
  if (!t) return "no enemy above";
  return `${t.diving ? "a diver" : "an enemy"} ${t.rowsUp.toFixed(0)} rows up, a shot reaches it in ${s1(t.seconds)}`;
}

export function describeFight(world: World): string {
  const c = world.ship.col;
  const cols = [c - 1, c, c + 1].filter((x) => x >= 0 && x < COLS);
  const ready = gunReadyIn(world);
  const lines = [
    `Your ship is in column ${c} of 0 to ${COLS - 1}, on the bottom row. Gun: ${ready > 0 ? `reloading, ready in ${s1(ready)}` : "ready"}. Times are from now.`,
    `Coming at your row: ${cols.map((x) => `column ${x}: ${incoming(world, x)}`).join("; ")}.`,
    `Above you: ${cols.map((x) => `column ${x}: ${above(world, x)}`).join("; ")}.`,
  ];
  const divers = world.enemies.filter((e) => e.alive && e.diving);
  if (divers.length)
    lines.push(
      `Divers: ${divers
        .map((e) => {
          const p = enemyPos(e, world.t);
          const way = p.x < c - 0.25 ? "moving right toward you" : p.x > c + 0.25 ? "moving left toward you" : "coming straight down at you";
          return `one at column ${p.x.toFixed(1)}, ${(SHIP_ROW - p.y).toFixed(0)} rows up, ${way}`;
        })
        .join("; ")}.`,
    );
  else lines.push("Divers: none right now.");
  const left = world.enemies.filter((e) => e.alive).length;
  const heading = Math.cos(0.6 * world.t) >= 0 ? "right" : "left";
  lines.push(
    `Formation: ${left} enemies left, rows 1 to 3, drifting ${heading} (offset ${drift(world.t).toFixed(1)} columns). Bullets on screen: ${world.bullets.length}. Score ${world.score}, wave ${world.wave}.`,
  );
  return lines.join("\n");
}

// The four moves, each with the facts about where it leaves the ship.
export function describeMoves(world: World): Record<Move, string> {
  const c = world.ship.col;
  const ready = gunReadyIn(world);
  const side = (to: number, dir: string) =>
    to < 0 || to >= COLS ? `Can't move ${dir}: the edge. Same as staying. Column ${c}: ${incoming(world, c)}.` : `Slide ${dir} to column ${to}. Column ${to}: ${incoming(world, to)}.`;
  return {
    left: side(c - 1, "left"),
    right: side(c + 1, "right"),
    stay: `Stay in column ${c}. Column ${c}: ${incoming(world, c)}.`,
    fire:
      ready > 0
        ? `Fire: gun reloading, ready in ${s1(ready)}; nothing happens. Column ${c}: ${incoming(world, c)}.`
        : `Stay in column ${c} and fire: ${above(world, c)}. Column ${c}: ${incoming(world, c)}.`,
  };
}
