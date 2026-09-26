import { describeFight, describeMoves } from "../describe";
import { act, movePath, stepN, SUBSTEP, threatOnPath, type HitBy, type Move, type RunEvent, type World } from "../game/world";
import type { DecideInput, Decision } from "../system1/types";
import type { Death } from "./recorder";

// Replaying a death: rebuild the fight from just before the hit and fly it
// again in simulated time, asking Jev with a given rulebook. Questions are
// asked, and answers applied, on exactly the physics steps they were in the
// live run, so with the same rules the replay retraces the death, and with a
// new rule the only thing that changes is what Jev picks. A question whose
// answer the hit beat keeps that order: its answer lands no earlier than the
// step after the hit. Past the end of the recording (the ship lived longer),
// answers land a fixed latency later.

export const LATENCY_STEPS = 14; // 0.28 s of physics steps, about Jev's median answer time
export const SURVIVE_PAST = 1.0; // the ship must get this far past the old hit...
const CLEAR_FOR = 0.5; // ...with nothing arriving for this long
export const REPLAY_MAX_PAST = 2.5; // still threatened this long after the old hit counts as a hit

export type ReplayMove = { step: number; move: Move }; // `move` was applied after physics step `step`

export type ReplayResult = {
  outcome: "survived" | "hit" | "untested";
  hitBy?: HitBy; // what hit the ship, if something did
  stillThreatened?: boolean; // reached REPLAY_MAX_PAST with something about to land
  moves: ReplayMove[];
  asked: number;
  final: World; // the fight where the replay stopped
  error?: string;
};

export type Decide = (input: DecideInput) => Promise<Decision>;

export async function replay(death: Death, rules: string[], decide: Decide): Promise<ReplayResult> {
  const w = structuredClone(death.start);
  const moves: ReplayMove[] = [];
  let asked = 0;
  const done = (outcome: ReplayResult["outcome"], extra: Partial<ReplayResult> = {}): ReplayResult => ({
    outcome,
    moves,
    asked,
    final: structuredClone(w),
    ...extra,
  });

  const until = (step: number) => stepN(w, Math.max(0, step - w.steps));
  for (let k = 0; ; k++) {
    const beat = death.schedule[k];
    if (beat && until(beat.ask)) return done("hit", { hitBy: w.hitBy ?? undefined });
    // Out of recorded questions before the old hit (an outage ate the rest): the live
    // ship made no move in that gap, so neither does the replay. Questions resume
    // only once the ship has lived past the hit.
    if (!beat && until(death.hitStep)) return done("hit", { hitBy: w.hitBy ?? undefined });
    let decision: Decision;
    try {
      decision = await decide({ state: describeFight(w), moves: describeMoves(w), rules });
      asked++;
    } catch (e) {
      return done("untested", { error: e instanceof Error ? e.message : String(e) });
    }
    const answerAt = !beat
      ? w.steps + LATENCY_STEPS
      : (beat.answer ?? Math.max(beat.ask + LATENCY_STEPS, death.hitStep + 1));
    if (until(answerAt)) return done("hit", { hitBy: w.hitBy ?? undefined });
    act(w, decision.move);
    moves.push({ step: w.steps, move: decision.move });

    if (w.t >= death.tHit + SURVIVE_PAST) {
      const threat = threatOnPath(w, movePath(w, "stay"));
      if (!threat || threat.at > CLEAR_FOR) return done("survived");
    }
    if (w.t >= death.tHit + REPLAY_MAX_PAST) return done("hit", { stillThreatened: true });
  }
}

// The same flight again for the canvas, from the replay's moves, with no
// model calls: what the viewer sees is exactly what was tested.
export type Playback = { world: World; step(): RunEvent; done(): boolean; seconds: number };

export function playback(death: Death, result: ReplayResult): Playback {
  const w = structuredClone(death.start);
  const endStep = result.final.steps;
  let i = 0;
  // A move recorded at step k was applied right after physics step k.
  const applyDue = () => {
    while (i < result.moves.length && result.moves[i].step === w.steps) act(w, result.moves[i++].move);
  };
  applyDue();
  return {
    world: w,
    step() {
      const event = stepN(w, 1);
      applyDue();
      return event;
    },
    done: () => !w.alive || w.steps >= endStep,
    seconds: (endStep - w.steps) * SUBSTEP,
  };
}

// Every replay question goes through one queue: at most one question starts
// every `gapMs` (4 a second by default, what the gateway held clean), and a
// failed question is retried twice with backoff before the replay gives up.
export function paced(decide: Decide, gapMs = 250): Decide {
  let next = 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  return async (input) => {
    for (let attempt = 0; ; attempt++) {
      const wait = next - Date.now();
      next = Math.max(next, Date.now()) + gapMs;
      await sleep(wait);
      try {
        return await decide(input);
      } catch (e) {
        if (attempt >= 2) throw e;
        await sleep(1000 * (attempt + 1));
      }
    }
  };
}
