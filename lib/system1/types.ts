import type { Move } from "../game/world";

export type DecideInput = {
  state: string;
  moves: Record<Move, string>;
  plan: string; // the strategist's current plan, given to Jev as its instructions
};

export type Decision = {
  move: Move;
  probabilities: Record<Move, number>;
  confidence: number;
  source: "jev" | "simulated";
  ms?: number; // how long the answer took, measured in the browser
};

// The swappable System 1 slot: anything that picks one of the four moves.
export type System1 = { decide(input: DecideInput): Promise<Decision> };

export const STARTING_PLAN = "Dodge anything about to reach your column; otherwise line up under an enemy and fire.";

export function instructionsFor(plan: string): string {
  return `Pick the ship's next move in a space shooter. Staying alive comes first: never pick a move whose description shows a bullet or diver arriving within 0.6 s. Then follow your coach's plan to score.\nYour coach's plan: ${plan}`;
}
