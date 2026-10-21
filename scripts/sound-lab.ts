// Renders a voice set (lib/game/voices/<set>.ts) so its sounds can be judged
// without ears: a WAV per sound, measurements, a spectrogram sheet, and a
// 12-second montage that plays the sounds the way a busy fight does.
// Run: pnpm sound-lab -- <set> [outDir]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { SOUND_BRIEF, SOUND_NAMES, type SoundName, type VoiceSet } from "../lib/game/voices/types";

const RATE = 44100;
const args = process.argv.slice(2).filter((a) => a !== "--");
const setName = args[0];
if (!setName) {
  console.error("usage: pnpm sound-lab -- <set> [outDir]");
  process.exit(1);
}
const outDir = args[1] ?? join(process.env.SOUND_LAB_OUT ?? "sound-lab", setName);

// ---------- WAV ----------
function wav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

// ---------- FFT and spectrogram ----------
const N = 1024;
const HOP = 256;
const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const ai = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
      }
  }
}
// Power spectrum frames (N/2 bins each).
function stft(x: Float32Array): Float64Array[] {
  const frames: Float64Array[] = [];
  for (let start = 0; start < Math.max(1, x.length); start += HOP) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[start + i] ?? 0) * hann[i];
    fft(re, im);
    const p = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    frames.push(p);
  }
  return frames;
}

// ---------- measurements ----------
function measure(x: Float32Array) {
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  let nan = 0;
  for (const v of x) {
    if (!Number.isFinite(v)) nan++;
    peak = Math.max(peak, Math.abs(v));
    sum += v;
    if (Math.abs(v) >= 0.99) clipped++;
  }
  // Loudest 50 ms, as a stand-in for how punchy it sounds.
  const win = Math.round(RATE * 0.05);
  let loud = 0;
  for (let s = 0; s < Math.max(1, x.length); s += Math.floor(win / 2)) {
    let e = 0;
    for (let i = s; i < Math.min(x.length, s + win); i++) e += x[i] * x[i];
    loud = Math.max(loud, Math.sqrt(e / win));
  }
  const frames = stft(x);
  let total = 0;
  let weighted = 0;
  let high = 0;
  for (const p of frames)
    for (let k = 1; k < p.length; k++) {
      const f = (k * RATE) / N;
      total += p[k];
      weighted += p[k] * f;
      if (f > 8000) high += p[k];
    }
  // Where it has actually faded out (last sample above -50 dBFS).
  let end = x.length;
  while (end > 0 && Math.abs(x[end - 1]) < 0.003) end--;
  return {
    seconds: +(x.length / RATE).toFixed(3),
    audibleSeconds: +(end / RATE).toFixed(3),
    peak: +peak.toFixed(3),
    loudDb: +(20 * Math.log10(loud || 1e-9)).toFixed(1),
    centroidHz: Math.round(total ? weighted / total : 0),
    highShare: +(total ? high / total : 0).toFixed(3),
    startSample: +Math.abs(x[0] ?? 0).toFixed(3), // a sound should start near 0, or it clicks
    endSample: +Math.abs(x[x.length - 1] ?? 0).toFixed(3), // and end near 0
    dc: +(sum / Math.max(1, x.length)).toFixed(4),
    clipped,
    nan,
  };
}

// ---------- pictures ----------
const ROWS = 128;
const F_LO = 50;
const F_HI = 16000;
const PX_PER_S = 200;
function heat(t: number): [number, number, number] {
  // black -> purple -> orange -> yellow -> white
  const stops: [number, number, number][] = [[0, 0, 0], [60, 10, 90], [190, 50, 60], [250, 150, 30], [255, 240, 150], [255, 255, 255]];
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  return stops[i].map((c, j) => Math.round(c + (stops[i + 1][j] - c) * f)) as [number, number, number];
}
const TILE_S = 1.6;
const TILE_W = Math.round(TILE_S * PX_PER_S);
const WAVE_H = 40;
const LABEL_H = 18;
function tile(x: Float32Array): Buffer {
  const W = TILE_W;
  const H = ROWS + WAVE_H;
  const img = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) img.writeUInt32BE(0x0b0d1cff, i * 4);
  const frames = stft(x);
  for (let px = 0; px < W; px++) {
    const fi = Math.floor((px / PX_PER_S) * (RATE / HOP));
    const p = frames[fi];
    if (!p) continue;
    for (let row = 0; row < ROWS; row++) {
      const f = F_LO * Math.pow(F_HI / F_LO, 1 - row / (ROWS - 1));
      const k = Math.min(N / 2 - 1, Math.round((f * N) / RATE));
      const db = 10 * Math.log10(p[k] + 1e-12);
      const [r, g, b] = heat((db + 40) / 70);
      const o = (row * W + px) * 4;
      img[o] = r;
      img[o + 1] = g;
      img[o + 2] = b;
    }
  }
  // waveform: min and max per pixel column
  const per = RATE / PX_PER_S;
  for (let px = 0; px < W; px++) {
    let lo = 0;
    let hi = 0;
    for (let i = Math.floor(px * per); i < Math.min(x.length, Math.floor((px + 1) * per)); i++) {
      lo = Math.min(lo, x[i]);
      hi = Math.max(hi, x[i]);
    }
    const mid = ROWS + WAVE_H / 2;
    for (let y = Math.round(mid - hi * (WAVE_H / 2 - 1)); y <= Math.round(mid - lo * (WAVE_H / 2 - 1)); y++) {
      const o = (y * W + px) * 4;
      img[o] = 120;
      img[o + 1] = 200;
      img[o + 2] = 255;
    }
  }
  return img;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
async function sheet(items: { label: string; x: Float32Array }[], file: string, cols = 4) {
  const rows = Math.ceil(items.length / cols);
  const cellW = TILE_W + 10;
  const cellH = LABEL_H + ROWS + WAVE_H + 10;
  const composites: object[] = [];
  items.forEach((it, i) => {
    const left = (i % cols) * cellW;
    const top = Math.floor(i / cols) * cellH;
    composites.push({ input: Buffer.from(`<svg width="${TILE_W}" height="${LABEL_H}"><text x="2" y="13" font-family="Menlo, monospace" font-size="12" fill="#e8e8f0">${esc(it.label)}</text></svg>`), left, top });
    composites.push({ input: tile(it.x), raw: { width: TILE_W, height: ROWS + WAVE_H, channels: 4 }, left, top: top + LABEL_H });
  });
  await sharp({ create: { width: cols * cellW, height: rows * cellH, channels: 4, background: "#1c1c28" } }).composite(composites).png().toFile(file);
}

// ---------- the montage: 12 s of a busy fight ----------
function montage(voice: (name: SoundName, kind?: 0 | 1 | 2, variant?: number) => Float32Array): Float32Array {
  const out = new Float32Array(RATE * 12);
  const at = (t: number, s: Float32Array) => {
    const o = Math.round(t * RATE);
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

async function main() {
  const mod = await import(`../lib/game/voices/${setName}`);
  const set: VoiceSet = mod.default ?? mod.set;
  if (!set?.voices) throw new Error(`lib/game/voices/${setName}.ts must export default a VoiceSet`);
  mkdirSync(outDir, { recursive: true });
  const cache = new Map<string, Float32Array>();
  const voice = (name: SoundName, kind?: 0 | 1 | 2, variant = 0) => {
    const key = `${name}|${kind}|${variant}`;
    let x = cache.get(key);
    if (!x) {
      const t0 = performance.now();
      x = set.voices[name](RATE, { kind, variant });
      if (!(x instanceof Float32Array)) throw new Error(`${name} did not return a Float32Array`);
      cache.set(key, x);
      timings.set(key, performance.now() - t0);
    }
    return x;
  };
  const timings = new Map<string, number>();
  const items: { label: string; x: Float32Array }[] = [];
  const report: Record<string, unknown> = {};
  for (const name of SOUND_NAMES) {
    const kinds: (0 | 1 | 2 | undefined)[] = name === "pop" || name === "swoop" ? [0, 1, 2] : [undefined];
    for (const kind of kinds) {
      const label = kind === undefined ? name : `${name} ${["cyclops", "bat", "drone"][kind]}`;
      const x = voice(name, kind);
      // determinism: the same arguments give the same samples
      const again = set.voices[name](RATE, { kind, variant: 0 });
      const deterministic = again.length === x.length && again.every((v, i) => v === x[i]);
      const variants = [1, 2, 3].map((v) => voice(name, kind, v));
      const variantsDiffer = variants.some((v) => v.length !== x.length || v.some((s, i) => s !== x[i]));
      const m = { ...measure(x), deterministic, variantsDiffer, ms: +(timings.get(`${name}|${kind}|0`) ?? 0).toFixed(1), brief: SOUND_BRIEF[name].length };
      report[label] = m;
      writeFileSync(join(outDir, `${label.replace(" ", "-")}.wav`), wav(x));
      items.push({ label: `${label}  ${m.seconds}s  pk ${m.peak}  ${m.loudDb}dB  ${m.centroidHz}Hz`, x });
    }
  }
  const mix = montage(voice);
  let mixPeak = 0;
  for (const v of mix) mixPeak = Math.max(mixPeak, Math.abs(v));
  writeFileSync(join(outDir, "montage.wav"), wav(mix));
  report.montage = { ...measure(mix), note: "12 s: start, three swoops, steady shots, a fly-in's drips, pops, tink, rev, flutter, commit, loop, glow, zap, boom" };
  await sheet(items, join(outDir, "sheet.png"));
  // the montage as one long strip, 12 s split into 4 rows of 3 s
  const strips = [0, 1, 2, 3].map((k) => ({ label: `montage ${k * 3}-${k * 3 + 3} s`, x: mix.subarray(k * 3 * RATE, (k * 3 + 3) * RATE) as Float32Array }));
  await sheet(strips.map((s) => ({ ...s, x: s.x })), join(outDir, "montage.png"), 1);
  writeFileSync(join(outDir, "metrics.json"), JSON.stringify(report, null, 2));
  console.log(`${set.name}: ${set.description}`);
  console.log("sound            secs  audible  peak  loudDb  centroid  >8k   start  end    det  var");
  for (const [label, m] of Object.entries(report)) {
    if (label === "montage") continue;
    const r = m as ReturnType<typeof measure> & { deterministic: boolean; variantsDiffer: boolean };
    console.log(
      `${label.padEnd(16)} ${String(r.seconds).padStart(5)} ${String(r.audibleSeconds).padStart(7)} ${String(r.peak).padStart(5)} ${String(r.loudDb).padStart(7)} ${String(r.centroidHz).padStart(8)} ${String(r.highShare).padStart(5)} ${String(r.startSample).padStart(6)} ${String(r.endSample).padStart(5)}  ${r.deterministic ? "yes" : "NO "}  ${r.variantsDiffer ? "yes" : "no"}${r.clipped ? `  CLIPPED ${r.clipped}` : ""}${r.nan ? `  NaN ${r.nan}` : ""}`,
    );
  }
  console.log(`montage peak ${mixPeak.toFixed(2)}${mixPeak > 1 ? " (clips when mixed: lower the loud sounds)" : ""}`);
  console.log(`wrote ${outDir}: one WAV per sound, montage.wav, sheet.png, montage.png, metrics.json`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
