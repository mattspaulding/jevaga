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
  usage?: { inputTokens: number; outputTokens: number; costUsd: number; cached?: boolean };
};

// The swappable System 1 slot: anything that picks one of the four moves.
export type System1 = { decide(input: DecideInput): Promise<Decision> };

export const MAX_RULES = 8;
export const MAX_RULE_LENGTH = 300;

// Request caps for the public API routes. Real fights describe in at most
// ~1,400 characters and a move in ~175 (measured over 40 seeds), so these
// leave headroom while keeping a stranger's paid call close to a real one.
export const MAX_STATE_LENGTH = 4000;
export const MAX_MOVE_LENGTH = 400;

// Jev starts dumb: one line, no hand-written survival rule. Its rules are
// written by the coach and proven on a replay. Once it has any, the rulebook
// also opens with one fixed line about firing, written by hand. Without it,
// any rule about danger made Jev stop shooting in calm moments too (P(fire)
// 0.73 to 0.23 on 16 calm moments, 2026-10-21) and the judge kept 0 rules in
// 24 runs. With it, Jev fired in 15-16 of 16 under each of four rules and
// still dodged, and 5 rules were kept in 16 runs on seeds 5 and 11.
export function instructionsFor(rules: string[]): string {
  const start = "Pick the ship's next move in a space shooter. Stay alive and shoot enemies.";
  if (!rules.length) return start;
  return `${start}\n\nRules you've learned. Follow each one when its situation comes up. When nothing is arriving where you'd stop and an enemy is above, fire.\n${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
}
