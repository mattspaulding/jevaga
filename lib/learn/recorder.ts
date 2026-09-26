import { gunReadyIn, movePath, restX, targetAbove, threatOnPath, type HitBy, type Move, type World } from "../game/world";
import type { DecideInput, Decision } from "../system1/types";

// The flight recorder. While Jev flies, it keeps a copy of the fight at every
// question and what Jev answered, for the last few seconds. When the ship is
// hit, that becomes a Death: enough to rebuild the fight from just before the
// hit and fly it again, and to tell the coach what Jev saw.

export const REPLAY_LEAD = 1.5; // a replay starts this long before the hit
const KEEP_SECONDS = 4;
const MAX_CONTROLS = 5;
const CONTROL_GAP = 5; // seconds of fight between control moments

export type Asked = {
  t: number;
  state: string;
  moves: Record<Move, string>;
  pick: Move;
  probabilities: Record<Move, number>;
  confidence: number;
};

// When each question was asked and its answer applied, in physics steps. A
// replay asks at the same steps and applies at the same steps, so the only
// thing that can change the outcome is what Jev answers.
export type Beat = { ask: number; answer: number | null }; // null: the hit came before the answer

export type Death = {
  run: number;
  tHit: number;
  hitStep: number; // the physics step the hit landed on
  hitBy: HitBy;
  start: World; // the fight REPLAY_LEAD before the hit (or the run's first question)
  asked: Asked[]; // every answered question from `start` on, oldest first
  schedule: Beat[]; // every question from `start` on, answered or not
  rules: string[]; // the rulebook Jev had
  status: "new" | "fixed" | "luck" | "unsolved";
};

// A calm moment where firing was right: nothing arriving, an enemy above, the
// gun ready. A new rule has to leave Jev firing in these.
export type Control = { state: string; moves: Record<Move, string> };

type Entry = { t: number; world: World; input: DecideInput; answer?: Decision; ask: number; answerStep?: number };

export function isCalm(world: World): boolean {
  return (
    gunReadyIn(world) === 0 &&
    targetAbove(world, restX(world)) !== null &&
    threatOnPath(world, movePath(world, "stay")) === null
  );
}

export function createRecorder() {
  let entries: Entry[] = [];
  let pending: Entry | null = null;
  const controls: Control[] = [];
  let lastControl = -Infinity;
  let live: World | null = null; // the fight being flown, to read the step an answer lands on

  return {
    // Called just before each question, with the live world.
    onAsk(input: DecideInput, world: World) {
      live = world;
      const entry: Entry = { t: world.t, world: structuredClone(world), input, ask: world.steps };
      entries.push(entry);
      pending = entry;
      entries = entries.filter((e) => e.t >= world.t - KEEP_SECONDS);
      if (controls.length < MAX_CONTROLS && world.t - lastControl >= CONTROL_GAP && isCalm(world)) {
        controls.push({ state: input.state, moves: input.moves });
        lastControl = world.t;
      }
    },

    // Called with each answer right after it was applied; questions are asked
    // one at a time, so it belongs to the last one asked.
    onDecision(decision: Decision) {
      if (pending) {
        pending.answer = decision;
        pending.answerStep = live?.steps;
      }
      pending = null;
    },

    // That question got no answer (the fight paused for an outage). It never
    // moved the ship, so it must not appear in the recording.
    onAskFailed() {
      if (pending) entries = entries.filter((e) => e !== pending);
      pending = null;
    },

    // After a hit: the last few seconds as a Death, or null if there's nothing to replay.
    toDeath(run: number, world: World): Death | null {
      if (!world.hitBy || !entries.length) return null;
      const cutoff = world.t - REPLAY_LEAD;
      let from = 0;
      entries.forEach((e, i) => {
        if (e.t <= cutoff) from = i;
      });
      const kept = entries.slice(from);
      return {
        run,
        tHit: world.t,
        hitStep: world.steps,
        hitBy: world.hitBy,
        start: structuredClone(kept[0].world),
        asked: kept
          .filter((e) => e.answer)
          .map((e) => ({
            t: e.t,
            state: e.input.state,
            moves: e.input.moves,
            pick: e.answer!.move,
            probabilities: e.answer!.probabilities,
            confidence: e.answer!.confidence,
          })),
        schedule: kept.map((e) => ({ ask: e.ask, answer: e.answerStep ?? null })),
        rules: kept[0].input.rules,
        status: "new",
      };
    },

    controls: () => controls,
  };
}
