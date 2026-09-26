import { MOVES, type Move } from "../game/world";
import type { DecideInput, Decision, System1 } from "./types";

// Offline stand-in with Jev's answer shape. Never shown as real: every
// decision is marked "simulated" and the panel says SIMULATED.
// Dodges a bullet or diver due within 0.6 s, otherwise fires if something is above.
const soon = (text: string) => {
  const m = text.match(/(bullet|diver) in (\d+(\.\d+)?) s/);
  return !!m && Number(m[2]) < 0.6;
};
export const fake: System1 = {
  async decide({ moves }: DecideInput): Promise<Decision> {
    let move: Move = "stay";
    if (soon(moves.stay)) move = !soon(moves.left) && !/Can't/.test(moves.left) ? "left" : "right";
    else if (/shot reaches/.test(moves.fire)) move = "fire";
    const probabilities = Object.fromEntries(MOVES.map((m) => [m, m === move ? 0.85 : 0.05])) as Record<Move, number>;
    return { move, probabilities, confidence: 0.85 - 0.05, source: "simulated" };
  },
};
