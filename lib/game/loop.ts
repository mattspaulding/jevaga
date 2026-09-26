import { describeMoves, describeState } from "../describe";
import type { BeatLog } from "../system2/nemotron";
import type { DecideInput, Decision } from "../system1/types";
import { step, type World } from "./world";

export const MIN_BEAT_MS = 350;
const KEEP_BEATS = 6;

export type RunEnd = { cause: "hit" | "stalled"; distance: number };

export type LoopHooks = {
  getMove: (input: DecideInput) => Promise<Decision>;
  onBeat: (world: World, decision: Decision) => void;
  stopped: () => boolean;
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
    const decision = await hooks.getMove({ state, moves: describeMoves(world), playbook });
    if (hooks.stopped()) break;
    beats.push({ state, move: decision.move, confidence: decision.confidence });
    if (beats.length > KEEP_BEATS) beats.shift();
    const { event } = step(world, decision.move);
    hooks.onBeat(world, decision);
    if (event) return { end: { cause: event, distance: world.furthest }, beats };
    const wait = MIN_BEAT_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  return { end: null, beats };
}
