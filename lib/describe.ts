import {
  BAT_COMMIT,
  BAT_FLAP,
  batCommitAge,
  COMMIT_ROW,
  CY_DROP,
  CY_GLOW,
  DRONE_FALL,
  DRONE_REV,
  DRONE_SLIDE,
  drift,
  enemyPos,
  gunReadyIn,
  HOVER_ROW,
  KIND_NAME,
  landingX,
  movePath,
  restX,
  SHIP_ROW,
  targetAbove,
  threatOnPath,
  type Enemy,
  type Move,
  type World,
} from "./game/world";

// Turns the fight into the plain sentences Jev reads, at the moment it's
// asked. Facts only, never a verdict. Positions are x from 0 (left) to 8
// (right); times are seconds from now:
//   "Bat bullet in 0.4 s" = a Bat's bullet reaches the ship's row at that spot in 0.4 s
//   "Drone in 0.6 s" = a diving Drone reaches the ship there in 0.6 s
//   "nothing for 2.5+ s" = clear for now
// The same words go to Nemotron, so its rules line up with what Jev reads.

// What an option's text says arrives first, and when ("Drone in 0.6 s").
export const ARRIVAL = /\b(?:Drone|Bat|Cyclops)(?: bullet| shot)? in (\d+(?:\.\d+)?) s/;

const s1 = (x: number) => `${x.toFixed(1)} s`;
const at = (x: number) => `x ${x.toFixed(1)}`;
const rowsUp = (y: number) => `${Math.max(0, SHIP_ROW - y).toFixed(0)} rows up`;

// What reaches the ship first if it makes `move`, counting everything it
// passes under on the way, not just where it ends up.
function incoming(world: World, move: Move): string {
  const th = threatOnPath(world, movePath(world, move));
  return th ? `${th.by} in ${s1(th.at)}` : "nothing for 2.5+ s";
}

function above(world: World, x: number): string {
  const t = targetAbove(world, x);
  if (!t) return "no enemy above";
  return `${t.diving ? "a diving" : "a"} ${KIND_NAME[t.kind]} ${t.rowsUp.toFixed(0)} rows up, a shot reaches it in ${s1(t.seconds)}`;
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

// One diving enemy, in the words of its plan. Arrival times here are where
// its plan takes it, not a verdict on any move.
function diveLine(world: World, e: Enemy): string | null {
  const d = e.diving!;
  const age = world.t - d.since;
  const col = at(d.col);
  switch (d.phase) {
    case "rev": {
      const start = DRONE_REV - age;
      const reach = start + Math.abs(d.x - d.col) / DRONE_SLIDE + (SHIP_ROW - d.y) / DRONE_FALL;
      return `a Drone revving in the formation, locked on ${col}: in ${s1(start)} it moves over and falls straight down ${col}, reaching your row in ${s1(reach)}. Drones never turn or shoot`;
    }
    case "slide":
      if (e.kind === 2)
        return `a Drone moving over to ${col}, then falling straight down it, reaching your row in ${s1(Math.abs(d.x - d.col) / DRONE_SLIDE + (SHIP_ROW - d.y) / DRONE_FALL)}`;
      return `a Cyclops at ${at(d.x)} heading to park over ${col}, ${rowsUp(HOVER_ROW)}; there it shoots twice at where you are then, and then drops straight down ${col}`;
    case "fall":
      return `a Drone falling straight down ${col}, ${rowsUp(d.y)}, never turns, reaching your row in ${s1((SHIP_ROW - d.y) / DRONE_FALL)}`;
    case "flap":
    case "zig": {
      const commit = d.phase === "zig" ? batCommitAge(d) - age : BAT_FLAP - age + batCommitAge(d);
      return `a Bat zigzagging down at ${at(d.x)}, ${rowsUp(d.y)}, firing straight down at rows 5 and 8; at row ${COMMIT_ROW} in ${s1(Math.max(0, commit))} it turns once toward wherever you are then`;
    }
    case "commit":
      return `a Bat committed to ${col}, ${rowsUp(d.y)}, flying straight at it, reaching your row in ${s1((SHIP_ROW - d.y) / BAT_COMMIT)}`;
    case "open":
    case "loop":
      return `a Cyclops looping out of the formation, heading to park over ${col}, ${rowsUp(HOVER_ROW)}; there it shoots twice at where you are then, and then drops straight down ${col}`;
    case "park": {
      const next = CY_GLOW * (d.fired + 1) - age;
      return `a Cyclops parked over ${col}, ${rowsUp(d.y)}, eye glowing: it shoots at where you are then in ${s1(Math.max(0, next))}${d.fired === 0 ? ", and again 0.8 s later" : ""}, then drops straight down ${col}`;
    }
    case "drop":
      return `a Cyclops dropping straight down ${col}, ${rowsUp(d.y)}, reaching your row in ${s1((SHIP_ROW - d.y) / CY_DROP)}`;
    case "home":
      return null;
  }
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
  const dives = world.enemies.filter((e) => e.alive && e.diving).flatMap((e) => diveLine(world, e) ?? []);
  lines.push(dives.length ? `Diving: ${dives.join("; ")}.` : "Diving: none right now.");
  const glowing = world.enemies.filter((e) => e.alive && !e.diving && e.charge !== null);
  if (glowing.length)
    lines.push(
      `Formation shots coming: ${glowing
        .map((e) => `a Cyclops at ${at(enemyPos(e, world.t).x)}, eye glowing, shoots at where you are then in ${s1(Math.max(0, e.charge! - world.t))}`)
        .join("; ")}.`,
    );
  const left = world.enemies.filter((e) => e.alive).length;
  const heading = Math.cos(0.6 * world.t) >= 0 ? "right" : "left";
  const bats = world.bullets.filter((b) => b.from === 1).length;
  const aimed = world.bullets.length - bats;
  lines.push(
    `Formation: ${left} enemies left, Cyclopes on row 1, Bats row 2, Drones row 3, drifting ${heading} (offset ${drift(world.t).toFixed(1)}). Bullets on screen: ${bats} Bat bullets falling straight down, ${aimed} Cyclops shots flying straight at where you were. Score ${world.score}, wave ${world.wave}.`,
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

