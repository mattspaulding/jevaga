import { MOVES, type Move } from "../game/world";
import type { DecideInput, Decision, System1 } from "./types";

// Offline stand-in with Jev's answer shape. Never shown as real: every
// decision is marked "simulated" and the panel says SIMULATED.
export const fake: System1 = {
  async decide({ moves, playbook }: DecideInput): Promise<Decision> {
    const knowsToWait = playbook.some((rule) => /\bwait\b/i.test(rule));
    const danger = /this beat/.test(moves.forward);
    const move: Move = knowsToWait && danger ? "wait" : "forward";
    const probabilities = Object.fromEntries(MOVES.map((m) => [m, m === move ? 0.8 : 0.05])) as Record<Move, number>;
    return { move, probabilities, confidence: 0.8 - 0.05, source: "simulated" };
  },
};
