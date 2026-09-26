import type { SoundName, VoiceFn, VoiceOpts, VoiceSet } from "./types";

// Every sound as an sfxr preset (DrPetter's generator, the one behind most
// indie retro games), with its parameters in Hz and seconds instead of 0..1
// knobs so a preset sounds the same at 44.1 or 48 kHz. One preset is one
// oscillator; a few sounds stack two or three, the way a bfxr mixer would.

type Wave = "square" | "saw" | "sine" | "tri" | "noise";
type Preset = {
  wave: Wave;
  freq: number; // Hz at the start
  slide?: number; // octaves a second (+ up)
  dslide?: number; // change in slide, octaves a second per second
  minFreq?: number; // the slide stops here (sfxr cuts the sound; clamping avoids the click)
  maxFreq?: number; // the same ceiling for a rising slide
  vib?: number; // vibrato depth: the pitch swings between (1 + vib) and 1 / (1 + vib)
  vibHz?: number;
  arp?: number; // pitch multiplier applied once...
  arpAt?: number; // ...this many seconds in (or after each repeat)
  duty?: number; // square duty, 0..0.5
  dutySweep?: number; // per second
  repeat?: number; // seconds: pitch, arp and duty restart this often
  lpf?: number; // resonant low-pass cutoff, Hz
  lpfSweep?: number; // octaves a second
  res?: number; // 0..1
  hpf?: number; // one-pole high-pass cutoff, Hz
  hpfSweep?: number; // octaves a second
  flange?: number; // phaser delay, ms
  flangeSweep?: number; // ms a second
  attack: number; // seconds, a straight rise to 1 + 2 * punch
  sustain: number; // seconds, easing from 1 + 2 * punch back to 1
  punch?: number;
  decay: number; // seconds, falling to exactly 0 on the last sample
  curve?: number; // decay shape: 1 is sfxr's straight line, higher drops faster then lingers
  gain?: number;
  at?: number; // start time within the voice, seconds
};

// sfxr supersamples 8x and box-averages, which lets a lot of alias through.
// Here tones run 4x with polyBLEP edges and noise 2x (its grit is the point),
// and each comes back down through a windowed-sinc filter that cuts at the
// output's Nyquist, so a bright square with no low-pass stays clean too.
const OS_TONE = 4;
const OS_NOISE = 2;
const WAVES: Record<Wave, number> = { square: 0, saw: 1, sine: 2, tri: 3, noise: 4 };

// Halving filters: Kaiser-windowed half-band sincs, so every other tap is
// zero and only the odd ones need storing. Two halvings take a 4x tone down
// to the output rate: the short one only has to clear what the long one
// can't, and the long one passes to about 0.38 of the output rate and is
// 60 dB down wherever an alias would fold below that.
function bessel0(x: number) {
  let s = 1;
  let t = 1;
  for (let k = 1; k < 20; k++) {
    t *= (x / (2 * k)) ** 2;
    s += t;
  }
  return s;
}
function halfband(pairs: number): Float64Array {
  const c = 2 * pairs - 1; // the farthest odd tap
  const h = new Float64Array(pairs);
  let sum = 0;
  for (let k = 0; k < pairs; k++) {
    const o = 2 * k + 1;
    const w = bessel0(6 * Math.sqrt(1 - (o / (c + 1)) ** 2)) / bessel0(6);
    h[k] = (Math.sin((Math.PI * o) / 2) / (Math.PI * o)) * w;
    sum += 2 * h[k];
  }
  for (let k = 0; k < pairs; k++) h[k] *= 0.5 / sum; // with the 0.5 centre tap, unity at DC
  return h;
}
const SHORT = halfband(4);
const LONG = halfband(8);
// Keeps every other sample, centred on it so nothing is delayed.
function halve(x: Float32Array, h: Float64Array): Float32Array {
  const n = x.length >> 1;
  const y = new Float32Array(n);
  const last = x.length - 1;
  for (let i = 0; i < n; i++) {
    const m = 2 * i;
    let acc = 0.5 * x[m];
    for (let k = 0; k < h.length; k++) {
      const o = 2 * k + 1;
      acc += h[k] * ((m >= o ? x[m - o] : 0) + (m + o <= last ? x[m + o] : 0));
    }
    y[i] = acc;
  }
  return y;
}

// mulberry32: a small seeded generator, so a voice gives the same samples every time.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rounds off a hard edge one sample either side of where the phase wraps.
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

function render(p: Preset, rate: number, seed: number): Float32Array {
  const aN = Math.max(1, Math.round(p.attack * rate));
  const sN = Math.round(p.sustain * rate);
  const n = Math.max(aN + sN + 2, Math.round((p.attack + p.sustain + p.decay) * rate));
  const dN = n - aN - sN;
  const out = new Float32Array(n);
  const wave = WAVES[p.wave];
  const OS = wave === 4 ? OS_NOISE : OS_TONE;
  const os = rate * OS;
  const hi = new Float32Array(n * OS); // the oversampled signal, before the envelope
  const rand = rng(seed);
  const noise = new Float32Array(32);
  const refill = () => {
    for (let j = 0; j < 32; j++) noise[j] = rand() * 2 - 1;
  };
  refill();

  // Pitch state, which a repeat restarts. Kept out of closures so it stays in registers.
  let f = p.freq;
  let fMul = Math.pow(2, (p.slide ?? 0) / rate); // per-sample pitch step from the slide
  let duty = p.duty ?? 0.5;
  let arpDone = false;
  let since = 0;
  const repN = p.repeat ? Math.round(p.repeat * rate) : 0;
  const arpN = p.arpAt !== undefined ? Math.round(p.arpAt * rate) : -1;
  const dMul = Math.pow(2, (p.dslide ?? 0) / rate / rate); // the delta slide bends that step
  const minF = p.minFreq ?? 20;
  const maxF = Math.min(p.maxFreq ?? Infinity, rate * 0.45);
  const vibLn = Math.log(1 + (p.vib ?? 0)); // vibrato in log pitch, so a deep one swings evenly up and down
  const vibW = (2 * Math.PI * (p.vibHz ?? 0)) / rate;
  const dutyStep = (p.dutySweep ?? 0) / rate;

  let lpfHz = p.lpf ?? 0;
  const lpfMul = Math.pow(2, (p.lpfSweep ?? 0) / rate);
  const q = 0.7 + (p.res ?? 0) ** 2 * 10;
  let hpfHz = p.hpf ?? 25; // a DC blocker at least: a narrow square's offset would otherwise thump
  const hpfMul = Math.pow(2, (p.hpfSweep ?? 0) / rate);
  const lpfSweeps = !!lpfHz && lpfMul !== 1;
  const hpfSweeps = !!hpfHz && hpfMul !== 1;
  let k = (2 * Math.PI * lpfHz) / os;
  k *= k;
  let d = Math.min(0.8, Math.sqrt(k) / q);
  let c = (2 * Math.PI * hpfHz) / os;
  let lp = 0;
  let lpv = 0;
  let hp = 0;
  let prevLp = 0;

  const fbuf = new Float32Array(4096);
  let fpos = 0;
  let flange = ((p.flange ?? 0) * os) / 1000;
  const flangeStep = ((p.flangeSweep ?? 0) * os) / 1000 / rate;
  const flanging = p.flange !== undefined;

  let ph = 0;
  let h = 0;
  for (let i = 0; i < n; i++) {
    if (repN && ++since >= repN) {
      since = 0;
      f = p.freq;
      fMul = Math.pow(2, (p.slide ?? 0) / rate);
      duty = p.duty ?? 0.5;
      arpDone = false;
    } else if (!repN) since++;
    if (arpN >= 0 && !arpDone && since >= arpN) {
      f *= p.arp ?? 1;
      arpDone = true;
    }
    fMul *= dMul;
    f *= fMul;
    if (f < minF) f = minF;
    if (f > maxF) f = maxF;
    const fv = vibLn ? f * Math.exp(vibLn * Math.sin(vibW * i)) : f;
    duty = Math.min(0.5, Math.max(0.02, duty + dutyStep));

    if (lpfSweeps) {
      lpfHz = Math.min(20000, Math.max(30, lpfHz * lpfMul));
      const w = (2 * Math.PI * lpfHz) / os;
      k = w * w;
      d = Math.min(0.8, w / q);
    }
    if (hpfSweeps) {
      hpfHz = Math.min(8000, Math.max(10, hpfHz * hpfMul));
      c = (2 * Math.PI * hpfHz) / os;
    }
    if (flanging) flange = Math.max(0, Math.min(4000, flange + flangeStep));
    const fd = Math.round(flange);

    const dt = fv / os;
    for (let s = 0; s < OS; s++) {
      ph += dt;
      if (ph >= 1) {
        ph -= 1;
        if (wave === 4) refill();
      }
      let v: number;
      if (wave === 0) {
        const fall = ph - duty;
        v = 0.5 * ((ph < duty ? 1 : -1) + blep(ph, dt) - blep(fall < 0 ? fall + 1 : fall, dt));
      } else if (wave === 1) v = 1 - 2 * ph + blep(ph, dt);
      else if (wave === 2) v = Math.sin(6.283185307179586 * ph);
      else if (wave === 3) v = 1 - 4 * Math.abs(ph - 0.5);
      else v = noise[(ph * 32) | 0];
      if (lpfHz) {
        lpv += (v - lp) * k;
        lpv -= lpv * d;
        lp += lpv;
      } else lp = v;
      if (hpfHz) {
        hp += lp - prevLp;
        hp -= hp * c;
        prevLp = lp;
        v = hp;
      } else v = lp;
      if (flanging) {
        fbuf[fpos & 4095] = v;
        v += fbuf[(fpos - fd) & 4095];
        fpos++;
      }
      hi[h++] = v;
    }
  }

  // Back down to the output rate, then the envelope. The attack climbs all
  // the way to the punch peak (sfxr jumps there in one sample, which clicks)
  // and the sustain eases back to 1.
  const lo = OS === 4 ? halve(halve(hi, SHORT), LONG) : halve(hi, LONG);
  const punch = p.punch ?? 0;
  const top = 1 + 2 * punch;
  const curve = p.curve ?? 1;
  const gain = p.gain ?? 1;
  for (let i = 1; i < n - 1; i++) {
    let env: number;
    if (i < aN) env = (i / aN) * top;
    else if (i < aN + sN) {
      const x = (i - aN) / sN;
      env = 1 + 2 * punch * (1 - x) * (1 - x);
    } else {
      const x = Math.max(0, 1 - (i - aN - sN) / (dN - 1));
      env = curve === 1 ? x : Math.pow(x, curve);
    }
    out[i] = lo[i] * env * gain;
  }
  return out;
}

// Lays the presets out in time, then scales the mix to a target peak, which
// is how the loudness order (boom > pop > warnings > shot > drip) is kept.
function mix(rate: number, layers: Preset[], peak: number, seed: number, length?: number): Float32Array {
  const parts = layers.map((p, k) => ({ o: Math.round((p.at ?? 0) * rate), x: render(p, rate, seed + k * 977) }));
  const n = length ?? Math.max(...parts.map((q) => q.o + q.x.length));
  const out = new Float32Array(n);
  for (const { o, x } of parts) for (let i = 0; i < x.length && o + i < n; i++) out[o + i] += x[i];
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < n; i++) out[i] *= peak / m;
  out[0] = 0;
  out[n - 1] = 0;
  return out;
}

const variant = (o: VoiceOpts) => (((o.variant ?? 0) % 4) + 4) % 4;
const pick = <T,>(o: VoiceOpts, xs: readonly T[]) => xs[variant(o)];

// A sound's noise seed comes from its name (FNV-1a), so adding or moving a
// voice never changes another voice's samples.
function seedOf(name: string) {
  let s = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) s = Math.imul(s ^ name.charCodeAt(i), 0x01000193);
  return s >>> 0;
}

type Spec = { peak: number | ((o: VoiceOpts) => number); build: (o: VoiceOpts) => Preset[]; length?: number };
const voice = (peak: Spec["peak"], build: Spec["build"], length?: number): Spec => ({ peak, build, length });

// A note of a jingle: a short sfxr blip at a pitch, placed in time.
const note = (at: number, freq: number, len: number, extra: Partial<Preset> = {}): Preset => ({
  wave: "square",
  duty: 0.25,
  freq,
  at,
  attack: 0.004,
  sustain: len * 0.55,
  punch: 0.25,
  decay: len * 0.45 + 0.03,
  lpf: 5000,
  ...extra,
});

const specs: Record<SoundName, Spec> = {
  // The classic sfxr laser: a thin square diving about an octave and a half,
  // with a triangle blip dropping under it so the pew has some weight.
  shot: voice(0.4, (o) => {
    const p = pick(o, [1, 1.05, 0.95, 1.1]);
    const tail = pick(o, [0.09, 0.085, 0.095, 0.08]);
    return [
      { wave: "square", freq: 1500 * p, slide: -14, dslide: 60, minFreq: 300, duty: 0.35, dutySweep: -1.5, lpf: 6000, lpfSweep: -6, res: 0.2, hpf: 250, attack: 0.003, sustain: 0.025, punch: 0.4, decay: tail, curve: 1.5 },
      { wave: "tri", freq: 440 * p, slide: -12, minFreq: 150, attack: 0.003, sustain: 0.02, punch: 0.3, decay: tail * 0.8, curve: 1.4, gain: 0.4 },
    ];
  }),

  // sfxr explosion: pitched noise (the noise rate follows the pitch, which is
  // where the crunch comes from) over a square thump for body, and a short
  // bright snap on top. Cyclops is lowest and longest, Drone highest and shortest.
  pop: voice(
    (o) => [0.64, 0.6, 0.56][o.kind ?? 1],
    (o) => {
      const k = o.kind ?? 1;
      const p = pick(o, [1, 1.08, 0.93, 1.15]);
      const noiseHz = [80, 130, 210][k] * p;
      const bodyHz = [170, 250, 400][k] * p;
      const hold = [0.06, 0.04, 0.03][k];
      const tail = [0.3, 0.22, 0.16][k] * pick(o, [1, 0.95, 1.05, 0.9]);
      const layers: Preset[] = [
        { wave: "noise", freq: noiseHz, slide: -3, attack: 0.002, sustain: hold, punch: 0.6, decay: tail, curve: 1.6, lpf: [3000, 3600, 4000][k], lpfSweep: -4, res: 0.15 },
        { wave: "square", freq: bodyHz, slide: -6, minFreq: 40, duty: 0.5, lpf: [700, 1000, 1400][k], attack: 0.002, sustain: hold * 0.6, punch: 0.5, decay: tail * 0.55, curve: 1.5, gain: [0.9, 0.75, 0.6][k] },
        { wave: "noise", freq: 500, hpf: 2000, lpf: 6000, attack: 0.001, sustain: 0.005, decay: 0.04, curve: 2, gain: 0.3 },
      ];
      // The boss breaks up in two: a lower second burst just behind the first.
      if (k === 0) layers.push({ wave: "noise", freq: 60 * p, slide: -2, at: 0.07, attack: 0.004, sustain: 0.03, punch: 0.4, decay: 0.2, curve: 1.6, lpf: 1800, lpfSweep: -3, gain: 0.55 });
      return layers;
    },
  ),

  // Armor holding: struck metal. Sine partials at plate ratios (not whole
  // multiples, which is what makes metal sound like metal), each dying at its
  // own rate, over a dull knock that stays at one pitch so it can't read as a kill.
  tink: voice(0.34, (o) => {
    const p = pick(o, [1, 1.04, 0.96, 1.07]);
    const ring: [number, number, number][] = [
      [1, 1, 0.21],
      [1.59, 0.55, 0.15],
      [2.14, 0.4, 0.1],
      [2.76, 0.25, 0.07],
    ];
    return [
      ...ring.map(([m, g, dec]): Preset => ({ wave: "sine", freq: 1500 * p * m, attack: 0.001, sustain: 0.004, decay: dec, curve: 2.2, gain: g })),
      { wave: "tri", freq: 300 * p, attack: 0.001, sustain: 0.008, decay: 0.04, curve: 1.5, gain: 0.45 },
      { wave: "noise", freq: 600, hpf: 2500, lpf: 5000, attack: 0.001, sustain: 0.002, decay: 0.012, gain: 0.12 },
    ];
  }),

  // The ship going: a long low noise blast with its filter closing, a second
  // burst as the wreck breaks up, a sub thump, and a falling wail so it reads
  // as a loss. The punch is kept small so the body, not the first click, sets the level.
  boom: voice(0.85, () => [
    { wave: "noise", freq: 70, slide: -1.2, attack: 0.004, sustain: 0.18, punch: 0.3, decay: 1.0, curve: 1.6, lpf: 4000, lpfSweep: -3, res: 0.15 },
    { wave: "noise", freq: 110, slide: -2, at: 0.18, attack: 0.004, sustain: 0.06, punch: 0.3, decay: 0.5, curve: 1.5, lpf: 2500, lpfSweep: -2, gain: 0.7 },
    { wave: "square", freq: 130, slide: -4, minFreq: 28, duty: 0.5, lpf: 500, attack: 0.003, sustain: 0.1, punch: 0.3, decay: 0.5, curve: 1.3, gain: 1 },
    { wave: "noise", freq: 500, hpf: 2000, lpf: 6000, attack: 0.001, sustain: 0.01, decay: 0.08, curve: 2, gain: 0.2 },
    { wave: "saw", freq: 700, slide: -2.5, vib: 0.1, vibHz: 9, lpf: 2000, at: 0.05, attack: 0.03, sustain: 0.25, decay: 0.8, gain: 0.3 },
  ]),

  // A motor winding up: a saw climbing faster and faster with an engine
  // flutter, its filter opening, loudest just before the Drone drops.
  rev: voice(
    0.42,
    (o) => {
      const p = pick(o, [1, 1.05, 0.96, 1.09]);
      return [
        { wave: "saw", freq: 70 * p, slide: 2.2, dslide: 2, vib: 0.12, vibHz: 28, lpf: 600, lpfSweep: 3, res: 0.4, attack: 0.3, sustain: 0.45, decay: 0.05 },
        { wave: "square", freq: 35 * p, slide: 2.2, dslide: 2, vib: 0.12, vibHz: 28, duty: 0.3, dutySweep: 0.2, lpf: 400, lpfSweep: 2, attack: 0.3, sustain: 0.45, decay: 0.05, gain: 0.5 },
      ];
    },
    0.8,
  ),

  // Three wing flaps climbing, each an upward chirp and a puff of noise whose
  // filter falls, so it goes "whff" rather than "tss".
  flutter: voice(0.36, (o) => {
    const p = pick(o, [1, 1.06, 0.95, 1.1]);
    return [0, 0.08, 0.16].flatMap((at, k): Preset[] => [
      { wave: "square", freq: 500 * p * (1 + k * 0.15), slide: 8, duty: 0.3, lpf: 3000, at, attack: 0.005, sustain: 0.01, decay: 0.05 },
      { wave: "noise", freq: 150, lpf: 2600 * p, lpfSweep: -22, hpf: 400, at, attack: 0.008, sustain: 0.005, decay: 0.055, gain: 0.75 },
    ]);
  }),

  // A sharp two-note alarm, up a fifth, with a fast trill so it can't be mistaken for a reward.
  commit: voice(0.26, (o) => {
    const p = pick(o, [1, 1.03, 0.97, 1.06]);
    return [
      { wave: "square", freq: 900 * p, arp: 1.5, arpAt: 0.06, vib: 0.08, vibHz: 35, duty: 0.5, lpf: 5000, attack: 0.003, sustain: 0.12, punch: 0.3, decay: 0.05 },
      { wave: "square", freq: 1812 * p, arp: 1.5, arpAt: 0.06, vib: 0.08, vibHz: 35, duty: 0.25, lpf: 5000, attack: 0.003, sustain: 0.12, punch: 0.3, decay: 0.05, gain: 0.3 },
    ];
  }),

  // Up and over: one slow, deep vibrato cycle, so the pitch goes up, back
  // through the middle, down under where it started and home again.
  loop: voice(0.3, (o) => {
    const p = pick(o, [1, 1.05, 0.95, 1.1]);
    return [
      { wave: "square", freq: 440 * p, vib: 0.68, vibHz: 1.72, duty: 0.4, lpf: 1400, res: 0.3, attack: 0.02, sustain: 0.45, decay: 0.13 },
      { wave: "sine", freq: 880 * p, vib: 0.68, vibHz: 1.72, attack: 0.02, sustain: 0.45, decay: 0.13, gain: 0.35 },
    ];
  }),

  // Charging: a timer running out. Chirps come faster and faster (140 ms
  // apart, then each gap 20% shorter), each a little higher and louder, over
  // a swelling whine. The speed-up is the countdown.
  glow: voice(
    0.32,
    (o) => {
      const p = pick(o, [1, 1.04, 0.96, 1.08]);
      const layers: Preset[] = [{ wave: "sine", freq: 330 * p, slide: 1.5, dslide: 3, vib: 0.03, vibHz: 14, attack: 0.7, sustain: 0.07, decay: 0.03, gain: 0.45 }];
      for (let t = 0, gap = 0.14, k = 0; t < 0.76; t += gap, gap = Math.max(0.028, gap * 0.8), k++) {
        const len = Math.min(0.06, gap * 0.7, 0.795 - t);
        const u = t / 0.76;
        layers.push({ wave: "square", freq: 520 * p * Math.pow(2, k / 12), slide: 4, duty: 0.3, lpf: 2400, res: 0.3, at: t, attack: 0.003, sustain: len * 0.4, decay: len * 0.6 - 0.003, curve: 1.3, gain: 0.35 + 0.65 * u });
      }
      return layers;
    },
    0.8,
  ),

  // The enemy's laser: a saw through a phaser falling from 1100 to 200 Hz,
  // lower and further than the ship's shot, with a 48 Hz growl on the pitch
  // so it reads as a threat. The phaser delay scales with the pitch, so the
  // variants differ only in pitch.
  zap: voice(0.46, (o) => {
    const p = pick(o, [1, 0.95, 1.06, 0.9]);
    return [
      { wave: "saw", freq: 1100 * p, slide: -20, dslide: 40, minFreq: 200 * p, vib: 0.15, vibHz: 48, flange: 1 / p, flangeSweep: 8 / p, lpf: 4500, lpfSweep: -5, res: 0.4, hpf: 120, attack: 0.003, sustain: 0.04, punch: 0.4, decay: 0.13 },
      { wave: "square", freq: 550 * p, slide: -20, dslide: 40, minFreq: 100 * p, vib: 0.15, vibHz: 48, duty: 0.5, lpf: 1200, attack: 0.003, sustain: 0.04, punch: 0.4, decay: 0.12, gain: 0.6 },
    ];
  }),

  // A water-drop bloop: a sine flicking up from 500 to 1250 Hz with a
  // triangle an octave down, rising where the shots fall so the two never blur.
  drip: voice(0.18, (o) => {
    const p = pick(o, [1, 1.06, 0.94, 1.12]);
    const tail = pick(o, [0.05, 0.047, 0.053, 0.045]);
    return [
      { wave: "sine", freq: 500 * p, slide: 26, maxFreq: 1250 * p, attack: 0.003, sustain: 0.03, decay: tail, curve: 1.4 },
      { wave: "tri", freq: 250 * p, slide: 26, maxFreq: 625 * p, attack: 0.003, sustain: 0.03, decay: tail, curve: 1.6, gain: 0.35 },
    ];
  }),

  // Galaga's dive: a falling whistle with a warble. Cyclops is a low slow
  // square, Bat a thinner square, Drone a quick high triangle.
  swoop: voice(
    (o) => [0.26, 0.25, 0.22][o.kind ?? 1],
    (o) => {
      const k = o.kind ?? 1;
      const p = pick(o, [1, 1.05, 0.95, 1.09]);
      const w = pick(o, [1, 0.93, 1.08, 1]);
      if (k === 0)
        return [
          { wave: "square", freq: 700 * p, slide: -1.8, dslide: -1, vib: 0.05, vibHz: 6 * w, duty: 0.5, lpf: 2200, res: 0.2, attack: 0.03, sustain: 0.45, decay: 0.37 },
          { wave: "square", freq: 350 * p, slide: -1.8, dslide: -1, vib: 0.05, vibHz: 6 * w, duty: 0.4, lpf: 900, attack: 0.03, sustain: 0.45, decay: 0.37, gain: 0.4 },
        ];
      if (k === 1) return [{ wave: "square", freq: 1000 * p, slide: -2, vib: 0.06, vibHz: 10 * w, duty: 0.3, lpf: 3500, attack: 0.02, sustain: 0.38, decay: 0.32 }];
      return [
        { wave: "tri", freq: 1600 * p, slide: -2.4, vib: 0.07, vibHz: 16 * w, attack: 0.015, sustain: 0.3, decay: 0.28 },
        { wave: "square", freq: 1600 * p, slide: -2.4, vib: 0.07, vibHz: 16 * w, duty: 0.12, lpf: 4000, attack: 0.015, sustain: 0.3, decay: 0.28, gain: 0.25 },
      ];
    },
  ),

  // A tape scrubbing backwards: a wobbling saw climbing, over repeating chirps.
  rewind: voice(0.35, () => [
    { wave: "saw", freq: 250, slide: 4, vib: 0.25, vibHz: 22, lpf: 2500, lpfSweep: 2, res: 0.3, attack: 0.02, sustain: 0.3, decay: 0.13 },
    { wave: "square", freq: 400, slide: 10, repeat: 0.1, duty: 0.3, lpf: 4000, attack: 0.01, sustain: 0.3, decay: 0.14, gain: 0.5 },
  ]),

  // A small win: C E G up, the top note jumping an octave the way an sfxr coin does, over a warm root.
  kept: voice(0.4, () => [
    note(0, 1047, 0.07),
    note(0.07, 1319, 0.07),
    note(0.14, 1568, 0.2, { arp: 2, arpAt: 0.08, sustain: 0.12, decay: 0.4, vib: 0.015, vibHz: 6, duty: 0.4 }),
    { wave: "tri", freq: 523, attack: 0.004, sustain: 0.2, decay: 0.3, gain: 0.5 },
    note(0.3, 3136, 0.1, { gain: 0.25, decay: 0.3 }),
  ]),

  // The loss buzzer: a tritone drop, a saw and a detuned square beating
  // against it, kept dark and a little under kept so a lost rule doesn't sting.
  reject: voice(0.36, () => [
    { wave: "saw", freq: 220, slide: -0.5, vib: 0.02, vibHz: 12, lpf: 1400, res: 0.3, attack: 0.005, sustain: 0.13, decay: 0.05 },
    { wave: "square", freq: 222.6, slide: -0.5, duty: 0.5, lpf: 1400, attack: 0.005, sustain: 0.13, decay: 0.05, gain: 0.6 },
    { wave: "saw", freq: 156, slide: -1.2, vib: 0.02, vibHz: 12, lpf: 1100, lpfSweep: -2, res: 0.3, at: 0.2, attack: 0.005, sustain: 0.18, decay: 0.15 },
    { wave: "square", freq: 158, slide: -1.2, duty: 0.5, lpf: 1100, lpfSweep: -2, at: 0.2, attack: 0.005, sustain: 0.18, decay: 0.15, gain: 0.6 },
  ]),

  // The run's fanfare, a march in C: long-short pairs (da-da DUM) climbing to
  // a held top C, a harmony line under the tune and an oom-pah bass.
  start: voice(0.4, () => {
    const tune: [number, number, number, number][] = [
      // at, length, tune, harmony
      [0, 0.15, 392, 330],
      [0.15, 0.05, 392, 330],
      [0.2, 0.15, 523, 392],
      [0.35, 0.05, 659, 523],
      [0.4, 0.15, 784, 659],
      [0.55, 0.05, 659, 523],
    ];
    const hold = { sustain: 0.3, decay: 0.4, vib: 0.02, vibHz: 6 };
    return [
      ...tune.flatMap(([at, len, f, h]) => [note(at, f, len), note(at, h, len, { duty: 0.5, lpf: 2200, gain: 0.4 })]),
      note(0.6, 1047, 0.6, hold),
      note(0.6, 784, 0.6, { ...hold, duty: 0.5, lpf: 2200, gain: 0.4 }),
      note(0.6, 659, 0.6, { ...hold, duty: 0.5, lpf: 2200, gain: 0.25 }),
      ...[131, 98, 131].map((f, k): Preset => ({ wave: "tri", freq: f, at: k * 0.2, attack: 0.005, sustain: 0.1, decay: 0.06, gain: 0.7 })),
      { wave: "tri", freq: 131, at: 0.6, attack: 0.005, sustain: 0.3, decay: 0.4, gain: 0.7 },
    ];
  }),

  // Next wave: a quick straight run up a C chord that stops on the D above,
  // trilling over a G bass. It never gets home, so it says "again, harder".
  wave: voice(0.38, () => [
    ...[523, 659, 784, 1047, 988].map((f, k) => note(k * 0.06, f, 0.06, { duty: 0.125 })),
    note(0.3, 1175, 0.5, { duty: 0.125, sustain: 0.25, decay: 0.35, arp: 1.1225, arpAt: 0.025, repeat: 0.05 }),
    note(0.3, 784, 0.5, { duty: 0.5, lpf: 2200, sustain: 0.25, decay: 0.35, gain: 0.4 }),
    { wave: "tri", freq: 131, at: 0, attack: 0.005, sustain: 0.1, decay: 0.06, gain: 0.7 },
    { wave: "tri", freq: 165, at: 0.12, attack: 0.005, sustain: 0.1, decay: 0.06, gain: 0.7 },
    { wave: "tri", freq: 98, at: 0.3, attack: 0.005, sustain: 0.25, decay: 0.35, gain: 0.7 },
  ]),
};

const voices = Object.fromEntries(
  (Object.entries(specs) as [SoundName, Spec][]).map(([name, { peak, build, length }]): [SoundName, VoiceFn] => {
    const base = seedOf(name);
    // Variants and kinds shift the seed so their noise differs too.
    return [name, (rate, o) => mix(rate, build(o), typeof peak === "number" ? peak : peak(o), base + variant(o) * 131 + (o.kind ?? 1) * 17, length === undefined ? undefined : Math.round(length * rate))];
  }),
) as Record<SoundName, VoiceFn>;

const set: VoiceSet = {
  name: "sfxr",
  description: "every sound as a classic sfxr preset (square/saw/noise, slides, arpeggio, repeat, resonant filters, punch), tones 4x and noise 2x oversampled, brought down through half-band filters",
  voices,
};
export default set;
