import { describe } from "../describe";
import type { DecideInput, Decision } from "../system1/types";
import { act, fire, steer, stepN, SUBSTEP, type Move, type World } from "./world";

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
  steer(dir: -1 | 0 | 1): void; // keyboard: glide while a key is held
  fire(): void;
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
  let carry = 0; // seconds not yet stepped
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
    // Whole 20 ms physics steps only, the same steps a replay takes, so a
    // recorded fight can be flown again exactly.
    carry += dt;
    const n = Math.floor(carry / SUBSTEP + 1e-9);
    carry -= n * SUBSTEP;
    const event = stepN(world, n);
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
    steer(dir) {
      if (!paused && !finished) steer(world, dir);
    },
    fire() {
      if (!paused && !finished) fire(world);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      last = performance.now(); // time doesn't pass while paused
      carry = 0;
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
    rules: () => string[];
    onAsk?: (input: DecideInput, world: World) => void; // just before each question (the flight recorder)
    onAskFailed?: () => void; // that question got no answer (error or timeout)
    onDecision: (d: Decision) => void;
    onPause?: () => void;
    onResume?: () => void;
  },
): Promise<void> {
  let lastSent = -Infinity;
  while (!run.ended()) {
    await sleepUnless(lastSent + MIN_REQUEST_INTERVAL_MS - performance.now(), run.ended);
    if (run.ended()) break;
    const input: DecideInput = { ...describe(run.world), rules: hooks.rules() };
    hooks.onAsk?.(input, run.world);
    const sent = performance.now();
    lastSent = sent;
    let decision: Decision;
    try {
      decision = await getMove(input, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    } catch {
      if (run.ended()) break;
      hooks.onAskFailed?.();
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
