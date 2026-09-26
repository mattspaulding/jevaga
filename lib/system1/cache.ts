import type { DecideInput, Decision, System1 } from "./types";

// Remembers Jev's answer for an exact situation (same fight text, same move
// descriptions, same plan) so the same question isn't asked twice.
// Replays of a road, Stop/Start, and many visitors on the same seed all
// repeat questions. It's still Jev's answer; only the network call is saved.
const MAX = 5000;
const answers = new Map<string, Decision>();
export const cacheStats = { hits: 0, misses: 0 };

export function cached(inner: System1): System1 {
  return {
    async decide(input: DecideInput): Promise<Decision> {
      const key = JSON.stringify([input.state, input.moves, input.plan]);
      const hit = answers.get(key);
      if (hit) {
        cacheStats.hits++;
        answers.delete(key);
        answers.set(key, hit); // most recently used goes last
        return hit;
      }
      cacheStats.misses++;
      const decision = await inner.decide(input);
      answers.set(key, decision);
      if (answers.size > MAX) answers.delete(answers.keys().next().value!);
      return decision;
    },
  };
}
