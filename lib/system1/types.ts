import type { Move } from "../game/world";

export type DecideInput = {
  state: string;
  moves: Record<Move, string>;
  playbook: string[];
};

export type Decision = {
  move: Move;
  probabilities: Record<Move, number>;
  confidence: number;
  source: "jev" | "simulated";
};

// The swappable System 1 slot: anything that picks one of the five moves.
export type System1 = { decide(input: DecideInput): Promise<Decision> };

export function instructionsFor(playbook: string[]): string {
  return (
    "Pick the frog's next move in a road-crossing game. Follow the playbook.\nPlaybook:\n" +
    playbook.map((rule, i) => `${i + 1}. ${rule}`).join("\n")
  );
}
