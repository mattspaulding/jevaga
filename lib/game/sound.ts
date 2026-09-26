import type { Cue } from "./cues";

// Retro sound effects, synthesized with the Web Audio API: oscillators, a
// noise buffer, filters and gain envelopes. No audio files. Every voice is
// written against BaseAudioContext, so an OfflineAudioContext can render the
// same sounds for the video.

export type SoundName = Cue["name"] | "kept" | "reject";
type Play = { name: SoundName; kind?: 0 | 1 | 2 };
type Voice = (ac: BaseAudioContext, out: AudioNode, t: number, cue: Play) => number; // returns its length in seconds

const MAX_VOICES = 12;
const VOLUME = 0.5;
const MUTE_KEY = "jevaga-sound-muted";

// Noise from a fixed seed, so the video's sounds come out the same every render.
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ac: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ac);
  if (buf) return buf;
  buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = buf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < data.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    data[i] = (s / 0xffffffff) * 2 - 1;
  }
  noiseBuffers.set(ac, buf);
  return buf;
}

// A gain that rises to `peak` quickly and dies away by `t + dur`.
function envelope(ac: BaseAudioContext, t: number, dur: number, peak: number, attack = 0.004): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

type ToneOpts = { type: OscillatorType; from: number; to: number; dur: number; gain: number; linear?: boolean; via?: number };
function tone(ac: BaseAudioContext, out: AudioNode, t: number, o: ToneOpts) {
  const osc = ac.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.from, t);
  if (o.via !== undefined) {
    osc.frequency.linearRampToValueAtTime(o.via, t + o.dur / 2);
    osc.frequency.linearRampToValueAtTime(o.to, t + o.dur);
  } else if (o.linear) osc.frequency.linearRampToValueAtTime(o.to, t + o.dur);
  else osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  osc.connect(envelope(ac, t, o.dur, o.gain)).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

type NoiseOpts = { dur: number; gain: number; from: number; to: number; filter?: BiquadFilterType; q?: number };
function noise(ac: BaseAudioContext, out: AudioNode, t: number, o: NoiseOpts) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const f = ac.createBiquadFilter();
  f.type = o.filter ?? "bandpass";
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.from, t);
  f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  src.connect(f).connect(envelope(ac, t, o.dur, o.gain)).connect(out);
  src.start(t);
  src.stop(t + o.dur + 0.02);
}

const notes = (ac: BaseAudioContext, out: AudioNode, t: number, freqs: number[], step: number, type: OscillatorType, gain: number) => {
  freqs.forEach((f, i) => tone(ac, out, t + i * step, { type, from: f, to: f * 0.98, dur: step * 1.6, gain }));
  return step * freqs.length + step;
};

// Pitch by kind: Cyclops lowest, Drone highest.
const PITCH = [0.7, 1, 1.4];

const VOICES: Record<SoundName, Voice> = {
  shot: (ac, out, t) => (tone(ac, out, t, { type: "square", from: 1400, to: 320, dur: 0.09, gain: 0.1 }), 0.1),
  pop: (ac, out, t, c) => {
    const p = PITCH[c.kind ?? 1];
    noise(ac, out, t, { dur: 0.22, gain: 0.35, from: 1500 * p, to: 180, q: 0.8 });
    tone(ac, out, t, { type: "triangle", from: 700 * p, to: 140 * p, dur: 0.14, gain: 0.12 });
    return 0.24;
  },
  tink: (ac, out, t) => {
    tone(ac, out, t, { type: "triangle", from: 2500, to: 2350, dur: 0.14, gain: 0.16 });
    tone(ac, out, t, { type: "sine", from: 3750, to: 3600, dur: 0.09, gain: 0.06 });
    return 0.16;
  },
  boom: (ac, out, t) => {
    noise(ac, out, t, { dur: 0.9, gain: 0.7, from: 3000, to: 60, filter: "lowpass", q: 0.7 });
    tone(ac, out, t, { type: "square", from: 150, to: 35, dur: 0.6, gain: 0.18 });
    return 0.92;
  },
  rev: (ac, out, t) => (tone(ac, out, t, { type: "sawtooth", from: 90, to: 340, dur: 0.8, gain: 0.05, linear: true }), 0.82),
  flutter: (ac, out, t) => {
    tone(ac, out, t, { type: "square", from: 700, to: 1000, dur: 0.05, gain: 0.05 });
    tone(ac, out, t + 0.08, { type: "square", from: 800, to: 1150, dur: 0.05, gain: 0.05 });
    return 0.14;
  },
  commit: (ac, out, t) => (tone(ac, out, t, { type: "square", from: 500, to: 1600, dur: 0.1, gain: 0.08 }), 0.12),
  loop: (ac, out, t) => (tone(ac, out, t, { type: "sine", from: 420, via: 1000, to: 420, dur: 0.5, gain: 0.09 }), 0.52),
  glow: (ac, out, t) => (tone(ac, out, t, { type: "sine", from: 300, to: 950, dur: 0.8, gain: 0.05, linear: true }), 0.82),
  zap: (ac, out, t) => {
    tone(ac, out, t, { type: "square", from: 1700, to: 220, dur: 0.14, gain: 0.08 });
    noise(ac, out, t, { dur: 0.06, gain: 0.08, from: 5000, to: 2500, filter: "highpass" });
    return 0.16;
  },
  drip: (ac, out, t) => (tone(ac, out, t, { type: "triangle", from: 900, to: 480, dur: 0.07, gain: 0.07 }), 0.08),
  swoop: (ac, out, t, c) => {
    const p = PITCH[c.kind ?? 1];
    tone(ac, out, t, { type: "sine", from: 1100 * p, via: 480 * p, to: 900 * p, dur: 0.7, gain: 0.08 });
    return 0.72;
  },
  wave: (ac, out, t) => notes(ac, out, t, [523, 659, 784, 1047], 0.09, "square", 0.06),
  start: (ac, out, t) => notes(ac, out, t, [392, 523, 659, 784, 1047, 1319], 0.08, "square", 0.06),
  rewind: (ac, out, t) => {
    for (let i = 0; i < 3; i++) tone(ac, out, t + i * 0.13, { type: "sawtooth", from: 1300, to: 280, dur: 0.12, gain: 0.05 });
    return 0.4;
  },
  kept: (ac, out, t) => notes(ac, out, t, [1319, 1976], 0.16, "triangle", 0.14),
  reject: (ac, out, t) => {
    tone(ac, out, t, { type: "square", from: 220, to: 180, dur: 0.18, gain: 0.07 });
    tone(ac, out, t + 0.2, { type: "square", from: 165, to: 120, dur: 0.26, gain: 0.07 });
    return 0.48;
  },
};
export const SOUND_NAMES = Object.keys(VOICES) as SoundName[];

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let muted: boolean | null = null;
let active = 0;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export const sound = {
  // Browsers only let a page make sound after a click or key press: call this from one.
  unlock() {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
    if (!ac) {
      ac = new AudioContext();
      master = ac.createGain();
      master.gain.value = VOLUME;
      master.connect(ac.destination);
    }
    if (ac.state === "suspended") void ac.resume();
  },
  isMuted(): boolean {
    if (muted === null) muted = readMuted();
    return muted;
  },
  setMuted(m: boolean) {
    muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      // private mode or blocked storage: the setting just won't be remembered
    }
  },
  play(cue: Play) {
    if (sound.isMuted() || !ac || !master || ac.state !== "running" || active >= MAX_VOICES) return;
    const length = VOICES[cue.name](ac, master, ac.currentTime + 0.005, cue);
    active++;
    setTimeout(() => active--, length * 1000 + 50);
  },
  // For checks and the video: renders one voice offline and measures it.
  async render(name: SoundName, kind?: 0 | 1 | 2): Promise<{ name: SoundName; seconds: number; peak: number; rms: number }> {
    const rate = 44100;
    const off = new OfflineAudioContext(1, rate * 1.6, rate);
    const seconds = VOICES[name](off, off.destination, 0.01, { name, kind });
    const data = (await off.startRendering()).getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (const v of data) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    return { name, seconds, peak, rms: Math.sqrt(sum / data.length) };
  },
};
