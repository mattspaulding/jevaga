// Small seeded random generator (mulberry32). The same seed always gives the
// same fight. The state is a plain number, so a world that carries it can be
// copied with structuredClone and replayed exactly.
export function nextRandom(state: number): { state: number; value: number } {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: a, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

// A generator that keeps its own state, for things that are never replayed (the starfield).
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
