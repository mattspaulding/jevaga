import { describeMoves, describeState } from "../describe";
import type { DecideInput, Decision } from "../system1/types";
import type { BeatLog } from "../system2/nemotron";
import { advance, clearFor, hop, MOVES, targetOf, type Move, type RunEvent, type World } from "./world";

// A run in continuous time. A physics timer advances the world every frame;
// anyone can hop the frog at any moment (a key press, or Jev's answer landing).
export const FRAME_MS = 16;
export const RETRY_MS = 3000;
export const DECISION_GAP_MS = 250; // at most ~4 questions a second, to stay under Jev's rate limit
export const REQUEST_TIMEOUT_MS = 2500; // no answer by then counts as an outage, not slowness
const KEEP_DECISIONS = 6;
const SAFE_WINDOW_S = 0.6;

export type RunEnd = { cause: "hit" | "stalled"; distance: number };

export type Run = {
  world: World;
  hop(move: Move): void;
  pause(): void;
  resume(): void;
  stop(): void;
  ended(): boolean;
  done: Promise<RunEnd | null>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
async function sleepUnless(ms: number, cancelled: () => boolean) {
  const until = Date.now() + ms;
  while (!cancelled() && Date.now() < until) await sleep(Math.min(100, until - Date.now()));
}

export function startRun(world: World, onChange: (world: World) => void = () => {}): Run {
  let paused = false;
  let finished = false;
  let last = performance.now();
  let resolve!: (end: RunEnd | null) => void;
  const done = new Promise<RunEnd | null>((r) => (resolve = r));

  const finish = (event: RunEvent | "stop") => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    resolve(event === "stop" || event === null ? null : { cause: event, distance: world.furthest });
  };

  const timer = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (paused || finished) return;
    const event = advance(world, dt);
    if (event) {
      onChange(world);
      finish(event);
    }
  }, FRAME_MS);

  return {
    world,
    hop(move) {
      if (paused || finished) return;
      const event = hop(world, move);
      onChange(world);
      if (event) finish(event);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      last = performance.now(); // time doesn't pass while paused
    },
    stop: () => finish("stop"),
    ended: () => finished,
    done,
  };
}

// What Jev is shown at the moment it's asked, plus hindsight for the coach:
// moves that stay clear for 0.6 s and leave some move clear for the 0.6 s after.
function snapshot(world: World) {
  const t = world.t;
  const safe = MOVES.filter((m) => {
    const to = targetOf(world.frog, m);
    if (!clearFor(world, to.row, to.col, t, SAFE_WINDOW_S)) return false;
    return MOVES.some((n) => {
      const next = targetOf(to, n);
      return clearFor(world, next.row, next.col, t + SAFE_WINDOW_S, SAFE_WINDOW_S);
    });
  });
  return { state: describeState(world), moves: describeMoves(world), safe };
}

// Jev plays: ask about the board as it is now, hop the moment the answer
// lands (the board has moved on by then; that's the real-time part), ask
// again. No answer within the timeout, or an error, pauses the world and
// retries. Resolves with the last few decisions, for the coach.
export async function driveWithJev(
  run: Run,
  getMove: (input: DecideInput, signal: AbortSignal) => Promise<Decision>,
  hooks: {
    playbook: string[];
    onDecision: (d: Decision) => void;
    onPause?: () => void;
    onResume?: () => void;
  },
): Promise<BeatLog[]> {
  const log: BeatLog[] = [];
  while (!run.ended()) {
    const snap = snapshot(run.world);
    const sent = performance.now();
    let decision: Decision;
    try {
      decision = await getMove({ state: snap.state, moves: snap.moves, playbook: hooks.playbook }, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    } catch {
      if (run.ended()) break;
      run.pause();
      hooks.onPause?.();
      await sleepUnless(RETRY_MS, run.ended);
      run.resume();
      hooks.onResume?.();
      continue;
    }
    if (run.ended()) break;
    const ms = Math.round(performance.now() - sent);
    log.push({
      state: snap.state,
      move: decision.move,
      moveText: snap.moves[decision.move],
      confidence: decision.confidence,
      options: snap.moves,
      safe: snap.safe,
    });
    if (log.length > KEEP_DECISIONS) log.shift();
    run.hop(decision.move);
    hooks.onDecision({ ...decision, ms });
    await sleepUnless(DECISION_GAP_MS - ms, run.ended);
  }
  return log;
}
