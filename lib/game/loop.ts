import { describeMoves, describeState } from "../describe";
import type { BeatLog } from "../system2/nemotron";
import type { DecideInput, Decision } from "../system1/types";
import { isHit, MOVES, step, targetOf, type World } from "./world";

export const MIN_BEAT_MS = 350;
const KEEP_BEATS = 6;

export type RunEnd = { cause: "hit" | "stalled"; distance: number };

export type LoopHooks = {
  getMove: (input: DecideInput) => Promise<Decision>;
  onBeat: (world: World, decision: Decision) => void;
  stopped: () => boolean;
  minBeatMs?: number;
};

// Plays one run: describe → ask for a move → step → draw, one request in
// flight, at least MIN_BEAT_MS per beat. Resolves when the frog is hit, stalls
// or the viewer presses Stop (end = null). Keeps the last 6 beats for the coach.
export async function playRun(
  world: World,
  playbook: string[],
  hooks: LoopHooks,
): Promise<{ end: RunEnd | null; beats: BeatLog[] }> {
  const beats: BeatLog[] = [];
  while (world.alive && !hooks.stopped()) {
    const started = Date.now();
    const state = describeState(world);
    const moves = describeMoves(world);
    const decision = await hooks.getMove({ state, moves, playbook });
    if (hooks.stopped()) break;
    // Hindsight for the coach: moves that survive this beat and leave at least
    // one move that survives the next (so a move into a trap doesn't count as safe).
    const survives = (from: { row: number; col: number }, m: (typeof MOVES)[number], beat: number) => {
      const to = targetOf(from, m);
      return isHit(world.rows[to.row], to.col, beat) ? null : to;
    };
    const safe = MOVES.filter((m) => {
      const to = survives(world.frog, m, world.beat);
      return to !== null && MOVES.some((n) => survives(to, n, world.beat + 1) !== null);
    });
    beats.push({ state, move: decision.move, moveText: moves[decision.move], confidence: decision.confidence, options: moves, safe });
    if (beats.length > KEEP_BEATS) beats.shift();
    const { event } = step(world, decision.move);
    hooks.onBeat(world, decision);
    if (event) return { end: { cause: event, distance: world.furthest }, beats };
    const wait = (hooks.minBeatMs ?? MIN_BEAT_MS) - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  return { end: null, beats };
}
