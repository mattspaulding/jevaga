import { drift, enemyPos, gunReadyIn, landingX, SHIP_ROW, targetAbove, threatAt, type Move, type World } from "./game/world";

// Turns the fight into the plain sentences Jev reads, at the moment it's
// asked. Facts only, never a verdict. Positions are x from 0 (left) to 8
// (right); times are seconds from now:
//   "bullet in 0.4 s" = a bullet reaches the ship's row at that spot in 0.4 s
//   "nothing for 2.5+ s" = clear for now
// The same words go to Nemotron, so its plans line up with what Jev reads.

const s1 = (x: number) => `${x.toFixed(1)} s`;
const at = (x: number) => `x ${x.toFixed(1)}`;

function incoming(world: World, x: number): string {
  const th = threatAt(world, x);
  return th ? `${th.by} in ${s1(th.at)}` : "nothing for 2.5+ s";
}

function above(world: World, x: number): string {
  const t = targetAbove(world, x);
  if (!t) return "no enemy above";
  return `${t.diving ? "a diver" : "an enemy"} ${t.rowsUp.toFixed(0)} rows up, a shot reaches it in ${s1(t.seconds)}`;
}

export function describeFight(world: World): string {
  const x = world.ship.x;
  const ready = gunReadyIn(world);
  const spots: [string, number][] = [
    ["a little left", landingX(world, "left")],
    ["where you are", x],
    ["a little right", landingX(world, "right")],
  ];
  const lines = [
    `Your ship is at ${at(x)} (0 is the left edge, 8 the right), on the bottom row. Gun: ${ready > 0 ? `reloading, ready in ${s1(ready)}` : "ready"}. Times are from now.`,
    `Coming at your row: ${spots.map(([name, p]) => `${name} (${at(p)}): ${incoming(world, p)}`).join("; ")}.`,
    `Above you: ${above(world, x)}.`,
  ];
  const divers = world.enemies.filter((e) => e.alive && e.diving);
  if (divers.length)
    lines.push(
      `Divers: ${divers
        .map((e) => {
          const p = enemyPos(e, world.t);
          const way = p.x < x - 0.25 ? "coming from your left" : p.x > x + 0.25 ? "coming from your right" : "coming straight down at you";
          return `one at ${at(p.x)}, ${(SHIP_ROW - p.y).toFixed(0)} rows up, ${way}`;
        })
        .join("; ")}.`,
    );
  else lines.push("Divers: none right now.");
  const left = world.enemies.filter((e) => e.alive).length;
  const heading = Math.cos(0.6 * world.t) >= 0 ? "right" : "left";
  lines.push(
    `Formation: ${left} enemies left, rows 1 to 3, drifting ${heading} (offset ${drift(world.t).toFixed(1)}). Bullets on screen: ${world.bullets.length}. Score ${world.score}, wave ${world.wave}.`,
  );
  return lines.join("\n");
}

// The four moves, each with the facts about where it leaves the ship about a quarter-second later.
export function describeMoves(world: World): Record<Move, string> {
  const x = world.ship.x;
  const ready = gunReadyIn(world);
  const glide = (move: "left" | "right") => {
    const to = landingX(world, move);
    return Math.abs(to - x) < 0.05
      ? `Can't glide ${move}: the edge. Same as staying. Here (${at(x)}): ${incoming(world, x)}.`
      : `Glide ${move} to about ${at(to)}. There: ${incoming(world, to)}.`;
  };
  return {
    left: glide("left"),
    right: glide("right"),
    stay: `Stop at ${at(x)}. Here: ${incoming(world, x)}.`,
    fire:
      ready > 0
        ? `Stop and fire: gun reloading, ready in ${s1(ready)}; no shot. Here (${at(x)}): ${incoming(world, x)}.`
        : `Stop at ${at(x)} and fire: ${above(world, x)}. Here: ${incoming(world, x)}.`,
  };
}
