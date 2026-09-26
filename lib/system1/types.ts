import type { Move } from "../game/world";

export type DecideInput = {
  state: string;
  moves: Record<Move, string>;
  rules: string[]; // the rulebook Jev has earned so far, in order
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

export const MAX_RULES = 8;
export const MAX_RULE_LENGTH = 300;

// Jev starts dumb: one line, no hand-written survival rule. Everything else
// it knows, it learned from a death and the rule was proven on a replay.
export function instructionsFor(rules: string[]): string {
  const start = "Pick the ship's next move in a space shooter. Stay alive and shoot enemies.";
  if (!rules.length) return start;
  return `${start}\n\nRules you've learned. Follow each one when its situation comes up:\n${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
}
