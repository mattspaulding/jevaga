import { ARRIVAL } from "../describe";
import { MOVES, type Move } from "../game/world";
import type { DecideInput, Decision, System1 } from "./types";

// Offline stand-in with Jev's answer shape, for SYSTEM1=fake. Never shown as
// real: every decision is marked "simulated" and the panel says SIMULATED.
// It reads the same move descriptions Jev does. It dodges anything arriving
// sooner than it's comfortable with, glides onto a dropped weapon when that
// spot is clear, and otherwise fires when something is above. Each rule in the
// rulebook makes it more careful (0.6 s, plus 0.2 s a rule, up to 1.2 s), so
// offline play still gets better as rules are kept. It doesn't read the rules' words.

const arrival = (text: string) => {
  if (/nothing for 2\.5\+ s/.test(text)) return Infinity;
  const m = text.match(ARRIVAL);
  return m ? Number(m[1]) : Infinity;
};
const blocked = (text: string) => /^Can't glide/.test(text); // the edge: same as staying

export const fake: System1 = {
  async decide({ moves, rules }: DecideInput): Promise<Decision> {
    const careful = Math.min(1.2, 0.6 + 0.2 * rules.length);
    const soon = (m: Move) => arrival(moves[m]) < careful;
    const glides = (["left", "right"] as const).filter((m) => !blocked(moves[m]));
    let move: Move = "stay";
    if (soon("stay")) {
      // the option whose first arrival is furthest off
      move = (["stay", ...glides] as Move[]).reduce((a, b) => (arrival(moves[b]) > arrival(moves[a]) ? b : a));
    } else {
      const grab = glides.find((m) => /takes the /.test(moves[m]) && !soon(m));
      if (grab) move = grab;
      else if (/shot reaches|hits /.test(moves.fire)) move = "fire";
    }
    const probabilities = Object.fromEntries(MOVES.map((m) => [m, m === move ? 0.85 : 0.05])) as Record<Move, number>;
    return { move, probabilities, confidence: 0.8, source: "simulated", usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
  },
};
