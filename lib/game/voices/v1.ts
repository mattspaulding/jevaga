import type { SoundName, VoiceFn, VoiceOpts, VoiceSet } from "./types";

// The first sounds (slice 13), ported from Web Audio nodes to samples: the
// baseline the retuned sets have to beat. Matt, 2026-09-26: "The sounds aren't very good."

type Wave = "square" | "saw" | "triangle" | "sine";
const shape = (w: Wave, ph: number) =>
  w === "sine" ? Math.sin(2 * Math.PI * ph) : w === "square" ? (ph % 1 < 0.5 ? 1 : -1) : w === "saw" ? 2 * (ph % 1) - 1 : 1 - 4 * Math.abs((ph % 1) - 0.5);

function buffer(rate: number, seconds: number) {
  return new Float32Array(Math.ceil(rate * seconds));
}
// A tone sweeping `from` → `to` (exponentially, or through `via`), with a fast attack and an exponential fade.
function tone(out: Float32Array, rate: number, t: number, o: { w: Wave; from: number; to: number; dur: number; gain: number; via?: number; linear?: boolean }) {
  let ph = 0;
  const n = Math.round(o.dur * rate);
  const o0 = Math.round(t * rate);
  for (let i = 0; i < n && o0 + i < out.length; i++) {
    const u = i / n;
    const f =
      o.via !== undefined
        ? u < 0.5
          ? o.from + (o.via - o.from) * u * 2
          : o.via + (o.to - o.via) * (u - 0.5) * 2
        : o.linear
          ? o.from + (o.to - o.from) * u
          : o.from * Math.pow(o.to / o.from, u);
    ph += f / rate;
    const env = Math.min(1, i / (0.004 * rate)) * Math.pow(0.0001 / 1, u);
    out[o0 + i] += shape(o.w, ph) * o.gain * env;
  }
}
function noise(out: Float32Array, rate: number, t: number, o: { dur: number; gain: number; from: number; to: number; low?: boolean }) {
  let s = 12345;
  let lp = 0;
  const n = Math.round(o.dur * rate);
  const o0 = Math.round(t * rate);
  for (let i = 0; i < n && o0 + i < out.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const white = (s / 0xffffffff) * 2 - 1;
    const u = i / n;
    const fc = o.from * Math.pow(o.to / o.from, u);
    const a = 1 - Math.exp((-2 * Math.PI * fc) / rate);
    lp += a * (white - lp);
    const v = o.low ? lp : white - lp; // lowpassed, or the rest (a rough bandpass)
    out[o0 + i] += v * o.gain * Math.min(1, i / (0.004 * rate)) * Math.pow(0.0001, u);
  }
}
const PITCH = [0.7, 1, 1.4];
const notes = (rate: number, freqs: number[], step: number, w: Wave, gain: number) => {
  const out = buffer(rate, step * freqs.length + step);
  freqs.forEach((f, i) => tone(out, rate, i * step, { w, from: f, to: f * 0.98, dur: step * 1.6, gain }));
  return out;
};
const one = (seconds: number, draw: (out: Float32Array, rate: number, o: VoiceOpts) => void): VoiceFn => (rate, o) => {
  const out = buffer(rate, seconds);
  draw(out, rate, o);
  return out;
};

const voices: Record<SoundName, VoiceFn> = {
  shot: one(0.1, (b, r) => tone(b, r, 0, { w: "square", from: 1400, to: 320, dur: 0.09, gain: 0.1 })),
  pop: one(0.24, (b, r, o) => {
    const p = PITCH[o.kind ?? 1];
    noise(b, r, 0, { dur: 0.22, gain: 0.35, from: 1500 * p, to: 180 });
    tone(b, r, 0, { w: "triangle", from: 700 * p, to: 140 * p, dur: 0.14, gain: 0.12 });
  }),
  tink: one(0.16, (b, r) => {
    tone(b, r, 0, { w: "triangle", from: 2500, to: 2350, dur: 0.14, gain: 0.16 });
    tone(b, r, 0, { w: "sine", from: 3750, to: 3600, dur: 0.09, gain: 0.06 });
  }),
  boom: one(0.92, (b, r) => {
    noise(b, r, 0, { dur: 0.9, gain: 0.7, from: 3000, to: 60, low: true });
    tone(b, r, 0, { w: "square", from: 150, to: 35, dur: 0.6, gain: 0.18 });
  }),
  rev: one(0.82, (b, r) => tone(b, r, 0, { w: "saw", from: 90, to: 340, dur: 0.8, gain: 0.05, linear: true })),
  flutter: one(0.14, (b, r) => {
    tone(b, r, 0, { w: "square", from: 700, to: 1000, dur: 0.05, gain: 0.05 });
    tone(b, r, 0.08, { w: "square", from: 800, to: 1150, dur: 0.05, gain: 0.05 });
  }),
  commit: one(0.12, (b, r) => tone(b, r, 0, { w: "square", from: 500, to: 1600, dur: 0.1, gain: 0.08 })),
  loop: one(0.52, (b, r) => tone(b, r, 0, { w: "sine", from: 420, via: 1000, to: 420, dur: 0.5, gain: 0.09 })),
  glow: one(0.82, (b, r) => tone(b, r, 0, { w: "sine", from: 300, to: 950, dur: 0.8, gain: 0.05, linear: true })),
  zap: one(0.16, (b, r) => {
    tone(b, r, 0, { w: "square", from: 1700, to: 220, dur: 0.14, gain: 0.08 });
    noise(b, r, 0, { dur: 0.06, gain: 0.08, from: 5000, to: 2500 });
  }),
  drip: one(0.08, (b, r) => tone(b, r, 0, { w: "triangle", from: 900, to: 480, dur: 0.07, gain: 0.07 })),
  swoop: one(0.72, (b, r, o) => {
    const p = PITCH[o.kind ?? 1];
    tone(b, r, 0, { w: "sine", from: 1100 * p, via: 480 * p, to: 900 * p, dur: 0.7, gain: 0.08 });
  }),
  wave: (r) => notes(r, [523, 659, 784, 1047], 0.09, "square", 0.06),
  start: (r) => notes(r, [392, 523, 659, 784, 1047, 1319], 0.08, "square", 0.06),
  rewind: one(0.4, (b, r) => {
    for (let i = 0; i < 3; i++) tone(b, r, i * 0.13, { w: "saw", from: 1300, to: 280, dur: 0.12, gain: 0.05 });
  }),
  kept: (r) => notes(r, [1319, 1976], 0.16, "triangle", 0.14),
  reject: one(0.48, (b, r) => {
    tone(b, r, 0, { w: "square", from: 220, to: 180, dur: 0.18, gain: 0.07 });
    tone(b, r, 0.2, { w: "square", from: 165, to: 120, dur: 0.26, gain: 0.07 });
  }),
};

const set: VoiceSet = { name: "v1", description: "the first sounds, as shipped in slice 13 (the baseline)", voices };
export default set;
