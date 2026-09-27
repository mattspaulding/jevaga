import type { Cue } from "./cues";
import juicy from "./voices/juicy";
import { SOUND_NAMES, type SoundName } from "./voices/types";

// Plays the game's sound effects: the "juicy" set from the sound panel, picked
// by Matt on /sounds ("I like the juicy for all of the sounds"). Every voice is
// a pure function that returns samples, so each one is rendered once into an
// AudioBuffer and replayed from there.

type Play = { name: SoundName; kind?: 0 | 1 | 2 };

const SET = juicy;
const VOLUME = 0.5;
const MAX_VOICES = 12;
const VARIANTS = 4;
const MUTE_KEY = "jevaga-sound-muted";

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let muted: boolean | null = null;
let active = 0;
const buffers = new Map<string, AudioBuffer>();
const turn = new Map<string, number>(); // the next variant for each sound, so repeats never play the same take twice running

const keyOf = (name: SoundName, kind: 0 | 1 | 2 | undefined, variant: number) => `${name}|${kind}|${variant}`;
const KINDED: SoundName[] = ["pop", "swoop"];

function bufferFor(ctx: BaseAudioContext, name: SoundName, kind: 0 | 1 | 2 | undefined, variant: number): AudioBuffer {
  const key = keyOf(name, kind, variant);
  let buf = buffers.get(key);
  if (!buf) {
    const x = SET.voices[name](ctx.sampleRate, { kind, variant });
    buf = ctx.createBuffer(1, Math.max(1, x.length), ctx.sampleRate);
    buf.copyToChannel(new Float32Array(x), 0);
    buffers.set(key, buf);
  }
  return buf;
}

// Renders every take ahead of time, a few at a time between frames, so a
// sound never has to be built in the middle of a fight (the biggest take
// the engine can be asked for costs about 25 ms).
function warm(ctx: AudioContext) {
  const todo: [SoundName, 0 | 1 | 2 | undefined, number][] = [];
  for (const name of SOUND_NAMES)
    for (const kind of KINDED.includes(name) ? ([0, 1, 2] as const) : [undefined])
      for (let v = 0; v < VARIANTS; v++) todo.push([name, kind, v]);
  const step = () => {
    const until = performance.now() + 8;
    while (todo.length && performance.now() < until) bufferFor(ctx, ...todo.shift()!);
    if (todo.length) setTimeout(step, 16);
  };
  step();
}

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
      warm(ac);
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
  play(cue: Play | Cue) {
    if (sound.isMuted() || !ac || !master || ac.state !== "running" || active >= MAX_VOICES) return;
    const kind = "kind" in cue ? cue.kind : undefined;
    const variant = turn.get(cue.name) ?? 0;
    turn.set(cue.name, (variant + 1) % VARIANTS);
    const buf = bufferFor(ac, cue.name, kind, variant);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start(ac.currentTime + 0.005);
    active++;
    src.onended = () => active--;
  },
  // For checks: one take's length and levels, as the game would play it.
  async render(name: SoundName, kind?: 0 | 1 | 2, variant = 0): Promise<{ name: SoundName; seconds: number; peak: number; rms: number }> {
    const rate = 44100;
    const x = SET.voices[name](rate, { kind, variant });
    let peak = 0;
    let sum = 0;
    for (const v of x) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    return { name, seconds: x.length / rate, peak, rms: Math.sqrt(sum / Math.max(1, x.length)) };
  },
};
