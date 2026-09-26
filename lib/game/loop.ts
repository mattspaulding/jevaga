import { describeFight, describeMoves } from "../describe";
import type { DecideInput, Decision } from "../system1/types";
import { act, advance, type Move, type World } from "./world";

// A run in continuous time. A physics timer advances the fight every frame;
// the ship acts the instant someone decides (a key press, or Jev's answer landing).
export const FRAME_MS = 16;
export const RETRY_MS = 3000;
// Jev on the gateway's paid tier held 4 requests a second with no failures in testing.
export const MIN_REQUEST_INTERVAL_MS = 250;
export const REQUEST_TIMEOUT_MS = 2500; // no answer by then counts as an outage, not slowness

export type RunEnd = { cause: "hit"; score: number; seconds: number };

export type Run = {
  world: World;
  act(move: Move): void;
  pause(): void;
  resume(): void;
  stop(): void;
  ended(): boolean;
  done: Promise<RunEnd | null>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
export async function sleepUnless(ms: number, cancelled: () => boolean) {
  const until = Date.now() + ms;
  while (!cancelled() && Date.now() < until) await sleep(Math.min(100, until - Date.now()));
}

export function startRun(world: World, onChange: (world: World) => void = () => {}): Run {
  let paused = false;
  let finished = false;
  let last = performance.now();
  let resolve!: (end: RunEnd | null) => void;
  const done = new Promise<RunEnd | null>((r) => (resolve = r));

  const finish = (hit: boolean) => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    resolve(hit ? { cause: "hit", score: world.score, seconds: world.t } : null);
  };

  const timer = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (paused || finished) return;
    const event = advance(world, dt);
    onChange(world);
    if (event) finish(true);
  }, FRAME_MS);

  return {
    world,
    act(move) {
      if (paused || finished) return;
      const event = act(world, move);
      onChange(world);
      if (event) finish(true);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      last = performance.now(); // time doesn't pass while paused
    },
    stop: () => finish(false),
    ended: () => finished,
    done,
  };
}

// Jev flies: ask about the fight as it is now, act the moment the answer
// lands (the fight has moved on by then; that's the real-time part), ask
// again. No answer within the timeout, or an error, pauses the fight and retries.
export async function driveWithJev(
  run: Run,
  getMove: (input: DecideInput, signal: AbortSignal) => Promise<Decision>,
  hooks: {
    plan: () => string;
    onDecision: (d: Decision) => void;
    onPause?: () => void;
    onResume?: () => void;
  },
): Promise<void> {
  let lastSent = -Infinity;
  while (!run.ended()) {
    await sleepUnless(lastSent + MIN_REQUEST_INTERVAL_MS - performance.now(), run.ended);
    if (run.ended()) break;
    const input: DecideInput = { state: describeFight(run.world), moves: describeMoves(run.world), plan: hooks.plan() };
    const sent = performance.now();
    lastSent = sent;
    let decision: Decision;
    try {
      decision = await getMove(input, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
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
    run.act(decision.move);
    hooks.onDecision({ ...decision, ms: Math.round(performance.now() - sent) });
  }
}
