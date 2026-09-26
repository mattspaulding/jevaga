import { beatsUntilHit, carCells, COLS, Lane, Move, targetOf, visibleRows, World } from "./game/world";

// Turns the world into the plain sentences Jev reads. Car facts are phrased as
// time ("reaches column 4 this beat" = moving there now gets you hit), and the
// same words are given to Nemotron so its lessons line up with what Jev sees.

const HORIZON = 4;

function laneLabel(offset: number) {
  return offset === 0 ? "your lane (lane 0)" : `lane ${offset > 0 ? "+" : "-"}${Math.abs(offset)}`;
}

function traffic(lane: Lane) {
  if (lane.kind !== "road") return "grass";
  const way = lane.dir < 0 ? "left" : "right";
  return `road, cars move ${way} ${lane.speed} column${lane.speed > 1 ? "s" : ""} per beat`;
}

// "a car reaches column 4 this beat" / "in 3 beats" / "no car reaches column 4 for at least 4 beats"
export function timing(lane: Lane, col: number, beat: number): string {
  if (lane.kind !== "road") return `no cars on grass`;
  const n = beatsUntilHit(lane, col, beat, HORIZON);
  if (n === null) return `no car reaches column ${col} for at least ${HORIZON} beats`;
  if (n === 1) return `a car reaches column ${col} this beat`;
  return `a car reaches column ${col} in ${n} beats`;
}

function carSpots(lane: Lane, beat: number) {
  const spots = carCells(lane, beat).map(({ cells }) =>
    cells.length > 1 ? `columns ${[...cells].sort((a, b) => a - b).join("-")}` : `column ${cells[0]}`,
  );
  return spots.length ? `${spots.length > 1 ? "cars" : "a car"} at ${spots.join(" and ")}` : "no cars";
}

// Short timing for one column: "this beat", "in 3 beats", "not for at least 4 beats".
function when(lane: Lane, col: number, beat: number): string {
  const n = beatsUntilHit(lane, col, beat, HORIZON);
  if (n === null) return `not for at least ${HORIZON} beats`;
  return n === 1 ? "this beat" : `in ${n} beats`;
}

// Every lane on screen. Road lanes list where the cars are and when a car
// reaches your column and the columns either side of it.
export function describeState(world: World): string {
  const { row, col } = world.frog;
  const { bottom, top } = visibleRows(row);
  const cols = [col - 1, col, col + 1].filter((c) => c >= 0 && c < COLS);
  const laneLine = (offset: number) => {
    const lane = world.rows[row + offset];
    const name = offset === 0 ? "Lane 0, your lane," : cap(laneLabel(offset));
    if (lane.kind === "grass") return `${name.replace(/,$/, "")}: grass.`;
    const times = cols.map((c) => `column ${c} ${when(lane, c, world.beat)}`).join(", ");
    return `${name} (${traffic(lane)}): ${carSpots(lane, world.beat)}. A car reaches ${times}.`;
  };
  const lines = [`You are in lane 0, column ${col}. Columns run 0 to ${COLS - 1}.`, laneLine(0)];
  lines.push("Ahead:");
  for (let r = row + 1; r <= top; r++) if (world.rows[r]) lines.push(laneLine(r - row));
  if (row === 0) lines.push(`Behind you: the edge; you can't go back.`);
  else {
    lines.push("Behind:");
    for (let r = row - 1; r >= bottom; r--) lines.push(laneLine(r - row));
  }
  return lines.join("\n");
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// Five neutral move descriptions: facts about the destination cell, never a verdict.
export function describeMoves(world: World): Record<Move, string> {
  const { row, col } = world.frog;
  const cell = (r: number, c: number) => {
    const lane = world.rows[r];
    return lane.kind === "grass" ? "No cars on grass." : `${cap(timing(lane, c, world.beat))}.`;
  };
  const at = (m: Move) => targetOf(world.frog, m);
  const moves = {} as Record<Move, string>;

  const f = at("forward");
  moves.forward = `Step into lane +1, column ${f.col}. ${cell(f.row, f.col)}`;

  moves.wait = `Stay in lane 0, column ${col}. ${cell(row, col)}`;

  moves.left =
    col === 0 ? `Can't move left: the edge. Counts as waiting. ${cell(row, col)}` : `Stay in lane 0, move to column ${col - 1}. ${cell(row, col - 1)}`;
  moves.right =
    col === COLS - 1
      ? `Can't move right: the edge. Counts as waiting. ${cell(row, col)}`
      : `Stay in lane 0, move to column ${col + 1}. ${cell(row, col + 1)}`;

  moves.back =
    row === 0 ? `Not possible: the edge. Counts as waiting. ${cell(row, col)}` : `Step back into lane -1, column ${col}. ${cell(row - 1, col)}`;
  return moves;
}
