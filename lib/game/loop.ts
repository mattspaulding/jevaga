import { describeMoves, describeState } from "../describe";
import type { DecideInput, Decision } from "../system1/types";
import type { BeatLog } from "../system2/nemotron";
import { isHit, MOVES, step, targetOf, type Move, type World } from "./world";

// One clock for everyone: every BEAT_MS the frog makes the move chosen for
// that beat and every car advances. Whoever is playing has until the next
// tick to decide; no decision in time means the frog waits.
export const BEAT_MS = 600;
export const RETRY_MS = 3000;
const KEEP_BEATS = 6;

export type RunEnd = { cause: "hit" | "stalled"; distance: number };
export type Choice = { move: Move; decision: Decision | null; late: boolean };

export interface Controller {
  // Called right after each tick with the situation for the coming beat.
  prepare(input: DecideInput): void;
  // Called at the tick. "pause" means the player can't play right now (a Jev outage).
  take(): Choice | "pause";
}

export type RunHooks = {
  playbook: string[];
  onBeat: (world: World, choice: Choice) => void;
  onPause?: () => void;
  onResume?: () => void;
  stopped: () => boolean;
  beatMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
// Sleeps in short slices so Stop takes effect within ~100 ms.
async function sleepUnlessStopped(ms: number, stopped: () => boolean) {
  const until = Date.now() + ms;
  while (!stopped() && Date.now() < until) await sleep(Math.min(100, until - Date.now()));
}

// The situation at the start of a beat, plus hindsight for the coach: moves
// that survive this beat and leave at least one move that survives the next.
function snapshot(world: World) {
  const state = describeState(world);
  const moves = describeMoves(world);
  const survives = (from: { row: number; col: number }, m: Move, beat: number) => {
    const to = targetOf(from, m);
    return isHit(world.rows[to.row], to.col, beat) ? null : to;
  };
  const safe = MOVES.filter((m) => {
    const to = survives(world.frog, m, world.beat);
    return to !== null && MOVES.some((n) => survives(to, n, world.beat + 1) !== null);
  });
  return { state, moves, safe };
}

// Plays one run in real time. Resolves when the frog is hit, stalls, or the
// viewer presses Stop (end = null). Keeps the last 6 beats for the coach.
export async function playRun(
  world: World,
  controller: Controller,
  hooks: RunHooks,
): Promise<{ end: RunEnd | null; beats: BeatLog[] }> {
  const beatMs = hooks.beatMs ?? BEAT_MS;
  const beats: BeatLog[] = [];
  let snap = snapshot(world);
  controller.prepare({ state: snap.state, moves: snap.moves, playbook: hooks.playbook });
  let next = Date.now() + beatMs;
  let paused = false;

  while (world.alive && !hooks.stopped()) {
    await sleepUnlessStopped(next - Date.now(), hooks.stopped);
    if (hooks.stopped()) break;

    const choice = controller.take();
    if (choice === "pause") {
      // The world holds still during an outage: ask again, then give a full beat.
      if (!paused) hooks.onPause?.();
      paused = true;
      await sleepUnlessStopped(RETRY_MS, hooks.stopped);
      if (hooks.stopped()) break;
      controller.prepare({ state: snap.state, moves: snap.moves, playbook: hooks.playbook });
      next = Date.now() + beatMs;
      continue;
    }
    if (paused) hooks.onResume?.();
    paused = false;

    beats.push({
      state: snap.state,
      move: choice.move,
      moveText: snap.moves[choice.move],
      confidence: choice.decision?.confidence ?? 0,
      options: snap.moves,
      safe: snap.safe,
    });
    if (beats.length > KEEP_BEATS) beats.shift();

    const { event } = step(world, choice.move);
    hooks.onBeat(world, choice);
    if (event) return { end: { cause: event, distance: world.furthest }, beats };

    snap = snapshot(world);
    controller.prepare({ state: snap.state, moves: snap.moves, playbook: hooks.playbook });
    next += beatMs;
    if (next < Date.now()) next = Date.now() + beatMs; // never fire beats in a burst after a stall
  }
  return { end: null, beats };
}

// Jev plays: each beat's question goes out as soon as the previous tick lands.
// An answer that arrives after the tick is thrown away (it was about a board
// that no longer exists) and the frog waits. Errors, or several late answers
// in a row, mean Jev is down rather than slow: the clock pauses instead.
const LATE_IN_A_ROW_IS_OUTAGE = 4;
export function jevController(getMove: (input: DecideInput, signal: AbortSignal) => Promise<Decision>): Controller {
  let seq = 0;
  let ready: Decision | null = null;
  let failed = false; // latched until an answer arrives, from whichever request failed
  let lateInARow = 0;
  let inFlight: AbortController | null = null;
  return {
    prepare(input) {
      const id = ++seq;
      ready = null;
      inFlight?.abort(); // the old question is about a board that no longer exists
      const ctrl = new AbortController();
      inFlight = ctrl;
      const sent = performance.now();
      getMove(input, ctrl.signal).then(
        (d) => {
          failed = false;
          if (id === seq) ready = { ...d, ms: Math.round(performance.now() - sent) };
        },
        () => {
          if (!ctrl.signal.aborted) failed = true;
        },
      );
    },
    take() {
      if (ready) {
        lateInARow = 0;
        return { move: ready.move, decision: ready, late: false };
      }
      if (failed || ++lateInARow >= LATE_IN_A_ROW_IS_OUTAGE) {
        lateInARow = 0;
        return "pause";
      }
      return { move: "wait", decision: null, late: true };
    },
  };
}

// You play: the last key pressed during a beat is the move; no key means wait.
export function keyboardController() {
  let queued: Move | null = null;
  return {
    press(m: Move) {
      queued = m;
    },
    prepare() {},
    take(): Choice {
      const move = queued ?? "wait";
      queued = null;
      return { move, decision: null, late: false };
    },
  };
}
