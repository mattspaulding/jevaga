import type { SoundName } from "./types";

type Voice = (name: SoundName, kind?: 0 | 1 | 2, variant?: number) => Float32Array;

// 12 seconds of a busy fight with every sound in it, for judging a set as a
// mix rather than one sound at a time (scripts/sound-lab.ts and /sounds).
export function montage(voice: Voice, rate: number): Float32Array {
  const out = new Float32Array(rate * 12);
  const at = (t: number, s: Float32Array) => {
    const o = Math.round(t * rate);
    for (let i = 0; i < s.length && o + i < out.length; i++) out[o + i] += s[i];
  };
  at(0, voice("start"));
  [1.6, 2.8, 4.0].forEach((t, k) => at(t, voice("swoop", k as 0 | 1 | 2)));
  for (let t = 2.2; t < 10.5; t += 0.36) at(t, voice("shot", undefined, Math.round(t * 10) % 4)); // the player firing steadily
  [3.2, 3.38, 3.56, 3.74, 3.92, 4.1, 4.28].forEach((t, k) => at(t, voice("drip", undefined, k % 4))); // a wave-2 fly-in's Bat bullets
  [2.9, 4.7, 5.9, 7.4, 8.8, 9.9].forEach((t, k) => at(t, voice("pop", ([2, 1, 0, 2, 1, 2] as const)[k], k % 4)));
  at(5.2, voice("tink"));
  at(5.0, voice("rev"));
  at(6.3, voice("flutter"));
  at(7.1, voice("commit"));
  at(6.0, voice("loop"));
  at(7.6, voice("glow"));
  at(8.4, voice("zap"));
  at(8.0, voice("drip", undefined, 1));
  at(10.6, voice("boom"));
  return out;
}
