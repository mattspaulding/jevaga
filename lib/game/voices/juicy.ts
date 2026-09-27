import type { SoundName, VoiceFn, VoiceOpts, VoiceSet } from "./types";

// Modern retro: chip oscillators (band-limited, so sweeps don't fizz with
// aliasing), but produced like a current indie shooter. Impacts are a click
// on top, a noise body in the middle and a sine thump underneath; each voice
// goes through gentle saturation, and the jingles get a short echo for space.
// Each voice is normalized to a peak so the mix has a fixed pecking order:
// boom, then pops, then the warnings, then the shot, then the drip.

// ---------- building blocks ----------

const TAU = 2 * Math.PI;
const buffer = (rate: number, seconds: number) => new Float32Array(Math.ceil(rate * seconds));

// Seeded noise, so the same arguments always give the same samples.
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

// PolyBLEP: rounds off the square and saw edges so high sweeps stay clean.
function blep(t: number, dt: number) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}
type Wave = "pulse" | "saw" | "tri" | "sine";
function wave(w: Wave, t: number, dt: number, duty: number) {
  switch (w) {
    case "sine":
      return Math.sin(TAU * t);
    case "tri":
      return 1 - 4 * Math.abs(t - 0.5);
    case "saw":
      return 2 * t - 1 - blep(t, dt);
    default: {
      const v = (t < duty ? 1 : -1) + blep(t, dt) - blep((t + 1 - duty) % 1, dt);
      return v - (2 * duty - 1); // a narrow pulse has DC; take it out
    }
  }
}

// Envelope in seconds: linear attack, flat hold, then a power-curve decay
// that reaches exactly 0 at `dur`. A curve (not an exponential to -80 dB)
// keeps the sound audible for most of its length.
const ahd =
  (dur: number, attack: number, hold: number, curve = 2) =>
  (s: number) => {
    if (s < attack) return s / attack;
    if (s < attack + hold) return 1;
    const d = dur - attack - hold;
    const u = Math.max(0, (dur - s) / d);
    return Math.pow(u, curve);
  };
// A swell: starts at `floor` (so a warning is heard from its first moment),
// rises toward the end, then a short release so it ends at 0.
const swell =
  (dur: number, release: number, curve = 2, floor = 0.25) =>
  (s: number) => {
    const rise = Math.min(1, 0.01 + s / (dur - release));
    const body = floor + (1 - floor) * Math.pow(rise, curve);
    const fadeIn = Math.min(1, s / 0.008);
    const fadeOut = s > dur - release ? Math.max(0, (dur - s) / release) : 1;
    return body * fadeIn * fadeOut;
  };

type Osc = {
  at?: number;
  dur: number;
  w: Wave;
  duty?: number;
  f: (s: number, u: number) => number; // Hz at s seconds into the note (u = s / dur)
  env: (s: number) => number;
  gain: number;
  phase?: number;
};
function osc(out: Float32Array, rate: number, o: Osc) {
  const o0 = Math.round((o.at ?? 0) * rate);
  const n = Math.round(o.dur * rate);
  let ph = o.phase ?? 0;
  const duty = o.duty ?? 0.5;
  let dt = 0;
  let e = 0;
  for (let i = 0; i < n && o0 + i < out.length; i++) {
    const s = i / rate;
    // pitch and level move slowly next to the sample rate, so they're worked out every 4 samples
    if ((i & 3) === 0) {
      dt = Math.min(0.49, o.f(s, i / n) / rate);
      e = o.env(s) * o.gain;
    }
    out[o0 + i] += wave(o.w, ph, dt, duty) * e;
    ph += dt;
    if (ph >= 1) ph -= 1;
  }
}

// A state-variable filter whose cutoff can move over time. Returns a function
// that filters one sample; the cutoff is read every 8 samples (a tan each).
type Mode = "lp" | "bp" | "hp";
function svf(rate: number, mode: Mode, fc: (s: number, u: number) => number, q: number, n: number) {
  const k = 1 / q;
  let ic1 = 0;
  let ic2 = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  let i = 0;
  const lp = mode === "lp";
  const bp = mode === "bp";
  return (x: number) => {
    if ((i & 7) === 0) {
      const f = Math.min(rate * 0.45, Math.max(20, fc(i / rate, i / n)));
      const g = Math.tan((Math.PI * f) / rate);
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    i++;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return lp ? v2 : bp ? v1 * k : x - k * v1 - v2;
  };
}

// Filtered noise.
type Noise = {
  at?: number;
  dur: number;
  seed: number;
  mode: Mode;
  fc: (s: number, u: number) => number;
  q?: number;
  env: (s: number) => number;
  gain: number;
  crush?: number; // hold each noise value this many samples (at 44.1 kHz): a grittier, chip-like hiss
};
function noise(out: Float32Array, rate: number, o: Noise) {
  const o0 = Math.round((o.at ?? 0) * rate);
  const n = Math.round(o.dur * rate);
  const r = rng(o.seed);
  const filt = svf(rate, o.mode, o.fc, o.q ?? 0.7, n);
  let held = 0;
  let e = 0;
  const hold = Math.max(1, Math.round(((o.crush ?? 1) * rate) / 44100));
  for (let i = 0; i < n && o0 + i < out.length; i++) {
    if (i % hold === 0) held = r();
    if ((i & 3) === 0) e = o.env(i / rate) * o.gain;
    out[o0 + i] += filt(held) * e;
  }
}

// Soft saturation. The input is scaled to a peak of 1 first, so `drive` means
// the same thing in every voice however loud its layers summed.
function saturate(out: Float32Array, drive: number) {
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  if (m === 0) return;
  const pre = drive / m;
  const norm = 1 / Math.tanh(drive);
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * pre) * norm;
}
// A mono echo with a darkening feedback path: a little room behind the jingles.
function echo(out: Float32Array, rate: number, delay: number, feedback: number, mix: number, damp = 0.35) {
  const d = Math.round(delay * rate);
  const wet = new Float32Array(out.length);
  let lp = 0;
  for (let i = d; i < out.length; i++) {
    lp += damp * (out[i - d] + wet[i - d] * feedback - lp);
    wet[i] = lp;
  }
  for (let i = 0; i < out.length; i++) out[i] += wet[i] * mix;
}
// A tiny room: a few short early reflections, just enough to stop impacts sounding pasted on.
function room(out: Float32Array, rate: number, mix: number) {
  const taps: [number, number][] = [
    [0.011, 0.5],
    [0.019, 0.35],
    [0.029, 0.25],
    [0.041, 0.15],
  ];
  const dry = out.slice();
  for (const [t, g] of taps) {
    const d = Math.round(t * rate);
    for (let i = d; i < out.length; i++) out[i] += dry[i - d] * g * mix;
  }
}
// Last step for every voice: an 18 Hz high-pass takes out the DC that
// saturating a narrow pulse leaves (subtracting the mean would shift the
// silent tail instead), then set the peak (the mix's pecking order), then
// fades so the first and last samples are exactly 0. `fadeOut` is longer on
// voices with an echo tail, so the tail dies away instead of being cut.
function finish(out: Float32Array, rate: number, peak: number, fadeOut = 0.006) {
  const r = Math.exp((-TAU * 18) / rate);
  let x1 = 0;
  let y1 = 0;
  let m = 0;
  for (let i = 0; i < out.length; i++) {
    const y = out[i] - x1 + r * y1;
    x1 = out[i];
    y1 = y;
    out[i] = y;
    m = Math.max(m, Math.abs(y));
  }
  const g = m > 0 ? peak / m : 0;
  const fin = Math.max(2, Math.round(0.001 * rate));
  const fout = Math.max(2, Math.round(fadeOut * rate));
  for (let i = 0; i < out.length; i++) {
    let e = g;
    if (i < fin) e *= i / fin;
    const j = out.length - 1 - i;
    if (j < fout) e *= 0.5 - 0.5 * Math.cos((Math.PI * j) / fout);
    out[i] *= e;
  }
  out[0] = 0;
  out[out.length - 1] = 0;
  return out;
}

// Variants: a small pitch step and a nudge in timing, so a sound heard 3 times
// a second doesn't grate. 0 is the reference take. Warnings get a smaller
// step (VW), so a player learns one sound per warning.
const VP = [1, 1.045, 0.955, 1.09];
const VT = [1, 0.94, 1.06, 0.97];
const VW = [1, 1.025, 0.975, 1.05];
const vi = (o: VoiceOpts) => ((o.variant ?? 0) % 4 + 4) % 4;
const semis = (n: number) => Math.pow(2, n / 12);
const exp = (a: number, b: number, u: number) => a * Math.pow(b / a, Math.min(1, Math.max(0, u)));
const NOTE = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const tri = (x: number) => 1 - 4 * Math.abs((((x % 1) + 1) % 1) - 0.5);

// ---------- the sounds ----------

// The player's shot: a 25% pulse chirping down, a small sub blip so it has
// weight, and a soft tick on the front. Quiet and dull-edged on purpose: it
// plays 3 times a second for the whole run.
const shot: VoiceFn = (rate, o) => {
  const v = vi(o);
  const p = VP[v];
  const dur = 0.11 * VT[v];
  const out = buffer(rate, dur + 0.01);
  const f = (s: number) => 1650 * p * Math.pow(0.35, Math.min(1, s / 0.07));
  osc(out, rate, { dur, w: "pulse", duty: 0.25, f, env: ahd(dur, 0.003, 0.02, 1.6), gain: 0.5 });
  osc(out, rate, { dur, w: "pulse", duty: 0.5, f: (s) => f(s) * 1.006, env: ahd(dur, 0.003, 0.012, 2), gain: 0.22 });
  osc(out, rate, { dur: 0.05, w: "sine", f: (s) => exp(420 * p, 150, s / 0.05), env: ahd(0.05, 0.001, 0.008, 2), gain: 0.4 });
  noise(out, rate, { dur: 0.008, seed: 11 + v, mode: "bp", fc: () => 2600, q: 0.7, env: ahd(0.008, 0.0005, 0.001, 2), gain: 0.12 });
  saturate(out, 1.3);
  return finish(out, rate, 0.24);
};

// An enemy going up: a click, a crunchy noise body whose filter falls, a sine
// thump under it, and a chip "crunch" sweep. The Cyclops, a two-hit boss,
// goes in two bursts, the second one lower; the spiky Drone throws off a
// spray of tiny high shrapnel pings.
const POP = [
  { p: 0.62, dur: 0.36, thump: 1, crunch: 0.45 },
  { p: 1, dur: 0.28, thump: 0.75, crunch: 0.45 },
  { p: 1.45, dur: 0.2, thump: 0.5, crunch: 0.35 },
];
const pop: VoiceFn = (rate, o) => {
  const k = o.kind ?? 1;
  const v = vi(o);
  const c = POP[k];
  const p = c.p * VP[v];
  const dur = c.dur * VT[v];
  const out = buffer(rate, dur + 0.06);
  // transient click, kept below 4 kHz so it snaps without spitting
  noise(out, rate, { dur: 0.01, seed: 101 + v, mode: "bp", fc: () => Math.min(3800, 2600 * p), q: 0.8, env: ahd(0.01, 0.0005, 0.002, 1.5), gain: 0.6 });
  // body: gritty low-mid noise whose filter falls with the debris (the
  // Cyclops's first burst is cut short, so its second one lands as its own hit)
  const bd = k === 0 ? 0.11 * VT[v] : dur;
  noise(out, rate, { dur: bd, seed: 202 + v * 7 + k, mode: "lp", fc: (s, u) => exp(3600 * p, 260 * p, Math.pow(u, 0.6)), q: 1.1, env: ahd(bd, 0.002, (0.03 * c.dur) / 0.3, k === 0 ? 1.4 : 1.8), gain: 1.6, crush: k === 2 ? 3 : 5 });
  // thump
  const td = (0.12 * c.dur) / 0.3;
  osc(out, rate, { dur: td, w: "sine", f: (s) => exp(190 * p, 48 * Math.max(0.8, p), s / td), env: ahd(td, 0.001, 0.015, 1.6), gain: 1.3 * c.thump });
  // chip crunch: a square falling fast, the arcade half of the sound
  const cd = (0.16 * c.dur) / 0.3;
  osc(out, rate, { dur: cd, w: "pulse", duty: 0.5, f: (s) => exp(900 * p, 110 * p, s / cd), env: ahd(cd, 0.001, 0.01, 2), gain: c.crunch });
  if (k === 0) {
    // the second, lower burst 70 ms later: "ba-DOOM", a boss coming apart
    const at = 0.075 * VT[v];
    const d2 = dur - at;
    noise(out, rate, { at, dur: 0.008, seed: 404 + v, mode: "bp", fc: () => 1500, q: 0.8, env: ahd(0.008, 0.0005, 0.002, 1.5), gain: 0.5 });
    noise(out, rate, { at, dur: d2, seed: 303 + v, mode: "lp", fc: (s, u) => exp(2200, 170, Math.pow(u, 0.7)), q: 1, env: ahd(d2, 0.002, 0.03, 1.7), gain: 1.5, crush: 6 });
    osc(out, rate, { at, dur: 0.18, w: "sine", f: (s) => exp(120 * VP[v], 36, s / 0.18), env: ahd(0.18, 0.002, 0.025, 1.6), gain: 1.2 });
  }
  if (k === 2) {
    // shrapnel: three tiny falling triangle pings scattered after the hit
    const bits: [number, number][] = [
      [0.028, 2500],
      [0.052, 1900],
      [0.083, 2900],
    ];
    for (const [t, f0] of bits) osc(out, rate, { at: t * VT[v], dur: 0.024, w: "tri", f: (s) => f0 * VP[v] * (1 - 2 * s), env: ahd(0.024, 0.001, 0.003, 1.6), gain: 0.4 });
  }
  saturate(out, 2);
  room(out, rate, 0.3);
  return finish(out, rate, 0.48);
};

// Armor holds: a metallic ping (inharmonic partials, like struck plate), a
// dull knock underneath so it still reads as a hit, and a quick two-note
// "shut" blink for the eye closing. Tonal and bright, so it can't be a pop.
const tink: VoiceFn = (rate, o) => {
  const v = vi(o);
  const p = VP[v];
  const dur = 0.22;
  const out = buffer(rate, dur);
  const f0 = 1480 * p;
  const partials: [number, number, number][] = [
    [1, 1, 0.2],
    [2.76, 0.55, 0.12],
    [5.4, 0.3, 0.07],
    [1.5, 0.35, 0.16],
  ];
  for (const [m, g, d] of partials) osc(out, rate, { dur: d, w: "sine", f: () => f0 * m, env: ahd(d, 0.0008, 0.006, 2.2), gain: g * 0.6 });
  osc(out, rate, { dur: 0.05, w: "tri", f: (s) => exp(420, 260, s / 0.05), env: ahd(0.05, 0.001, 0.006, 2), gain: 0.45 });
  osc(out, rate, { at: 0.06, dur: 0.04, w: "pulse", duty: 0.25, f: () => 990 * p, env: ahd(0.04, 0.002, 0.015, 1.5), gain: 0.16 });
  osc(out, rate, { at: 0.1, dur: 0.05, w: "pulse", duty: 0.25, f: () => 740 * p, env: ahd(0.05, 0.002, 0.015, 1.5), gain: 0.16 });
  saturate(out, 1.3);
  return finish(out, rate, 0.32);
};

// The ship dies: the biggest thing in the set. A heavy sine drop, a wide
// noise blast whose filter closes over a second, a second smaller blast, a
// crackle of debris, and a falling, wavering wail under it all so it reads as
// a loss and not just a bigger pop.
const boom: VoiceFn = (rate) => {
  const dur = 1.25;
  const out = buffer(rate, dur + 0.05);
  noise(out, rate, { dur: 0.02, seed: 7, mode: "bp", fc: () => 2500, q: 0.6, env: ahd(0.02, 0.0005, 0.004, 1.5), gain: 0.6 });
  noise(out, rate, { dur, seed: 8, mode: "lp", fc: (s, u) => exp(5500, 110, Math.pow(u, 0.5)), q: 0.9, env: ahd(dur, 0.003, 0.12, 2.2), gain: 1.7, crush: 4 });
  noise(out, rate, { dur: 0.9, seed: 9, mode: "bp", fc: (s, u) => exp(1000, 180, u), q: 1.6, env: ahd(0.9, 0.002, 0.1, 1.6), gain: 1.3 });
  osc(out, rate, { dur: 0.55, w: "sine", f: (s) => exp(130, 32, s / 0.45), env: ahd(0.55, 0.002, 0.08, 1.8), gain: 1.4 });
  osc(out, rate, { dur: 0.7, w: "pulse", duty: 0.5, f: (s) => exp(420, 35, s / 0.7), env: ahd(0.7, 0.002, 0.05, 2), gain: 0.3 });
  // a second, smaller blast just after the first: "ka-boom" rather than one hit
  noise(out, rate, { at: 0.16, dur: 0.5, seed: 10, mode: "lp", fc: (s, u) => exp(3000, 150, u), q: 1, env: ahd(0.5, 0.002, 0.04, 2), gain: 1.1, crush: 6 });
  osc(out, rate, { at: 0.16, dur: 0.3, w: "sine", f: (s) => exp(95, 30, s / 0.3), env: ahd(0.3, 0.002, 0.04, 1.8), gain: 0.9 });
  // the wail: a saw and triangle falling from 620 Hz with a slow waver, the ship's engine dying
  const wail = (s: number, u: number) => exp(620, 95, Math.pow(u, 0.8)) * (1 + 0.035 * Math.sin(TAU * 7 * s));
  osc(out, rate, { at: 0.1, dur: 0.95, w: "tri", f: wail, env: ahd(0.95, 0.07, 0.2, 1.6), gain: 0.4 });
  osc(out, rate, { at: 0.1, dur: 0.95, w: "saw", f: (s, u) => wail(s, u) * 1.004, env: ahd(0.95, 0.07, 0.15, 1.8), gain: 0.16 });
  // debris: sparse crackles, about 40 a second thinning to 10, high-passed at 4 kHz
  const r = rng(99);
  const hp = Math.exp((-TAU * 4000) / rate);
  let lp = 0;
  const c0 = Math.round(0.08 * rate);
  const c1 = Math.round(0.95 * rate);
  for (let i = c0; i < c1; i++) {
    const u = (i - c0) / (c1 - c0);
    const c = (r() + 1) / 2 < (40 - 30 * u) / rate ? r() * (1 - u) : 0;
    lp = c + hp * (lp - c);
    out[i] += (c - lp) * 1.5;
  }
  saturate(out, 2.6);
  room(out, rate, 0.45);
  return finish(out, rate, 0.8);
};

// A Drone revving for 0.8 s: a dark saw and pulse engine climbing in pitch,
// a fast engine flutter on the pitch and a throb that speeds up, through a
// low-pass that opens from 700 Hz as it winds up. Heard from
// the first moment, loudest right before it plunges.
const rev: VoiceFn = (rate, o) => {
  const p = VW[vi(o)];
  const dur = 0.8;
  const out = buffer(rate, dur);
  const env = swell(dur, 0.025, 1.6, 0.45);
  const f = (s: number, u: number) => exp(80 * p, 340 * p, Math.pow(u, 1.3)) * (1 + 0.04 * Math.sin(TAU * 28 * s));
  const tmp = buffer(rate, dur);
  osc(tmp, rate, { dur, w: "saw", f, env, gain: 0.6 });
  osc(tmp, rate, { dur, w: "pulse", duty: 0.3, f: (s, u) => f(s, u) * 1.004, env, gain: 0.35 });
  osc(tmp, rate, { dur, w: "saw", f: (s, u) => f(s, u) * 1.505, env, gain: 0.15 });
  const n = tmp.length;
  const lp = svf(rate, "lp", (s, u) => exp(700, 4200, Math.pow(u, 1.2)), 1.6, n);
  // the throb: an engine sputter from 14 Hz up to 38 Hz
  let lfo = 0;
  for (let i = 0; i < n; i++) {
    lfo += (14 + 24 * (i / n)) / rate;
    out[i] = lp(tmp[i]) * (0.7 + 0.3 * Math.sin(TAU * lfo));
  }
  saturate(out, 1.4);
  return finish(out, rate, 0.36, 0.004);
};

// A Bat flapping out: three quick leathery wing beats, each a burst of
// band-passed noise falling like a wing's "whff", with a tiny rising chirp.
const flutter: VoiceFn = (rate, o) => {
  const v = vi(o);
  const p = VP[v];
  const dur = 0.27;
  const out = buffer(rate, dur);
  [0, 0.075, 0.15].forEach((t, i) => {
    const d = 0.1;
    noise(out, rate, { at: t, dur: d, seed: 41 + i + v * 3, mode: "bp", fc: (s, u) => exp(1600 * p, 650 * p, u), q: 1.4, env: ahd(d, 0.006, 0.01, 2), gain: 1.4 - i * 0.15 });
    osc(out, rate, { at: t, dur: 0.05, w: "pulse", duty: 0.5, f: (s) => exp(620 * p, 980 * p, s / 0.05) * semis(i * 2), env: ahd(0.05, 0.002, 0.01, 2), gain: 0.22 });
  });
  saturate(out, 1.4);
  return finish(out, rate, 0.34);
};

// A Bat locks on: beep-beep-BEEP, the lock-on alarm. Repetition is what
// makes it read as a warning (a rising interval alone sounds like a pickup).
// The last beep is a fourth up and trills at 32 Hz. Pure tone, square
// rounded by a triangle, and kept in the mids so it doesn't pierce.
const commit: VoiceFn = (rate, o) => {
  const p = VW[vi(o)];
  const out = buffer(rate, 0.19);
  const beeps: [number, number, number, number][] = [
    [0, 0.042, 988, 0],
    [0.055, 0.042, 988, 0],
    [0.11, 0.078, 1319, 0.025],
  ];
  for (const [t, d, f0, trill] of beeps) {
    const f = (s: number) => f0 * p * (1 + trill * Math.sin(TAU * 32 * s));
    const env = ahd(d, 0.002, d * 0.6, 1.3);
    osc(out, rate, { at: t, dur: d, w: "pulse", duty: 0.5, f, env, gain: 0.3 });
    osc(out, rate, { at: t, dur: d, w: "tri", f, env, gain: 0.6 });
  }
  saturate(out, 1.15);
  return finish(out, rate, 0.26);
};

// A Cyclops looping out: the pitch traces a full circle, up, back through the
// middle, down and home, like the flight path. Lower and rounder than the
// Bat and Drone sounds, a triangle over a soft square an octave down.
const loop: VoiceFn = (rate, o) => {
  const p = VW[vi(o)];
  const dur = 0.6;
  const out = buffer(rate, dur + 0.08);
  const f = (s: number) => 420 * p * Math.pow(2, 0.7 * Math.sin((TAU * s) / 0.57)) * (1 + 0.015 * Math.sin(TAU * 9 * s));
  const env = (s: number) => Math.min(1, s / 0.02) * Math.min(1, (dur - s) / 0.1);
  osc(out, rate, { dur, w: "tri", f, env, gain: 0.8 });
  osc(out, rate, { dur, w: "pulse", duty: 0.5, f: (s) => f(s) * 0.5, env, gain: 0.18 });
  osc(out, rate, { dur, w: "sine", f: (s) => f(s) * 2, env, gain: 0.1 });
  saturate(out, 1.3);
  echo(out, rate, 0.07, 0.15, 0.12);
  return finish(out, rate, 0.28, 0.03);
};

// A Cyclops charging its eye for 0.8 s: a triangle climbing a chromatic
// staircase whose steps come faster and faster, an audible countdown to the
// shot, with a fifth fading in over it and a shimmer that speeds up. Clean
// and bright where the rev is buzzy and low.
const glow: VoiceFn = (rate, o) => {
  const p = VW[vi(o)];
  const dur = 0.8;
  const out = buffer(rate, dur);
  const env = swell(dur, 0.02, 1.8, 0.3);
  const f = (s: number) => NOTE(60 + Math.floor(24 * Math.pow(s / dur, 1.6))) * p;
  const tmp = buffer(rate, dur);
  osc(tmp, rate, { dur, w: "tri", f, env, gain: 0.7 });
  osc(tmp, rate, { dur, w: "sine", f: (s) => f(s) * 1.5, env: (s) => env(s) * Math.min(1, s / 0.4), gain: 0.35 });
  osc(tmp, rate, { dur, w: "sine", f: (s) => f(s) * 2.003, env: (s) => env(s) * Math.pow(s / dur, 2), gain: 0.15 });
  let lfo = 0;
  for (let i = 0; i < tmp.length; i++) {
    const u = i / tmp.length;
    lfo += (6 + 34 * u * u) / rate;
    out[i] = tmp[i] * (0.78 + 0.22 * Math.sin(TAU * lfo));
  }
  saturate(out, 1.1);
  return finish(out, rate, 0.34, 0.004);
};

// The Cyclops fires: a fat, buzzy laser. Lower and longer than the player's
// shot, with an FM growl and a short hiss on the front, so the two never blur.
const zap: VoiceFn = (rate, o) => {
  const v = vi(o);
  const p = VP[v];
  const dur = 0.18 * VT[v];
  const out = buffer(rate, dur);
  const f = (s: number) => exp(1500 * p, 180 * p, s / (dur * 0.85)) * (1 + 0.2 * Math.sin(TAU * 55 * s));
  osc(out, rate, { dur, w: "saw", f, env: ahd(dur, 0.002, 0.03, 1.5), gain: 0.5 });
  osc(out, rate, { dur, w: "pulse", duty: 0.5, f: (s) => f(s) * 0.502, env: ahd(dur, 0.002, 0.03, 1.8), gain: 0.4 });
  noise(out, rate, { dur: 0.035, seed: 61 + v, mode: "bp", fc: () => 3000, q: 0.7, env: ahd(0.035, 0.001, 0.004, 2), gain: 0.25 });
  saturate(out, 1.4);
  return finish(out, rate, 0.29);
};

// A Bat drops a bullet: a small round "bloop", a sine with a quick upward
// flick like a water drop. Soft, so seven in a row don't pile up.
const drip: VoiceFn = (rate, o) => {
  const v = vi(o);
  const p = VP[v];
  const dur = 0.09 * VT[v];
  const out = buffer(rate, dur);
  osc(out, rate, { dur, w: "sine", f: (s) => exp(520 * p, 1350 * p, s / 0.045), env: ahd(dur, 0.002, 0.015, 1.8), gain: 0.8 });
  osc(out, rate, { dur, w: "tri", f: (s) => exp(520 * p, 1350 * p, s / 0.045) * 0.5, env: ahd(dur, 0.002, 0.01, 2.2), gain: 0.35 });
  saturate(out, 1.2);
  return finish(out, rate, 0.17);
};

// A fly-in group appears: the dive whistle, a falling glide with a 5 to 7%
// warble, and only a breath of air behind it. The kinds differ in register
// and timbre: Cyclops a low square with a triangle an octave down, Bat a
// reedy 25% pulse that warbles like wings, Drone a quicker, higher whistle.
const SWOOP = [
  { dur: 0.76, from: 640, to: 190, duty: 0.5, wob: 7, depth: 0.05, air: 600, lead: 0.4, sub: 0.45, peak: 0.3 },
  { dur: 0.68, from: 1150, to: 400, duty: 0.25, wob: 12, depth: 0.07, air: 900, lead: 0.4, sub: 0.25, peak: 0.28 },
  { dur: 0.55, from: 1800, to: 700, duty: 0.25, wob: 17, depth: 0.05, air: 1100, lead: 0.25, sub: 0.15, peak: 0.26 },
];
const swoop: VoiceFn = (rate, o) => {
  const k = o.kind ?? 1;
  const v = vi(o);
  const c = SWOOP[k];
  const p = VP[v];
  const out = buffer(rate, c.dur + 0.12);
  const f = (s: number, u: number) => exp(c.from * p, c.to * p, Math.pow(u, 0.8)) * (1 + c.depth * Math.sin(TAU * c.wob * s));
  const env = (s: number) => Math.min(1, s / 0.04) * (1 - Math.pow(Math.min(1, s / c.dur), 2.5));
  // the whistle itself: a triangle, with the kind's pulse on top for colour
  osc(out, rate, { dur: c.dur, w: "tri", f, env, gain: 0.6 });
  osc(out, rate, { dur: c.dur, w: "pulse", duty: c.duty, f, env, gain: c.lead });
  osc(out, rate, { dur: c.dur, w: "tri", f: (s, u) => f(s, u) * 0.5, env, gain: c.sub });
  noise(out, rate, { dur: c.dur, seed: 71 + k, mode: "bp", fc: (s, u) => exp(c.air * 1.6, c.air * 0.6, u), q: 1.3, env, gain: 0.25 });
  saturate(out, 1.3);
  echo(out, rate, 0.09, 0.2, 0.18);
  return finish(out, rate, c.peak, 0.03);
};

// A little chip band: a lead pulse, a softer pulse an octave below, and a
// triangle bass, played from a note list, then an echo for space. The tail
// is long enough for the echo to die away on its own.
type Note = [number, number, number, number?]; // start beat, length in beats, midi, bass midi
function band(rate: number, beat: number, notes: Note[], tail: number, peak: number) {
  const end = Math.max(...notes.map(([b, l]) => (b + l) * beat));
  const out = buffer(rate, end + tail);
  for (const [b, l, m, bass] of notes) {
    const t = b * beat;
    const d = l * beat;
    const hold = Math.max(0.01, d * 0.55);
    const vib = (s: number) => (s > 0.12 ? 1 + 0.006 * Math.sin(TAU * 6 * (s - 0.12)) : 1);
    osc(out, rate, { at: t, dur: d, w: "pulse", duty: 0.25, f: (s) => NOTE(m) * vib(s), env: ahd(d, 0.003, hold, 1.4), gain: 0.5 });
    osc(out, rate, { at: t, dur: d, w: "pulse", duty: 0.5, f: (s) => NOTE(m - 12) * 1.004 * vib(s), env: ahd(d, 0.003, hold, 1.6), gain: 0.15 });
    if (bass !== undefined) osc(out, rate, { at: t, dur: d, w: "tri", f: () => NOTE(bass), env: ahd(d, 0.004, hold, 1.4), gain: 0.55 });
    // a soft tick of noise on each note: the hi-hat of the band
    noise(out, rate, { at: t, dur: 0.018, seed: m, mode: "bp", fc: () => 5500, q: 0.8, env: ahd(0.018, 0.0005, 0.002, 2), gain: 0.12 });
  }
  saturate(out, 1.2);
  echo(out, rate, 0.11, 0.25, 0.26);
  return finish(out, rate, peak, 0.04);
}

// A run begins: a rising call and answer ending on a held major chord.
const start: VoiceFn = (rate) =>
  band(
    rate,
    0.09,
    [
      [0, 1, 67, 43],
      [1, 1, 72, 48],
      [2, 1, 76, 48],
      [3, 1, 79, 48],
      [4, 1, 76, 50],
      [5, 1, 79, 50],
      [6, 1, 83, 55],
      [7, 6, 84, 48],
      [7, 6, 79],
    ],
    0.25,
    0.36,
  );

// The next wave: a short rising arpeggio that ends up a step, so it feels like "again, harder".
const waveJingle: VoiceFn = (rate) =>
  band(
    rate,
    0.08,
    [
      [0, 1, 72, 48],
      [1, 1, 76, 48],
      [2, 1, 79, 48],
      [3, 1, 84, 48],
      [4, 1, 79, 50],
      [5, 6, 86, 50],
      [5, 6, 81],
    ],
    0.25,
    0.34,
  );

// The game rewinds: tape spooling backwards. A saw whirring up from 220 to
// 1400 Hz (the boom falls, so this must rise or it sounds like more of the
// death), wiggling ±6% at 26 Hz like a loose reel, with the reels' chatter
// on it as a rounded amplitude flutter that speeds up with the tape.
const rewind: VoiceFn = (rate) => {
  const dur = 0.5;
  const out = buffer(rate, dur + 0.08);
  const WIGGLE = 0.06;
  const f = (s: number, u: number) => exp(220, 1400, Math.pow(u, 1.1)) * (1 + WIGGLE * tri(26 * s));
  const env = (s: number) => Math.min(1, s / 0.02) * Math.min(1, (dur - s) / 0.06);
  const tmp = buffer(rate, dur);
  osc(tmp, rate, { dur, w: "saw", f, env, gain: 0.45 });
  osc(tmp, rate, { dur, w: "tri", f: (s, u) => f(s, u) * 0.5, env, gain: 0.4 });
  noise(tmp, rate, { dur, seed: 81, mode: "bp", fc: (s, u) => exp(900, 3500, u), q: 1, env, gain: 0.12 });
  // chatter: a clipped sine rather than a hard gate, so each tick has a ~2 ms edge instead of a one-sample jump
  const soft = Math.tanh(3);
  let lfo = 0;
  for (let i = 0; i < tmp.length; i++) {
    lfo += (18 + 16 * (i / tmp.length)) / rate;
    out[i] = tmp[i] * (0.72 + 0.28 * (Math.tanh(3 * Math.sin(TAU * lfo)) / soft));
  }
  saturate(out, 1.4);
  echo(out, rate, 0.06, 0.15, 0.12);
  return finish(out, rate, 0.32, 0.03);
};

// The rule is kept: a bright bell arpeggio up a major chord to the octave,
// with a sparkle on top. Unmistakably good news.
const kept: VoiceFn = (rate) => {
  const out = buffer(rate, 0.8);
  const notes = [76, 79, 84, 88];
  notes.forEach((m, i) => {
    const t = i * 0.065;
    const d = i === notes.length - 1 ? 0.45 : 0.22;
    const f = NOTE(m);
    osc(out, rate, { at: t, dur: d, w: "pulse", duty: 0.5, f: () => f, env: ahd(d, 0.002, 0.03, 1.8), gain: 0.32 });
    osc(out, rate, { at: t, dur: d, w: "sine", f: () => f * 2, env: ahd(d, 0.001, 0.01, 2.5), gain: 0.28 });
    osc(out, rate, { at: t, dur: d, w: "tri", f: () => f * 0.5, env: ahd(d, 0.003, 0.03, 1.5), gain: 0.4 });
  });
  // sparkle: a few quick high blips at the end
  [0, 0.05, 0.1].forEach((t, i) => osc(out, rate, { at: 0.26 + t, dur: 0.06, w: "sine", f: () => NOTE(96 + i * 4), env: ahd(0.06, 0.001, 0.01, 2), gain: 0.12 }));
  saturate(out, 1.3);
  echo(out, rate, 0.1, 0.25, 0.28);
  return finish(out, rate, 0.4, 0.04);
};

// The rule is thrown out: a low, sour two-step buzz falling a tritone,
// detuned against itself so it beats. The chime's opposite, and a little
// quieter than it, so a thrown-out rule doesn't punish the ear.
const reject: VoiceFn = (rate) => {
  const out = buffer(rate, 0.5);
  const steps: [number, number, number][] = [
    [0, 0.17, 196],
    [0.19, 0.3, 139],
  ];
  for (const [t, d, f0] of steps) {
    const f = (s: number) => f0 * (1 - 0.04 * (s / d));
    osc(out, rate, { at: t, dur: d, w: "saw", f, env: ahd(d, 0.003, d * 0.6, 1.4), gain: 0.45 });
    osc(out, rate, { at: t, dur: d, w: "pulse", duty: 0.5, f: (s) => f(s) * 1.03, env: ahd(d, 0.003, d * 0.6, 1.4), gain: 0.4 });
    osc(out, rate, { at: t, dur: d, w: "tri", f: (s) => f(s) * 0.5, env: ahd(d, 0.003, d * 0.6, 1.4), gain: 0.5 });
  }
  saturate(out, 1.6);
  return finish(out, rate, 0.32);
};

// ---------- the weapons slice ----------

// Sparse crackle: random clicks at `perSec(u)` a second, high-passed at `hpHz`
// so they snap like static rather than thump. Seeded, like all the noise.
function crackle(out: Float32Array, rate: number, at: number, dur: number, seed: number, perSec: (u: number) => number, hpHz: number, gain: number) {
  const r = rng(seed);
  const hp = Math.exp((-TAU * hpHz) / rate);
  let lp = 0;
  const c0 = Math.round(at * rate);
  const c1 = Math.min(out.length, c0 + Math.round(dur * rate));
  for (let i = c0; i < c1; i++) {
    const u = (i - c0) / (c1 - c0);
    const c = (r() + 1) / 2 < perSec(u) / rate ? r() : 0;
    lp = c + hp * (lp - c);
    out[i] += (c - lp) * gain;
  }
}

// A carrier drops its weapon: a flip, then a little bell figure falling down
// G major (D6 B5 G5 D5, the key grab climbs back up) as it tumbles toward the
// player's row. The flip waits 50 ms so it lands after the pop's crack
// instead of under it, and the tumble is only a 16 Hz tremolo on the bells,
// so the pitch steps down cleanly and never glides like a swoop.
const drop: VoiceFn = (rate, o) => {
  const v = vi(o);
  const p = VP[v];
  const tt = VT[v];
  const out = buffer(rate, 0.44);
  // the flip: two quick rising blips, like something spinning over
  [0.05, 0.095].forEach((t, i) => {
    const d = 0.04;
    osc(out, rate, { at: t * tt, dur: d, w: "tri", f: (s) => exp(900 * p, 2100 * p, s / d) * semis(i * 3), env: ahd(d, 0.002, 0.01, 1.6), gain: 0.55 });
    osc(out, rate, { at: t * tt, dur: d, w: "pulse", duty: 0.25, f: (s) => exp(900 * p, 2100 * p, s / d) * semis(i * 3), env: ahd(d, 0.002, 0.006, 2), gain: 0.14 });
  });
  // the fall: four bells a step apart, each ringing into the next, all under one tumble
  const at = 0.14 * tt;
  const step = 0.06 * tt;
  const tumble = (s: number) => 0.62 + 0.38 * Math.cos(TAU * 16 * s);
  [86, 83, 79, 74].forEach((m, i) => {
    const t = at + i * step;
    const d = i === 3 ? 0.1 : 0.11;
    const f0 = NOTE(m);
    const g = 1 - i * 0.08;
    const env = ahd(d, 0.002, 0.012, 2.2);
    const tr = (s: number) => env(s) * tumble(t - at + s);
    osc(out, rate, { at: t, dur: d, w: "sine", f: () => f0, env: tr, gain: 0.5 * g });
    osc(out, rate, { at: t, dur: d, w: "tri", f: () => f0, env: tr, gain: 0.3 * g });
  });
  saturate(out, 1.2);
  echo(out, rate, 0.07, 0.15, 0.12);
  return finish(out, rate, 0.22, 0.02);
};

// The player takes a weapon: a fast power-up run up G major (the drop's
// bells, climbed back up), each note a narrow pulse that slides up into its
// pitch, over a triangle sweep rising under the whole run, landing on the root
// G5 held with vibrato. Quicker and buzzier than the kept chime, which is
// slower bells.
const grab: VoiceFn = (rate) => {
  const out = buffer(rate, 0.56);
  const notes = [59, 62, 67, 71, 74, 79];
  const step = 0.036;
  notes.forEach((m, i) => {
    const last = i === notes.length - 1;
    const t = i * step;
    const d = last ? 0.26 : step * 1.6;
    const f0 = NOTE(m);
    const f = (s: number) => f0 * exp(0.94, 1, s / 0.012) * (last && s > 0.06 ? 1 + 0.012 * Math.sin(TAU * 9 * (s - 0.06)) : 1);
    const env = ahd(d, 0.002, last ? 0.06 : d * 0.4, last ? 1.6 : 1.4);
    osc(out, rate, { at: t, dur: d, w: "pulse", duty: 0.125, f, env, gain: 0.36 });
    osc(out, rate, { at: t, dur: d, w: "pulse", duty: 0.5, f: (s) => f(s) * 0.5 * 1.003, env, gain: 0.2 });
  });
  // the sweep underneath: a triangle rising two octaves across the run
  const sd = notes.length * step + 0.06;
  osc(out, rate, { dur: sd, w: "tri", f: (s, u) => exp(196, 784, u), env: ahd(sd, 0.01, sd * 0.6, 1.5), gain: 0.26 });
  // a pinch of sparkle on the landing
  osc(out, rate, { at: 5 * step + 0.02, dur: 0.07, w: "sine", f: () => NOTE(98), env: ahd(0.07, 0.001, 0.01, 2), gain: 0.1 });
  saturate(out, 1.3);
  echo(out, rate, 0.08, 0.2, 0.2);
  // 0.38 rather than 0.36: the lower run has less energy per peak, and this
  // keeps its loudest 50 ms where the higher run had it
  return finish(out, rate, 0.38, 0.04);
};

// A carrier Cyclops lines up its Eye Beam for 0.8 s: a siren. It opens on a
// bright stab of the alarm itself, so it's already louder than the glow in
// its first 200 ms. Then two narrow pulses a semitone apart (the clash is
// what makes it an alarm, where the glow is clean) glide up two octaves
// together, hopping up a fourth on every other beat of a stutter that speeds
// from 8 to 30 a second: hi-lo, hi-lo, faster, like a klaxon. A hiss rises
// with it. Still under the pops.
const warn: VoiceFn = (rate, o) => {
  const p = VW[vi(o)];
  const dur = 0.8;
  const out = buffer(rate, dur);
  const env = swell(dur, 0.02, 1.6, 0.3);
  // stutter phase in cycles: its rate climbs from 8 to 30 Hz as 8 + 22u²
  const beat = (s: number) => 8 * s + (22 * s * s * s) / (3 * dur * dur);
  // the hop changes at the bottom of each gate dip, where it's quietest
  const hop = (s: number) => (Math.floor(beat(s) + 0.25) % 2 === 1 ? semis(5) : 1);
  const f = (s: number, u: number) => exp(440 * p, 1760 * p, Math.pow(u, 1.25)) * hop(s);
  const tmp = buffer(rate, dur);
  osc(tmp, rate, { dur, w: "pulse", duty: 0.25, f, env, gain: 0.5 });
  osc(tmp, rate, { dur, w: "pulse", duty: 0.25, f: (s, u) => f(s, u) * semis(1), env, gain: 0.35 });
  osc(tmp, rate, { dur, w: "tri", f: (s, u) => f(s, u) * 0.5, env, gain: 0.35 });
  noise(tmp, rate, { dur, seed: 91 + vi(o), mode: "bp", fc: (s, u) => exp(1200, 5000, u), q: 1.2, env: (s) => env(s) * (0.3 + 0.7 * s / dur), gain: 0.3 });
  const n = tmp.length;
  const lp = svf(rate, "lp", (s, u) => exp(2200, 7000, u), 0.9, n);
  // the stutter: a rounded gate that speeds up toward the shot
  const soft = Math.tanh(2.5);
  for (let i = 0; i < n; i++) out[i] = lp(tmp[i]) * (0.6 + 0.4 * (Math.tanh(2.5 * Math.sin(TAU * beat(i / rate))) / soft));
  // the stab: the semitone pair, bright and unfiltered, for the first 50 ms
  const sd = 0.05;
  osc(out, rate, { dur: sd, w: "pulse", duty: 0.25, f: () => 880 * p, env: ahd(sd, 0.002, 0.012, 1.6), gain: 0.4 });
  osc(out, rate, { dur: sd, w: "pulse", duty: 0.25, f: () => 880 * p * semis(1), env: ahd(sd, 0.002, 0.012, 1.6), gain: 0.3 });
  saturate(out, 2.2);
  return finish(out, rate, 0.42, 0.004);
};

// The Eye Beam fires down the column for 0.5 s: the second-loudest thing in
// the game. A crack and a sine slam on the front, then a held column of
// energy: a low detuned saw drone, a 392 Hz pulse carrying a 60 Hz growl
// (the part a laptop or phone speaker can still play), a little crushed-noise
// roar, a band of hiss, and static crackle all over it. The whole column
// creeps up a semitone and a half as it burns and flickers at two uneven
// rates so it never sits still. A short release at the end, so it stops when
// the beam does.
const beam: VoiceFn = (rate, o) => {
  const v = vi(o);
  const dur = 0.5;
  const out = buffer(rate, dur);
  const hold = (s: number) => Math.min(1, s / 0.004) * Math.min(1, Math.max(0, (dur - s) / 0.05));
  // the slam
  noise(out, rate, { dur: 0.015, seed: 121 + v, mode: "bp", fc: () => 2800, q: 0.7, env: ahd(0.015, 0.0005, 0.003, 1.5), gain: 0.8 });
  osc(out, rate, { dur: 0.16, w: "sine", f: (s) => exp(170, 45, s / 0.16), env: ahd(0.16, 0.001, 0.02, 1.6), gain: 1.3 });
  // the column: everything below runs the full 0.5 s
  const tmp = buffer(rate, dur);
  const f = (s: number) => 98 * semis(1.5 * (s / dur));
  osc(tmp, rate, { dur, w: "saw", f, env: hold, gain: 0.55 });
  osc(tmp, rate, { dur, w: "saw", f: (s) => f(s) * 1.012, env: hold, gain: 0.45 });
  osc(tmp, rate, { dur, w: "pulse", duty: 0.3, f: (s) => f(s) * 2.005, env: hold, gain: 0.3 });
  osc(tmp, rate, { dur, w: "pulse", duty: 0.25, f: (s) => f(s) * 4.02 * (1 + 0.06 * Math.sin(TAU * 60 * s)) * (1 + 0.01 * Math.sin(TAU * 7 * s)), env: hold, gain: 0.45 });
  noise(tmp, rate, { dur, seed: 131 + v, mode: "lp", fc: () => 2600, q: 1, env: hold, gain: 0.3, crush: 7 });
  noise(tmp, rate, { dur, seed: 141 + v, mode: "bp", fc: (s) => 3200 * (1 + 0.25 * Math.sin(TAU * 11 * s)), q: 1.4, env: hold, gain: 0.35 });
  crackle(tmp, rate, 0, dur - 0.03, 151 + v, () => 140, 3000, 1.8);
  let a = 0;
  let b = 0;
  for (let i = 0; i < tmp.length; i++) {
    a += 23 / rate;
    b += 37 / rate;
    out[i] += tmp[i] * (0.8 + 0.12 * Math.sin(TAU * a) + 0.08 * Math.sin(TAU * b));
  }
  saturate(out, 2.2);
  return finish(out, rate, 0.62, 0.012);
};

// The player's Eye Beam: the enemy's beam, pointed up and cut short. A crack
// of air, then two detuned saws that zip up an octave and a half in 30 ms
// and ring only briefly there, with a 70 ms slice of the enemy beam's own
// hiss (the 3.2 kHz band with its 11 Hz wobble) and static crackle over
// them, a sine an octave above for glint, and a small sine thump so it lands
// with some weight. It rises where the shot falls, and it's softer than a pop
// because it repeats.
const lance: VoiceFn = (rate, o) => {
  const v = vi(o);
  const p = VP[v];
  const dur = 0.22 * VT[v];
  const out = buffer(rate, dur + 0.03);
  noise(out, rate, { dur: 0.014, seed: 161 + v, mode: "hp", fc: () => 3500, q: 0.7, env: ahd(0.014, 0.0005, 0.002, 2), gain: 0.35 });
  const f = (s: number) => (s < 0.03 ? exp(700 * p, 2000 * p, s / 0.03) : 2000 * p * (1 - 0.08 * Math.min(1, (s - 0.03) / dur))) * (1 + 0.012 * Math.sin(TAU * 45 * s));
  osc(out, rate, { dur, w: "saw", f, env: ahd(dur, 0.002, 0.015, 3), gain: 0.3 });
  osc(out, rate, { dur, w: "saw", f: (s) => f(s) * 1.012, env: ahd(dur, 0.002, 0.015, 3), gain: 0.3 });
  osc(out, rate, { dur, w: "tri", f: (s) => f(s) * 0.5, env: ahd(dur, 0.002, 0.015, 3), gain: 0.5 });
  osc(out, rate, { dur: dur * 0.7, w: "sine", f: (s) => f(s) * 2.006, env: ahd(dur * 0.7, 0.004, 0.02, 2.2), gain: 0.18 });
  osc(out, rate, { dur: 0.06, w: "sine", f: (s) => exp(320 * p, 110, s / 0.06), env: ahd(0.06, 0.001, 0.01, 2), gain: 0.4 });
  // the slice of beam: its wobbling hiss band and its crackle
  const bd = 0.07 * VT[v];
  noise(out, rate, { at: 0.004, dur: bd, seed: 141 + v, mode: "bp", fc: (s) => 3200 * p * (1 + 0.25 * Math.sin(TAU * 11 * s)), q: 1.4, env: ahd(bd, 0.003, 0.02, 1.5), gain: 0.45 });
  crackle(out, rate, 0.004, bd, 191 + v, (u) => 300 * (1 - u), 3000, 0.5);
  saturate(out, 1.4);
  room(out, rate, 0.25);
  return finish(out, rate, 0.27, 0.01);
};

// A Wingman is destroyed: the tink's bigger cousin. A lower struck-plate ring
// (inharmonic partials off 820 Hz, bending down a touch as the metal gives),
// a crushed-noise crunch and a sine knock under it, then a few falling glass
// glints scattering out after, and a quiet two-note blink falling a minor
// third, so the player hears that something was lost and not only that armor
// broke.
const shield: VoiceFn = (rate, o) => {
  const v = vi(o);
  const p = VP[v];
  const dur = 0.33 * VT[v];
  const out = buffer(rate, dur + 0.04);
  noise(out, rate, { dur: 0.01, seed: 171 + v, mode: "bp", fc: () => 3000, q: 0.8, env: ahd(0.01, 0.0005, 0.002, 1.5), gain: 0.6 });
  noise(out, rate, { dur: 0.16, seed: 181 + v, mode: "lp", fc: (s, u) => exp(5000 * p, 500 * p, Math.pow(u, 0.6)), q: 1.1, env: ahd(0.16, 0.001, 0.012, 1.8), gain: 1.2, crush: 4 });
  osc(out, rate, { dur: 0.1, w: "sine", f: (s) => exp(160 * p, 50, s / 0.1), env: ahd(0.1, 0.001, 0.012, 1.6), gain: 0.9 });
  const f0 = 820 * p;
  const partials: [number, number, number][] = [
    [1, 1, 0.3],
    [1.5, 0.45, 0.24],
    [2.76, 0.6, 0.2],
    [3.9, 0.3, 0.15],
    [5.4, 0.35, 0.12],
  ];
  for (const [m, g, d] of partials) osc(out, rate, { dur: d, w: "sine", f: (s) => f0 * m * (1 - 0.03 * (s / d)), env: ahd(d, 0.0008, 0.008, 2), gain: g * 0.5 });
  const glints: [number, number][] = [
    [0.06, 3520],
    [0.1, 2960],
    [0.15, 4186],
    [0.21, 3136],
  ];
  for (const [t, g0] of glints) osc(out, rate, { at: t * VT[v], dur: 0.05, w: "sine", f: (s) => g0 * p * (1 - 1.2 * s), env: ahd(0.05, 0.001, 0.006, 2), gain: 0.24 });
  // the loss: a quiet two-note blink falling a minor third, the tink's "shut" a step lower
  osc(out, rate, { at: 0.08 * VT[v], dur: 0.045, w: "pulse", duty: 0.25, f: () => 880 * p, env: ahd(0.045, 0.002, 0.015, 1.5), gain: 0.14 });
  osc(out, rate, { at: 0.13 * VT[v], dur: 0.06, w: "pulse", duty: 0.25, f: () => 740 * p, env: ahd(0.06, 0.002, 0.018, 1.5), gain: 0.14 });
  saturate(out, 1.8);
  room(out, rate, 0.3);
  return finish(out, rate, 0.42, 0.015);
};

const voices: Record<SoundName, VoiceFn> = {
  start,
  wave: waveJingle,
  swoop,
  shot,
  pop,
  tink,
  boom,
  rev,
  flutter,
  commit,
  loop,
  glow,
  zap,
  drip,
  rewind,
  kept,
  reject,
  drop,
  grab,
  warn,
  beam,
  lance,
  shield,
};

const set: VoiceSet = {
  name: "juicy",
  description: "modern retro: band-limited chip tones with layered impacts, low thumps, gentle saturation and a little room",
  voices,
};
export default set;
