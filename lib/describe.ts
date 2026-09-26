import { busyWindow, carSpans, colsPerSecond, COLS, Lane, Move, targetOf, visibleRows, World } from "./game/world";

// Turns the world into the plain sentences Jev reads, at the moment the
// question is asked. Car facts are in seconds for a given column:
//   "car now, gone at 0.3 s"  = a car is there now; moving there now gets you hit
//   "car from 0.4 to 0.9 s"   = safe for 0.4 s, then a car passes
//   "clear for 3+ s"          = nothing coming
// The same words are given to Nemotron so its lessons line up with what Jev sees.

const HORIZON = 3;
const s1 = (x: number) => `${x.toFixed(1)} s`;

export function timing(lane: Lane, col: number, t: number): string {
  const w = busyWindow(lane, col, t, HORIZON);
  if (!w) return `clear for ${HORIZON}+ s`;
  if (w.from < 0.05) return `car now, gone at ${s1(w.until)}`;
  return `car from ${w.from.toFixed(1)} to ${s1(w.until)}`;
}

function laneLabel(offset: number) {
  return offset === 0 ? "Lane 0, your lane," : `Lane ${offset > 0 ? "+" : "-"}${Math.abs(offset)}`;
}

function traffic(lane: Extract<Lane, { kind: "road" }>) {
  return `road, cars move ${lane.dir < 0 ? "left" : "right"} ${colsPerSecond(lane.speed).toFixed(1)} columns per second`;
}

function carSpots(lane: Lane, t: number) {
  const spots = carSpans(lane, t).map(({ x, len }) => {
    const a = Math.floor(x);
    const b = Math.floor(x + len - 0.001) % COLS;
    return a === b ? `column ${a}` : `columns ${a}-${b}`;
  });
  return spots.length ? `${spots.length > 1 ? "cars at" : "a car at"} ${spots.join(" and ")}` : "no cars";
}

// Every lane on screen. Road lanes say where the cars are and when a car
// covers your column and the columns either side of it.
export function describeState(world: World): string {
  const { row, col } = world.frog;
  const { bottom, top } = visibleRows(row);
  const cols = [col - 1, col, col + 1].filter((c) => c >= 0 && c < COLS);
  const laneLine = (offset: number) => {
    const lane = world.rows[row + offset];
    const name = laneLabel(offset);
    if (lane.kind === "grass") return `${name.replace(/,$/, "")}: grass.`;
    const times = cols.map((c) => `Column ${c}: ${timing(lane, c, world.t)}`).join("; ");
    return `${name} (${traffic(lane)}): ${carSpots(lane, world.t)}. ${times}.`;
  };
  const lines = [`You are in lane 0, column ${col}. Columns run 0 to ${COLS - 1}. Times are from now.`, laneLine(0)];
  lines.push("Ahead:");
  for (let r = row + 1; r <= top; r++) if (world.rows[r]) lines.push(laneLine(r - row));
  if (row === 0) lines.push(`Behind you: the edge; you can't go back.`);
  else {
    lines.push("Behind:");
    for (let r = row - 1; r >= bottom; r--) lines.push(laneLine(r - row));
  }
  return lines.join("\n");
}

// Five neutral move descriptions: facts about the square each move lands on, never a verdict.
export function describeMoves(world: World): Record<Move, string> {
  const { row, col } = world.frog;
  const cell = (r: number, c: number) => {
    const lane = world.rows[r];
    return lane.kind === "grass" ? "Grass, no cars." : `${cap(timing(lane, c, world.t))}.`;
  };
  const f = targetOf(world.frog, "forward");
  return {
    forward: `Hop into lane +1, column ${f.col}. ${cell(f.row, f.col)}`,
    wait: `Stay in lane 0, column ${col}. ${cell(row, col)}`,
    left: col === 0 ? `Can't move left: the edge. Same as staying. ${cell(row, col)}` : `Hop left to column ${col - 1}. ${cell(row, col - 1)}`,
    right:
      col === COLS - 1 ? `Can't move right: the edge. Same as staying. ${cell(row, col)}` : `Hop right to column ${col + 1}. ${cell(row, col + 1)}`,
    back: row === 0 ? `Not possible: the edge. Same as staying. ${cell(row, col)}` : `Hop back into lane -1, column ${col}. ${cell(row - 1, col)}`,
  };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
