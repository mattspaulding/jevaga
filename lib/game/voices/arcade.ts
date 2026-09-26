import type { SoundName, VoiceFn, VoiceOpts, VoiceSet } from "./types";

// The cabinet's own sound: every pitched sound is read from a 32-step, 4-bit
// wavetable the way Namco's WSG chip did it, and every explosion is a clocked
// noise register through a filter, the way its 54XX noise chip did. Pitch and
// volume move in frame-sized steps, like the game's sound driver updating
// registers, which is where the stair-stepped glides come from.

const TAU = Math.PI * 2;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const expo = (a: number, b: number, u: number) => a * Math.pow(b / a, clamp(u));
const mhz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- wavetables: 32 steps, 16 levels, like the WSG's PROM ----------
// Played back as the exact stepped waveform, but band-limited: each table is
// rebuilt from its own harmonics (steps included) up to just under Nyquist for
// the note being played, so the grain is the chip's and not aliasing.
const TB = 1024;
const SIN = Float32Array.from({ length: TB }, (_, i) => Math.sin((TAU * i) / TB));
type Wave = { re: Float64Array; im: Float64Array; cache: Map<number, Float32Array> };
function table(f: (x: number) => number): Wave {
  const raw = Array.from({ length: 32 }, (_, i) => f(i / 32));
  const peak = Math.max(...raw.map(Math.abs)) || 1;
  const q = raw.map((v) => clamp(Math.round((v / peak) * 7.5 - 0.5) + 0.5, -7.5, 7.5));
  const mean = q.reduce((a, b) => a + b, 0) / 32;
  const x = q.map((v) => (v - mean) / 7.5);
  // Fourier series of the held steps: X_k = D_(k mod 32) * (1 - e^(-i2πk/32)) / (i2πk)
  const re = new Float64Array(257);
  const im = new Float64Array(257);
  for (let k = 1; k <= 256; k++) {
    let dr = 0;
    let di = 0;
    for (let n = 0; n < 32; n++) {
      dr += x[n] * Math.cos((TAU * k * n) / 32);
      di -= x[n] * Math.sin((TAU * k * n) / 32);
    }
    const a = (TAU * k) / 32;
    const hr = Math.sin(a) / (TAU * k); // (1 - e^(-ia)) / (i2πk), real part
    const hi = (Math.cos(a) - 1) / (TAU * k); // imaginary part
    re[k] = dr * hr - di * hi;
    im[k] = dr * hi + di * hr;
  }
  return { re, im, cache: new Map() };
}
function limited(w: Wave, h: number): Float32Array {
  let t = w.cache.get(h);
  if (t) return t;
  t = new Float32Array(TB + 1);
  for (let k = 1; k <= h; k++) {
    const a = 2 * w.re[k];
    const b = -2 * w.im[k];
    if (Math.abs(a) + Math.abs(b) < 1e-6) continue;
    for (let j = 0; j < TB; j++) t[j] += a * SIN[((k * j + TB / 4) | 0) & (TB - 1)] + b * SIN[(k * j) & (TB - 1)];
  }
  t[TB] = t[0];
  w.cache.set(h, t);
  return t;
}
// How many harmonics fit under Nyquist (or under `cap` Hz) at this pitch, rounded so the cache stays small.
function harmonics(hz: number, rate: number, cap = Infinity) {
  const h = Math.max(1, Math.min(256, Math.floor(Math.min(rate * 0.47, cap) / Math.max(1, hz))));
  return h > 96 ? h - (h % 32) : h > 32 ? h - (h % 8) : h > 16 ? h - (h % 4) : h;
}
const partials = (...amps: number[]) => (x: number) => amps.reduce((s, a, k) => s + a * Math.sin(TAU * (k + 1) * x), 0);
const SINE = table(partials(1));
const ORGAN = table(partials(1, 0.5, 0.35, 0.2, 0, 0.1));
const REED = table(partials(1, 0, 0.45, 0, 0.25, 0, 0.12));
const PULSE = table((x) => (x < 0.25 ? 1 : -0.33));
const SQUARE = table((x) => (x < 0.5 ? 1 : -1));
const SAW = table((x) => 1 - 2 * x);

// ---------- envelopes ----------
// Piecewise-linear through [seconds, level] points.
const env =
  (...pts: [number, number][]) =>
  (t: number) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++)
      if (t <= pts[i][0]) {
        const [t0, v0] = pts[i - 1];
        const [t1, v1] = pts[i];
        return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0 || 1);
      }
    return pts[pts.length - 1][1];
  };
// The 54XX shape: an instant punch, a quick drop to `mid`, then a long tail to silence at `len`.
const blast = (len: number, mid: number, curve: number) => (t: number) =>
  t < 0.002 ? t / 0.002 : t < 0.03 ? 1 - ((1 - mid) * (t - 0.002)) / 0.028 : mid * Math.pow(clamp(1 - (t - 0.03) / (len - 0.03)), curve);

// ---------- the WSG voice ----------
type Tone = {
  at?: number;
  dur: number;
  wave: Wave;
  hz: (t: number) => number;
  vol: (t: number) => number;
  gain?: number;
  tick?: number;
  cap?: number; // no harmonic above this many Hz, for voices that should stay dark
  band?: (t: number) => number; // the pitch the harmonic count is chosen from, when hz wobbles across it
  mod?: (t: number) => number; // a smooth per-sample level, after the 4-bit steps, for tremolo and releases
  lp?: (t: number) => number; // a low-pass cutoff in Hz that can move, as on an engine opening up
  q?: number;
};
// Pitch and volume are read `tick` times a second and held (0 = smoothly, every 16 samples);
// volume is 4-bit like the chip's, then slewed over 3 ms so the steps don't click.
function tone(out: Float32Array, rate: number, o: Tone) {
  const s0 = Math.round((o.at ?? 0) * rate);
  const n = Math.min(Math.round(o.dur * rate), out.length - s0);
  const hold = o.tick === 0 ? 16 : rate / (o.tick ?? 120);
  const slew = 1 - Math.exp(-1 / (0.003 * rate));
  const edge = 0.003 * rate;
  const g = o.gain ?? 1;
  let ph = 0;
  let v = 0;
  let inc = 0;
  let tab = limited(o.wave, 1);
  let was = tab; // the table before the last change, crossfaded out over 4 ms so a switch never clicks
  let xf = 1;
  let hNow = 1;
  const xfStep = 1 / (0.004 * rate);
  const glide = 1 - Math.exp(-1 / (0.001 * rate)); // each frame's pitch step lands over ~1 ms: still a stair, minus the splatter
  let now = -1;
  let target = 0;
  let next = 0;
  let nextVol = 0;
  const volHold = Math.min(hold, rate / 240); // volume moves at least 240 times a second, so attacks aren't a frame late
  const k = 1 / (o.q ?? 0.707);
  let w = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    if (o.lp && (i & 15) === 0) w = Math.tan((Math.PI * Math.min(o.lp(i / rate), rate * 0.45)) / rate);
    if (i >= nextVol) {
      target = Math.round(clamp(o.vol(i / rate)) * 15) / 15;
      nextVol += volHold;
    }
    if (i >= next) {
      const t = i / rate;
      const hz = o.hz(t);
      inc = hz / rate;
      const h = harmonics(o.band ? o.band(t) : hz, rate, o.cap);
      const want = limited(o.wave, h);
      if (i === 0) {
        tab = was = want;
        hNow = h;
      } else if (want !== tab && (xf >= 1 || h < hNow)) {
        // A falling pitch waits for the running crossfade to finish. A rising one can't wait (its top
        // harmonics would alias), so mid-fade it swaps only the incoming table, one step apart.
        if (xf >= 1) {
          was = tab;
          xf = 0;
        }
        tab = want;
        hNow = h;
      }
      next += hold;
    }
    v += (target - v) * slew;
    now = now < 0 ? inc : now + (inc - now) * glide;
    ph += now;
    if (ph >= 1) ph -= Math.floor(ph);
    const pos = ph * TB;
    const j = pos | 0;
    const fr = pos - j;
    let y = tab[j] + (tab[j + 1] - tab[j]) * fr;
    if (xf < 1) {
      y = y * xf + (was[j] + (was[j + 1] - was[j]) * fr) * (1 - xf);
      xf += xfStep;
    }
    const fade = Math.min(1, i / edge, (n - 1 - i) / edge);
    let s = y * v * fade * g * (o.mod ? o.mod(i / rate) : 1);
    if (o.lp) {
      const hp = (s - (k + w) * s1 - s2) / (1 + w * (k + w));
      const bp = w * hp + s1;
      s1 = w * hp + bp;
      const lp = w * bp + s2;
      s2 = w * bp + lp;
      s = lp;
    }
    out[s0 + i] += s;
  }
}

// ---------- the 54XX voice: a 15-bit noise register clocked at `clock` Hz, through a state-variable filter ----------
type Hiss = { at?: number; dur: number; clock: (t: number) => number; cutoff: (t: number) => number; q?: number; band?: boolean; vol: (t: number) => number; gain?: number; seed?: number };
function hiss(out: Float32Array, rate: number, o: Hiss) {
  const s0 = Math.round((o.at ?? 0) * rate);
  const n = Math.min(Math.round(o.dur * rate), out.length - s0);
  const k = 1 / (o.q ?? 0.707);
  const edge = 0.002 * rate;
  const g = o.gain ?? 1;
  let lfsr = (o.seed ?? 0x2b4f) & 0x7fff || 1;
  let bit = 1;
  let acc = 0;
  let s1 = 0;
  let s2 = 0;
  let w = 0;
  let step = 0;
  let vol = 0;
  let dv = 0;
  for (let i = 0; i < n; i++) {
    // controls are read every 16 samples (the cutoff through tan), volume ramps linearly between reads
    if ((i & 15) === 0) {
      const t = i / rate;
      step = o.clock(t) / rate;
      w = Math.tan((Math.PI * Math.min(o.cutoff(t), rate * 0.45)) / rate);
      vol = clamp(o.vol(t));
      dv = (clamp(o.vol((i + 16) / rate)) - vol) / 16;
    }
    acc += step;
    while (acc >= 1) {
      acc -= 1;
      const b = (lfsr ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (b << 14);
      bit = lfsr & 1 ? 1 : -1;
    }
    const hp = (bit - (k + w) * s1 - s2) / (1 + w * (k + w));
    const bp = w * hp + s1;
    s1 = w * hp + bp;
    const lp = w * bp + s2;
    s2 = w * bp + lp;
    const fade = Math.min(1, i / edge, (n - 1 - i) / edge);
    out[s0 + i] += (o.band ? bp : lp) * vol * fade * g;
    vol += dv;
  }
}

// ---------- jingles: notes on a step grid, [step, length in steps, MIDI note] ----------
type Note = [number, number, number];
function play(out: Float32Array, rate: number, notes: Note[], step: number, wave: Wave, gain: number) {
  for (const [s, len, m] of notes) {
    const dur = len * step;
    const hz = mhz(m);
    const rel = Math.min(0.03, dur * 0.3);
    const level = (t: number) => 0.6 + 0.4 * Math.exp(-t / 0.05);
    tone(out, rate, {
      at: s * step,
      dur,
      wave,
      gain,
      tick: 240,
      // a little vibrato only on held notes, like the cabinet's longer fanfare notes
      hz: (t) => hz * (t > 0.15 ? 1 + 0.005 * Math.sin(TAU * 6 * (t - 0.15)) : 1),
      vol: (t) => (t < 0.004 ? t / 0.004 : t < dur - rel ? level(t) : level(dur - rel) * clamp((dur - t) / rel)),
    });
  }
}

// ---------- the cabinet's amp: a gentle top-end rolloff, no DC, set to a peak, exact zeros at both ends ----------
function finish(x: Float32Array, rate: number, peak: number, top = 9000): Float32Array {
  const a = 1 - Math.exp((-TAU * top) / rate);
  const r = Math.exp((-TAU * 25) / rate);
  let lp = 0;
  let prev = 0;
  let hp = 0;
  const n = x.length;
  const edge = Math.max(2, Math.round(0.004 * rate));
  let max = 0;
  for (let i = 0; i < n; i++) {
    lp += a * (x[i] - lp);
    hp = r * (hp + lp - prev);
    prev = lp;
    const fade = Math.min(1, i / edge, (n - 1 - i) / edge);
    x[i] = hp * fade;
    max = Math.max(max, Math.abs(x[i]));
  }
  const s = max ? peak / max : 0;
  for (let i = 0; i < n; i++) x[i] *= s;
  x[0] = 0;
  x[n - 1] = 0;
  return x;
}

const variantOf = (o: VoiceOpts) => (o.variant ?? 0) & 3;
const kindOf = (o: VoiceOpts) => o.kind ?? 1;
// Small pitch offsets for the variants: 0 is the reference take.
const VP = [1, 1.045, 0.96, 1.08];

const make =
  (seconds: (o: VoiceOpts) => number, peak: (o: VoiceOpts) => number, draw: (out: Float32Array, rate: number, o: VoiceOpts) => void, top?: number): VoiceFn =>
  (rate, o) => {
    const out = new Float32Array(Math.round(rate * seconds(o)));
    draw(out, rate, o);
    return finish(out, rate, peak(o), top);
  };
const fixed = (v: number) => () => v;

// ---------- the sounds ----------
// Loudness order, set by the peaks below: boom, then pops, then the warnings
// (swoop, glow, commit, rev, loop, zap) at least 3 dB under the pops, then the
// shot, then the drips. A warning that plays every second must never bury a kill.

// A short linear release to silence at `len`, so a held sound doesn't end on a cut.
const tail = (len: number, rel = 0.02) => (t: number) => clamp((len - t) / rel);
type Pair = [number, number];

// An explosion's noise: the register clock and the filter both fall across `dur`, under the 54XX shape.
type Burst = { at?: number; dur: number; seed: number; clock: Pair; cut: Pair; q: number; mid: number; curve: number; gain?: number };
function burst(out: Float32Array, rate: number, b: Burst) {
  hiss(out, rate, {
    at: b.at,
    dur: b.dur,
    seed: b.seed,
    q: b.q,
    gain: b.gain,
    clock: (t) => expo(b.clock[0], b.clock[1], t / b.dur),
    cutoff: (t) => expo(b.cut[0], b.cut[1], t / b.dur),
    vol: blast(b.dur, b.mid, b.curve),
  });
}
// A sine dropping in pitch under a burst, for body.
function thump(out: Float32Array, rate: number, at: number, dur: number, hz: Pair, mid: number, gain: number) {
  tone(out, rate, { at, dur, wave: SINE, tick: 0, gain, hz: (t) => expo(hz[0], hz[1], t / (dur * 0.85)), vol: blast(dur, mid, 1.3) });
}

// Enemy explosions by kind: Cyclops lowest and longest, Drone highest and shortest,
// with the Drone's clock and filter kept low so the smallest enemy isn't the harshest.
const POP: { len: number; peak: number; clock: Pair; cut: Pair; thump: Pair }[] = [
  { len: 0.38, peak: 0.64, clock: [5000, 450], cut: [2600, 280], thump: [190, 48] },
  { len: 0.3, peak: 0.62, clock: [8000, 800], cut: [3600, 450], thump: [270, 70] },
  { len: 0.22, peak: 0.56, clock: [9000, 1300], cut: [3500, 800], thump: [420, 120] },
];
const POP_LEN = [1, 0.95, 1.05, 0.92];
// The Cyclops goes in two bursts, so the two-hit enemy's death is bigger than a one-hit enemy's.
const CYCLOPS_SECOND = { at: 0.07, clock: [3500, 350] as Pair, cut: [1800, 220] as Pair, q: 1.2, mid: 0.6, curve: 1.6, gain: 0.7 };

// The ship: a long blast, a second one as the wreck breaks up, a sub drop, and the
// chip's square falling away to nothing, so it reads as the run ending and not as a big kill.
const BOOM = {
  len: 1.25,
  blast: { dur: 1.25, seed: 0x6e1, q: 0.9, mid: 0.85, curve: 1.0, clock: [12000, 280], cut: [6000, 160] } as Burst,
  breakup: { at: 0.14, dur: 0.6, seed: 0x3a7, q: 1.2, mid: 0.7, curve: 1.3, gain: 0.8, clock: [7000, 500], cut: [3500, 250] } as Burst,
  sub: { dur: 0.7, hz: [150, 32] as Pair, gain: 0.6 },
  wail: { at: 0.05, dur: 1.18, hz: [720, 38] as Pair, gain: 0.42 },
  drive: 1.8,
};

// The dive whistle per kind: a wavetable each, lower and fuller for bigger enemies.
const SWOOP = [
  { len: 0.85, wave: ORGAN, f0: 720, f1: 230, vib: 9, peak: 0.3 },
  { len: 0.72, wave: REED, f0: 1100, f1: 380, vib: 11, peak: 0.18 },
  { len: 0.58, wave: SINE, f0: 1750, f1: 650, vib: 15, peak: 0.2 },
];

// A struck bell for the win chime: partials with their own (faster) decays, [ratio, level, share of length].
const BELL: [number, number, number][] = [
  [1, 1, 1],
  [2, 0.45, 0.6],
  [2.76, 0.3, 0.35],
  [5.4, 0.15, 0.2],
];

const voices: Record<SoundName, VoiceFn> = {
  // The fighter's "pew": a bright pulse sweeping down, with an octave-down square under it for weight.
  shot: make(fixed(0.12), fixed(0.33), (b, r, o) => {
    const p = VP[variantOf(o)];
    const vol = env([0, 1], [0.015, 1], [0.11, 0]);
    tone(b, r, { dur: 0.12, wave: PULSE, tick: 0, hz: (t) => expo(1600 * p, 420 * p, t / 0.1), vol });
    tone(b, r, { dur: 0.12, wave: SQUARE, tick: 0, gain: 0.35, hz: (t) => expo(800 * p, 210 * p, t / 0.1), vol });
  }),

  // Enemy destroyed: noise clocked down from a crack to a rumble, over a falling thump for body.
  pop: make(
    (o) => POP[kindOf(o)].len * POP_LEN[variantOf(o)],
    (o) => POP[kindOf(o)].peak,
    (b, r, o) => {
      const k = POP[kindOf(o)];
      const v = variantOf(o);
      const p = VP[v];
      const len = k.len * POP_LEN[v];
      burst(b, r, { dur: len, seed: 0x1d3 + v * 977, q: 1.1, mid: 0.7, curve: 1.5, clock: [k.clock[0] * p, k.clock[1] * p], cut: [k.cut[0] * p, k.cut[1]] });
      thump(b, r, 0, len * 0.7, [k.thump[0] * p, k.thump[1] * p], 0.6, 0.55);
      if (kindOf(o) === 0) {
        const s = CYCLOPS_SECOND;
        burst(b, r, { ...s, dur: len - s.at, seed: 0x7c1 + v, clock: [s.clock[0] * p, s.clock[1] * p] });
      }
    },
  ),

  // Cyclops armor holds: a struck plate (a 4-bit sine and two inharmonic partials, nothing
  // above 7 kHz), a dull knock, then the eye blinking shut in two quick falling blips.
  tink: make(
    fixed(0.2),
    fixed(0.36),
    (b, r, o) => {
      const p = VP[variantOf(o)];
      const f = 1600 * p;
      const ring = (d: number) => (t: number) => Math.pow(clamp(1 - t / d), 2.5);
      tone(b, r, { dur: 0.17, wave: SINE, tick: 0, cap: 7000, hz: () => f, vol: ring(0.17) });
      tone(b, r, { dur: 0.11, wave: SINE, tick: 0, cap: 7000, gain: 0.5, hz: () => f * 1.5, vol: ring(0.11) });
      tone(b, r, { dur: 0.07, wave: SINE, tick: 0, cap: 7000, gain: 0.4, hz: () => f * 2.76, vol: ring(0.07) });
      hiss(b, r, { dur: 0.014, clock: () => 16000, cutoff: () => 2500, q: 1, gain: 0.8, vol: env([0, 1], [0.014, 0]) });
      tone(b, r, { at: 0.075, dur: 0.035, wave: SQUARE, tick: 0, cap: 5000, gain: 0.28, hz: () => mhz(81) * p, vol: env([0, 1], [0.025, 1], [0.035, 0]) });
      tone(b, r, { at: 0.115, dur: 0.05, wave: SQUARE, tick: 0, cap: 5000, gain: 0.28, hz: () => mhz(76) * p, vol: env([0, 1], [0.03, 1], [0.05, 0]) });
    },
    7000,
  ),

  // The ship explodes. The falling square is the part that says "you lost": nothing else in the set falls that far.
  boom: make(fixed(BOOM.len), fixed(0.85), (b, r) => {
    burst(b, r, BOOM.blast);
    burst(b, r, BOOM.breakup);
    thump(b, r, 0, BOOM.sub.dur, BOOM.sub.hz, 0.8, BOOM.sub.gain);
    const w = BOOM.wail;
    tone(b, r, {
      at: w.at,
      dur: w.dur,
      wave: SQUARE,
      tick: 60,
      cap: 3500,
      gain: w.gain,
      hz: (t) => expo(w.hz[0], w.hz[1], t / w.dur) * (1 + 0.035 * Math.sin(TAU * 7 * t)),
      vol: env([0, 0], [0.03, 1], [0.45, 0.75], [w.dur, 0]),
    });
    // the cabinet amp driven into its rails: the body comes up to meet the first crack, so the loss is the loudest thing in the game
    let m = 0;
    for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
    if (m) for (let i = 0; i < b.length; i++) b[i] = Math.tanh((BOOM.drive * b[i]) / m);
  }),

  // A Drone revving: a low saw and a sub pulse climbing in frame steps, a low-pass opening from
  // 600 Hz to 3 kHz like an engine opening up, and a putter that speeds up until it goes.
  rev: make(fixed(0.8), fixed(0.5), (b, r, o) => {
    const p = [1, 1.03, 0.97, 1.05][variantOf(o)];
    const hz = (t: number) => (80 + 280 * Math.pow(t / 0.8, 1.5)) * p;
    const vol = (t: number) => 0.25 + 0.75 * Math.pow(t / 0.8, 1.2);
    const end = tail(0.8);
    // the putter is smooth and per sample, so it doesn't step with the 4-bit volume
    const mod = (t: number) => (1 - 0.35 * (0.5 + 0.5 * Math.sin(TAU * (14 * t + 20 * t * t)))) * end(t);
    const lp = (t: number) => expo(600, 3000, t / 0.8);
    tone(b, r, { dur: 0.8, wave: SAW, tick: 60, hz, vol, mod, lp, q: 1.1 });
    tone(b, r, { dur: 0.8, wave: PULSE, tick: 60, gain: 0.5, hz: (t) => hz(t) * 0.5, vol, mod, lp, q: 1.1 });
  }),

  // A Bat flaps out: three wingbeats, each a puff of noise whose band falls (a whff, not a hi-hat's tss) and a chirp that climbs.
  flutter: make(fixed(0.25), fixed(0.3), (b, r, o) => {
    const p = VP[variantOf(o)];
    [0, 0.075, 0.15].forEach((at, i) => {
      const up = (1 + i * 0.12) * p;
      hiss(b, r, { at, dur: 0.07, seed: 0x55 + i, clock: () => 7000, cutoff: (t) => expo(1900 * up, 650 * up, t / 0.07), band: true, q: 1.2, vol: env([0, 0], [0.01, 1], [0.07, 0]) });
      tone(b, r, { at, dur: 0.06, wave: REED, tick: 0, cap: 3000, gain: 0.5, hz: (t) => expo(700 * up, 1100 * up, t / 0.05), vol: env([0, 0], [0.008, 1], [0.06, 0]) });
    });
  }),

  // A Bat locks on: two quick beeps and a higher third, the lock-on alarm, low enough not to pierce.
  commit: make(fixed(0.19), fixed(0.2), (b, r) => {
    const beep = (at: number, dur: number, m: number) => tone(b, r, { at, dur, wave: SQUARE, tick: 0, hz: () => mhz(m), vol: env([0, 1], [dur * 0.7, 1], [dur, 0]) });
    beep(0, 0.042, 79);
    beep(0.055, 0.042, 79);
    beep(0.11, 0.075, 84);
  }),

  // A Cyclops loops out: the pitch traces a full circle, up, back through the middle, down and home.
  loop: make(fixed(0.6), fixed(0.24), (b, r, o) => {
    const p = [1, 1.03, 0.97, 1.05][variantOf(o)];
    const circle = (t: number) => Math.pow(2, 0.75 * Math.sin((TAU * t) / 0.58));
    const vol = env([0, 0], [0.02, 1], [0.5, 1], [0.6, 0]);
    tone(b, r, { dur: 0.6, wave: REED, tick: 60, hz: (t) => 680 * p * circle(t), vol });
    tone(b, r, { dur: 0.6, wave: SINE, tick: 60, gain: 0.3, hz: (t) => 1360 * p * circle(t), vol });
  }),

  // A Cyclops's eye charges: a chromatic climb whose steps speed up, a countdown you can hear,
  // over a faint rising whine. Variants start on a different note and climb at a different rate.
  glow: make(fixed(0.8), fixed(0.26), (b, r, o) => {
    const v = variantOf(o);
    const from = 64 + [0, 1, -1, 2][v];
    const steps = [26, 25, 27, 24][v];
    const bend = [1.6, 1.45, 1.75, 1.6][v];
    const stepOf = (t: number) => Math.floor(steps * Math.pow(t / 0.8, bend));
    const end = tail(0.8);
    const vol = (t: number) => 0.12 + 0.88 * Math.pow(t / 0.8, 1.3);
    const mod = (t: number) => (1 - 0.25 * (t / 0.8) * (0.5 + 0.5 * Math.sin(TAU * 30 * t))) * end(t);
    tone(b, r, { dur: 0.8, wave: SINE, tick: 0, hz: (t) => mhz(from + stepOf(t)), vol, mod });
    tone(b, r, { dur: 0.8, wave: ORGAN, tick: 0, gain: 0.3, hz: (t) => mhz(from + 12 + stepOf(t)), vol, mod });
    tone(b, r, { dur: 0.8, wave: SINE, tick: 0, gain: 0.07, hz: (t) => expo(2000, 3600, t / 0.8), vol: (t) => t / 0.8, mod: end });
  }),

  // A Cyclops fires: a buzzing saw that drops fast, wobbled so it sounds like a zap, not a pew.
  zap: make(fixed(0.17), fixed(0.36), (b, r, o) => {
    const p = VP[variantOf(o)];
    const fall = (t: number) => expo(1500 * p, 180 * p, t / 0.16);
    // the harmonic count follows the fall at the wobble's crest, so the wobble never flips it back and forth
    tone(b, r, { dur: 0.17, wave: SAW, tick: 0, hz: (t) => fall(t) * (1 + 0.14 * Math.sin(TAU * 45 * t)), band: (t) => fall(t) * 1.14, vol: env([0, 1], [0.05, 1], [0.17, 0]) });
    hiss(b, r, { dur: 0.03, seed: 0x99, clock: () => 20000, cutoff: () => 4000, band: true, q: 1, gain: 0.6, vol: env([0, 1], [0.03, 0]) });
  }),

  // A Bat drops a bullet: a quick rising bloop, soft and short since it comes in strings of seven.
  drip: make(fixed(0.09), fixed(0.16), (b, r, o) => {
    const p = VP[variantOf(o)];
    tone(b, r, { dur: 0.09, wave: SINE, tick: 0, cap: 5000, hz: (t) => expo(520 * p, 1250 * p, t / 0.05), vol: env([0, 1], [0.015, 1], [0.09, 0]) });
  }),

  // A group flies in: the dive whistle, a falling glide with a warble. Variants shift the pitch and the warble.
  swoop: make(
    (o) => SWOOP[kindOf(o)].len,
    (o) => SWOOP[kindOf(o)].peak,
    (b, r, o) => {
      const k = SWOOP[kindOf(o)];
      const v = variantOf(o);
      const p = [1, 1.04, 0.96, 1.07][v];
      const vib = k.vib + [0, 1, -1, 2][v];
      const hz = (t: number) => expo(k.f0 * p, k.f1 * p, t / k.len) * (1 + 0.035 * Math.sin(TAU * vib * t));
      const vol = env([0, 0], [0.03, 1], [k.len * 0.65, 0.85], [k.len, 0]);
      tone(b, r, { dur: k.len, wave: k.wave, tick: 60, hz, vol });
      if (kindOf(o) === 0) tone(b, r, { dur: k.len, wave: SQUARE, tick: 60, gain: 0.35, hz: (t) => hz(t) * 0.75, vol });
    },
  ),

  // Next wave: a quick G-major climb that stops on an open D and A, the chord that says "again".
  wave: make(fixed(0.95), fixed(0.4), (b, r) => {
    const step = 0.065;
    play(b, r, [[0, 1, 79], [1, 1, 83], [2, 1, 86], [3, 1, 91], [4, 1, 88], [5, 1, 91], [6, 1, 93], [7, 1, 95], [8, 6, 93]], step, ORGAN, 1);
    play(b, r, [[0, 2, 71], [2, 2, 74], [4, 2, 76], [6, 2, 78], [8, 6, 86]], step, PULSE, 0.45);
    play(b, r, [[0, 2, 43], [2, 2, 50], [4, 2, 48], [6, 2, 50], [8, 6, 38]], step, SAW, 0.6);
  }),

  // A run begins: a little march up a D-major arpeggio, through C and B-flat, landing on D major.
  start: make(fixed(1.42), fixed(0.4), (b, r) => {
    const step = 0.075;
    play(b, r, [[0, 1, 74], [1, 1, 78], [2, 1, 81], [3, 1, 86], [4, 2, 84], [6, 1, 81], [7, 1, 82], [8, 2, 84], [10, 1, 86], [11, 1, 88], [12, 6, 90]], step, ORGAN, 1);
    play(b, r, [[0, 2, 66], [2, 2, 69], [4, 2, 76], [6, 2, 77], [8, 2, 76], [10, 2, 79], [12, 6, 81]], step, PULSE, 0.45);
    play(b, r, [[0, 2, 50], [2, 2, 57], [4, 2, 48], [6, 2, 46], [8, 2, 48], [10, 2, 43], [12, 6, 50]], step, SAW, 0.6);
  }),

  // Rewind: a pulse wiggling up fast, like tape spooling back.
  rewind: make(fixed(0.45), fixed(0.26), (b, r) => {
    const tri = (x: number) => 1 - 4 * Math.abs((x % 1) - 0.5);
    tone(b, r, { dur: 0.45, wave: PULSE, tick: 120, hz: (t) => expo(260, 1500, t / 0.45) * (1 + 0.3 * tri(28 * t)), vol: env([0, 0], [0.02, 1], [0.38, 1], [0.45, 0]) });
  }),

  // Rule kept: bells, not the jingles' organ. A strike, an octave leap that rings, and a sparkle on top.
  kept: make(fixed(0.7), fixed(0.45), (b, r) => {
    const bell = (at: number, m: number, dur: number, gain: number) => {
      const f = mhz(m);
      for (const [mul, g, d] of BELL)
        if (f * mul < 7000) tone(b, r, { at, dur: dur * d, wave: SINE, tick: 0, cap: 7000, gain: gain * g, hz: () => f * mul, vol: (t) => Math.pow(clamp(1 - t / (dur * d)), 2.5) });
    };
    bell(0, 72, 0.3, 0.8);
    bell(0.08, 84, 0.62, 1);
    bell(0.08, 76, 0.45, 0.4);
    [96, 100, 103].forEach((m, i) => bell(0.22 + i * 0.05, m, 0.14, 0.3));
  }),

  // Rule thrown out: two sour, buzzy notes falling a tritone, a little softer than the win.
  reject: make(fixed(0.5), fixed(0.26), (b, r) => {
    const note = (at: number, dur: number, m: number) => {
      const vol = env([0, 0], [0.006, 1], [dur - 0.05, 0.85], [dur, 0]);
      const hz = (t: number) => mhz(m) * (1 - 0.05 * clamp((t - dur * 0.4) / (dur * 0.6)));
      tone(b, r, { at, dur, wave: SQUARE, tick: 60, hz, vol });
      tone(b, r, { at, dur, wave: SAW, tick: 60, gain: 0.7, hz: (t) => hz(t) * 1.015, vol });
    };
    note(0, 0.16, 58);
    note(0.18, 0.31, 52);
  }),
};

const set: VoiceSet = {
  name: "arcade",
  description: "Namco cabinet: 4-bit wavetable tones stepped per frame, clocked-noise explosions, three-voice jingles, bell chime for a kept rule",
  voices,
};
export default set;
