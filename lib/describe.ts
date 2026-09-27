import {
  BAT_COMMIT,
  BAT_FLAP,
  batCommitAge,
  COMMIT_ROW,
  CY_DROP,
  CY_GLOW,
  DIVER_REACH,
  DRONE_FALL,
  DRONE_REV,
  DRONE_SLIDE,
  drift,
  ENTRY_FIRE_ROW,
  ENTRY_PATHS,
  ENTRY_SIDE,
  enemyPos,
  gunReadyIn,
  HOVER_ROW,
  arriving,
  attacking,
  BEAM_ON,
  COLS,
  nextCarrier,
  BEAM_WARN,
  KIND_NAME,
  PICKUP_STAYS,
  WEAPON_NAME,
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
export const ARRIVAL = /\b(?:Drone|Bat|Cyclops)(?: bullet| shot| beam)? in (\d+(?:\.\d+)?) s/;

const s1 = (x: number) => `${x.toFixed(1)} s`;
const at = (x: number) => `x ${x.toFixed(1)}`;
// Rows left before a diver at `y` is close enough to hit the ship.
const toHit = (y: number) => Math.max(0, SHIP_ROW - DIVER_REACH - y);
const rows = (n: number) => `${n.toFixed(0)} row${n.toFixed(0) === "1" ? "" : "s"} up`;
const rowsUp = (y: number) => rows(Math.max(0, SHIP_ROW - y));

// What reaches the ship first if it makes `move`, counting everything it
// passes under on the way, not just where it ends up. Each answer runs a copy
// of the fight forward, so one ask shares them through `memo` (fire and stay
// take the same path).
type Memo = Map<Move, string>;
function incoming(world: World, move: Move, memo: Memo): string {
  const key = move === "fire" ? "stay" : move;
  let text = memo.get(key);
  if (text === undefined) {
    const th = threatOnPath(world, movePath(world, key));
    text = th ? `${th.by} in ${s1(th.at)}` : "nothing for 2.5+ s";
    memo.set(key, text);
  }
  return text;
}

function above(world: World, x: number): string {
  const t = targetAbove(world, x);
  if (!t) return "no enemy above";
  const hits = t.kind !== 0 ? "" : t.hp === 1 ? ", hit once, one more shot kills it" : ", takes two hits";
  const who = t.mini ? "a falling mini-drone" : `${t.diving ? "a diving" : "a"} ${KIND_NAME[t.kind]}`;
  return `${who} ${rows(t.rowsUp)}${hits}, a shot reaches it in ${s1(t.seconds)}`;
}

// What your Eye Beam would hit: every enemy in the column above you.
function inColumn(world: World, x: number): string {
  const hit = world.enemies.filter((e) => {
    if (!e.alive) return false;
    const p = enemyPos(e, world.t);
    return p.y >= 0 && p.y < SHIP_ROW && Math.abs(p.x - x) < 0.5;
  });
  const names = [...hit.map((e) => KIND_NAME[e.kind] as string), ...world.minis.filter((m) => Math.abs(m.x - x) < 0.5 && m.y < SHIP_ROW).map(() => "mini-drone")];
  return names.length ? `hits ${names.length === 1 ? "the" : `all ${names.length}:`} ${names.join(", ")} above you at once` : "no enemy above";
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
  return `${where} (0 is the left edge, 8 the right), on the bottom row. Gun: ${ready > 0 ? `reloading, ready in ${s1(ready)}` : "ready"}. ${weaponLine(world)}Times are from now.`;
}

// The weapon you hold, if any: what it does, until the wave ends.
function weaponLine(world: World): string {
  if (world.weapon === "fan") return "Your weapon until the wave ends: the Fan, each shot splits into three that spread out as they rise. ";
  if (world.weapon === "beam") return "Your weapon until the wave ends: the Eye Beam, fire hits every enemy in your column at once, and it reloads in 0.7 s. ";
  if (world.weapon === "wingmen") {
    const [l, r] = world.wings;
    const state = l && r ? "both there" : l ? "left there, right gone" : r ? "right there, left gone" : "both gone";
    return `Your weapon until the wave ends: Wingmen (${state}), a column either side of you; they fire when you fire, and each takes one hit for you. `;
  }
  return "";
}

// Carriers still flying, and weapons dropped for you to take.
function weaponsLine(world: World): string | null {
  const parts: string[] = [];
  const upNext = nextCarrier(world);
  for (const e of world.enemies) {
    if (!e.alive || !e.carries) continue;
    const p = enemyPos(e, world.t);
    const name = WEAPON_NAME[e.carries];
    const where = attacking(e)
      ? `diving at ${at(p.x)}`
      : e.diving?.phase === "home"
        ? `flying back to the formation at ${at(p.x)}`
        : e.diving && !arriving(e)
          ? `winding up to dive at ${at(p.x)}`
          : `in the formation at ${at(p.x)}`;
    const next = e !== upNext ? "" : world.divesThisWave >= 1 ? ", dives next" : ", dives right after the wave's first dive";
    parts.push(`the ${KIND_NAME[e.kind]} ${where} carries the ${name}${next}; shoot it and the ${name} ${e.carries === "wingmen" ? "drop" : "drops"} to your row`);
  }
  for (const p of world.pickups) {
    const name = WEAPON_NAME[p.weapon];
    parts.push(
      p.landed === null
        ? `the ${name} falling toward your row at ${at(p.x)}, lands in ${s1((SHIP_ROW - p.y) / 4)}, stays ${PICKUP_STAYS} s`
        : `the ${name} on your row at ${at(p.x)}, gone in ${s1(Math.max(0, PICKUP_STAYS - (world.t - p.landed)))}; glide onto it to take it`,
    );
  }
  return parts.length ? `Weapons: ${parts.join("; ")}.` : null;
}

// A weapon on your row where a move leaves you.
function takes(world: World, x: number): string {
  const p = world.pickups.find((p) => p.landed !== null && Math.abs(p.x - x) < 0.6);
  return p ? `; takes the ${WEAPON_NAME[p.weapon]} there` : "";
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
      const slideFrom = e.slot.col + drift(d.since + DRONE_REV); // the formation keeps drifting while it revs
      const reach = start + Math.abs(slideFrom - d.col) / DRONE_SLIDE + toHit(d.y) / DRONE_FALL;
      return `a ${e.carries ? "carrier " : ""}Drone revving in the formation, locked on ${col}: in ${s1(start)} it moves over and falls straight down ${col}${minis(e)}, reaching your row in ${s1(reach)}. Drones never turn or shoot`;
    }
    case "slide":
      if (e.kind === 2)
        return `a ${e.carries ? "carrier " : ""}Drone moving over to ${col}, then falling straight down it${minis(e)}, reaching your row in ${s1(Math.abs(d.x - d.col) / DRONE_SLIDE + toHit(d.y) / DRONE_FALL)}`;
      return `a ${e.carries ? "carrier " : ""}Cyclops at ${at(d.x)} heading to park over ${col}, ${rowsUp(HOVER_ROW)}; there ${parkPlan(e, col)}, and then drops straight down ${col}`;
    case "fall":
      return `a Drone falling straight down ${col}, ${rowsUp(d.y)}, never turns, reaching your row in ${s1(toHit(d.y) / DRONE_FALL)}`;
    case "flap":
    case "zig": {
      const commit = d.phase === "zig" ? batCommitAge(d) - age : BAT_FLAP - age + batCommitAge(d);
      return `a ${e.carries ? "carrier " : ""}Bat zigzagging down at ${at(d.x)}, ${rowsUp(d.y)}, firing ${e.carries === "fan" ? "fans of three bullets" : "straight down"} at rows 5 and 8; at row ${COMMIT_ROW} in ${s1(Math.max(0, commit))} it turns once toward wherever you are then`;
    }
    case "commit":
      return `a Bat committed to ${col}, ${rowsUp(d.y)}, flying straight at it, reaching your row in ${s1(toHit(d.y) / BAT_COMMIT)}`;
    case "open":
    case "loop":
      return `a ${e.carries ? "carrier " : ""}Cyclops looping out of the formation, heading to park over ${col}, ${rowsUp(HOVER_ROW)}; there ${parkPlan(e, col)}, and then drops straight down ${col}`;
    case "park": {
      if (e.carries === "beam") {
        const on = BEAM_WARN - age;
        return on > 0
          ? `a carrier Cyclops parked over ${col}, ${rowsUp(d.y)}, its Eye Beam warning line down ${col}: the beam fills ${col} in ${s1(on)}, for 0.5 s, then it drops straight down ${col}`
          : `a carrier Cyclops parked over ${col}, its Eye Beam filling ${col} for ${s1(Math.max(0, on + BEAM_ON))} more, then it drops straight down ${col}`;
      }
      const next = CY_GLOW * (d.fired + 1) - age;
      return `a Cyclops parked over ${col}, ${rowsUp(d.y)}, eye glowing: it shoots at where you are then in ${s1(Math.max(0, next))}${d.fired === 0 ? ", and again 0.8 s later" : ""}, then drops straight down ${col}`;
    }
    case "drop":
      return `a Cyclops dropping straight down ${col}, ${rowsUp(d.y)}, reaching your row in ${s1(toHit(d.y) / CY_DROP)}`;
    case "home":
    case "enter":
    case "settle":
      return null;
  }
}

// A carrier Drone brings a mini-drone down each column beside it that's on the field.
const minis = (e: Enemy) => {
  if (e.carries !== "wingmen") return "";
  const cols = [e.diving!.col - 1, e.diving!.col + 1].filter((x) => x >= 0 && x <= COLS - 1);
  return cols.length === 2 ? ` with two mini-drones falling beside it down ${at(cols[0])} and ${at(cols[1])}` : ` with a mini-drone falling beside it down ${at(cols[0])}`;
};
const parkPlan = (e: Enemy, col: string) =>
  e.carries === "beam" ? `a warning line runs down ${col} for 0.8 s and then its Eye Beam fills ${col} for 0.5 s` : "it shoots twice at where you are then";

const PLURAL = ["Cyclopes", "Bats", "Drones"] as const;
const lowest = ENTRY_PATHS.map((p) => p.reduce((a, b) => (b.y > a.y ? b : a)));

// The fly-in, one group at a time: who, from where, how low, and whether it shoots.
function arrivingLine(world: World): string | null {
  const groups = new Map<number, Enemy[]>();
  for (const e of world.enemies) if (arriving(e)) groups.set(e.diving!.path, [...(groups.get(e.diving!.path) ?? []), e]);
  const parts = [...groups.entries()].flatMap(([path, es]) => {
    const kind = es[0].kind;
    const entering = es.filter((e) => e.diving!.phase === "enter");
    if (!entering.length) return [`${es.length} ${PLURAL[kind]} climbing to their slots`];
    const first = Math.min(...entering.map((e) => e.diving!.since));
    const low = lowest[path];
    const how = `${entering.length} ${PLURAL[kind]} swooping in from the ${ENTRY_SIDE[path]}, lowest at row ${low.y.toFixed(0)} near ${at(low.x)}`;
    const fire =
      world.wave < 2 || kind === 2
        ? ""
        : kind === 1
          ? `, each dropping a bullet as it passes row ${ENTRY_FIRE_ROW} on the way down`
          : ", some with eyes glowing to fire an aimed shot on the way";
    return [first > world.t ? `${how}${fire}, starting in ${s1(first - world.t)}` : `${how}${fire}`];
  });
  return parts.length ? `Arriving: ${parts.join("; ")}. Nothing dives until the formation is in place.` : null;
}

// Everything Jev is asked with, the fight and the four moves, from one set of predictions.
export function describe(world: World): { state: string; moves: Record<Move, string> } {
  const memo: Memo = new Map();
  return { state: describeFight(world, memo), moves: describeMoves(world, memo) };
}

export function describeFight(world: World, memo: Memo = new Map()): string {
  const x = restX(world);
  const spots: [string, Move][] = [
    ["a little left", "left"],
    ["where you stop", "stay"],
    ["a little right", "right"],
  ];
  const lines = [
    shipLine(world),
    `Coming at your row, counting the way there: ${spots.map(([name, m]) => `${name} (${at(landingX(world, m))}): ${incoming(world, m, memo)}`).join("; ")}.`,
    `Above you: ${above(world, x)}.`,
  ];
  const arrival = arrivingLine(world);
  if (arrival) lines.push(arrival);
  const dives = world.enemies.filter((e) => e.alive && e.diving).flatMap((e) => diveLine(world, e) ?? []);
  lines.push(dives.length ? `Diving: ${dives.join("; ")}.` : "Diving: none right now.");
  if (world.minis.length)
    lines.push(
      `Mini-drones: ${world.minis.map((m) => `one falling straight down ${at(m.x)}, reaching your row in ${s1(toHit(m.y) / DRONE_FALL)}`).join("; ")}.`,
    );
  const weapons = weaponsLine(world);
  if (weapons) lines.push(weapons);
  const glowing = world.enemies.filter((e) => e.alive && e.charge !== null);
  if (glowing.length)
    lines.push(
      `Cyclops eyes glowing: ${glowing
        .map((e) => `a Cyclops ${e.diving ? "flying in" : "in the formation"} at ${at(enemyPos(e, world.t).x)}, eye glowing, shoots at where you are then in ${s1(Math.max(0, e.charge! - world.t))}`)
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
export function describeMoves(world: World, memo: Memo = new Map()): Record<Move, string> {
  const x = restX(world);
  const ready = gunReadyIn(world);
  const glide = (move: "left" | "right") => {
    const to = landingX(world, move);
    return Math.abs(to - x) < 0.05
      ? `Can't glide ${move}: the edge. Same as staying. Here (${at(x)}): ${incoming(world, "stay", memo)}.`
      : `Glide ${move} to about ${at(to)}. On the way and there: ${incoming(world, move, memo)}; ${above(world, to)}${takes(world, to)}.`;
  };
  return {
    left: glide("left"),
    right: glide("right"),
    stay: `Stop at ${at(x)}. Here: ${incoming(world, "stay", memo)}${takes(world, x)}.`,
    fire:
      ready > 0
        ? `Stop and fire: gun reloading, ready in ${s1(ready)}; no shot. Here (${at(x)}): ${incoming(world, "fire", memo)}${takes(world, x)}.`
        : `Stop at ${at(x)} and fire${world.weapon === "beam" ? " your Eye Beam" : ""}: ${world.weapon === "beam" ? inColumn(world, x) : above(world, x)}. Here: ${incoming(world, "fire", memo)}${takes(world, x)}.`,
  };
}

