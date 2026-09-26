import { DIVE_LOCK_ROW, drift, enemyPos, gunReadyIn, landingX, movePath, restX, SHIP_ROW, targetAbove, threatOnPath, type Move, type World } from "./game/world";

// Turns the fight into the plain sentences Jev reads, at the moment it's
// asked. Facts only, never a verdict. Positions are x from 0 (left) to 8
// (right); times are seconds from now:
//   "bullet in 0.4 s" = a bullet reaches the ship's row at that spot in 0.4 s
//   "nothing for 2.5+ s" = clear for now
// The same words go to Nemotron, so its plans line up with what Jev reads.

const s1 = (x: number) => `${x.toFixed(1)} s`;
const at = (x: number) => `x ${x.toFixed(1)}`;

// What reaches the ship first if it makes `move`, counting everything it
// passes under on the way, not just where it ends up.
function incoming(world: World, move: Move): string {
  const th = threatOnPath(world, movePath(world, move));
  return th ? `${th.by} in ${s1(th.at)}` : "nothing for 2.5+ s";
}

function above(world: World, x: number): string {
  const t = targetAbove(world, x);
  if (!t) return "no enemy above";
  return `${t.diving ? "a diver" : "an enemy"} ${t.rowsUp.toFixed(0)} rows up, a shot reaches it in ${s1(t.seconds)}`;
}

// Your answer lands about a quarter-second after you're asked, so a glide
// under way has finished by then. Everything is measured from where it stops.
function shipLine(world: World): string {
  const x = world.ship.x;
  const rest = restX(world);
  const ready = gunReadyIn(world);
  const where =
    Math.abs(rest - x) < 0.05
      ? `Your ship is at ${at(x)}`
      : `Your ship is at ${at(x)}, gliding ${rest < x ? "left" : "right"}, and stops at ${at(rest)}`;
  return `${where} (0 is the left edge, 8 the right), on the bottom row. Gun: ${ready > 0 ? `reloading, ready in ${s1(ready)}` : "ready"}. Times are from now.`;
}

export function describeFight(world: World): string {
  const x = restX(world);
  const spots: [string, Move][] = [
    ["a little left", "left"],
    ["where you stop", "stay"],
    ["a little right", "right"],
  ];
  const lines = [
    shipLine(world),
    `Coming at your row, counting the way there: ${spots.map(([name, m]) => `${name} (${at(landingX(world, m))}): ${incoming(world, m)}`).join("; ")}.`,
    `Above you: ${above(world, x)}.`,
  ];
  const divers = world.enemies.filter((e) => e.alive && e.diving);
  if (divers.length)
    lines.push(
      `Divers: ${divers
        .map((e) => {
          const p = enemyPos(e, world.t);
          const locked = p.y >= DIVE_LOCK_ROW;
          const way = locked
            ? "falling straight down now, no longer turning"
            : p.x < x - 0.25
              ? "turning toward you from your left"
              : p.x > x + 0.25
                ? "turning toward you from your right"
                : "coming straight down at you, still turning to follow you";
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

// The four moves, each with the facts about where it leaves the ship a quarter-second later.
export function describeMoves(world: World): Record<Move, string> {
  const x = restX(world);
  const ready = gunReadyIn(world);
  const glide = (move: "left" | "right") => {
    const to = landingX(world, move);
    return Math.abs(to - x) < 0.05
      ? `Can't glide ${move}: the edge. Same as staying. Here (${at(x)}): ${incoming(world, "stay")}.`
      : `Glide ${move} to about ${at(to)}. On the way and there: ${incoming(world, move)}; ${above(world, to)}.`;
  };
  return {
    left: glide("left"),
    right: glide("right"),
    stay: `Stop at ${at(x)}. Here: ${incoming(world, "stay")}.`,
    fire:
      ready > 0
        ? `Stop and fire: gun reloading, ready in ${s1(ready)}; no shot. Here (${at(x)}): ${incoming(world, "fire")}.`
        : `Stop at ${at(x)} and fire: ${above(world, x)}. Here: ${incoming(world, "fire")}.`,
  };
}
