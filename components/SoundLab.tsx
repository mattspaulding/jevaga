"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import juicy from "@/lib/game/voices/juicy";
import { montage } from "@/lib/game/voices/montage";
import { SOUND_BRIEF, SOUND_NAMES, type SoundName, type VoiceSet } from "@/lib/game/voices/types";

// The game's sounds (and any candidate sets added to SETS) side by side. Click
// to hear a sound, "×4" to hear its four variants in a row the way repeats
// sound in a fight, pick the best take per sound, and save: the picks go to
// sound-lab/picks.json. Matt picked juicy for every sound on 2026-09-26; the
// other sets are in git history (a4b76bc).

const SETS = ["juicy"] as const;
type SetName = (typeof SETS)[number];
const VOICE_SETS: Record<SetName, VoiceSet> = { juicy };
const KINDS = [
  ["Cyclops", 0],
  ["Bat", 1],
  ["Drone", 2],
] as const;
const VOLUME = 0.5; // the game's master volume

export default function SoundLab() {
  const sets = VOICE_SETS;
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const ac = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());

  useEffect(() => {
    fetch("/api/sound-picks")
      .then((r) => r.json())
      .then((j) => {
        if (j.picks) setPicks(j.picks);
        if (j.notes) setNotes(j.notes);
        if (j.savedAt) setSaved(j.savedAt);
      })
      .catch(() => {});
  }, []);

  const context = () => {
    if (!ac.current) ac.current = new AudioContext();
    if (ac.current.state === "suspended") void ac.current.resume();
    return ac.current;
  };
  const playSamples = (key: string, make: (rate: number) => Float32Array, when = 0) => {
    const ctx = context();
    let buf = buffers.current.get(key);
    if (!buf) {
      const x = make(ctx.sampleRate);
      buf = ctx.createBuffer(1, Math.max(1, x.length), ctx.sampleRate);
      buf.copyToChannel(new Float32Array(x), 0);
      buffers.current.set(key, buf);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = VOLUME;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start(ctx.currentTime + 0.01 + when);
  };
  const play = (set: VoiceSet, name: SoundName, kind?: 0 | 1 | 2, variant = 0, when = 0) =>
    playSamples(`${set.name}|${name}|${kind}|${variant}`, (rate) => set.voices[name](rate, { kind, variant }), when);
  const playMontage = (set: VoiceSet) =>
    playSamples(`${set.name}|montage`, (rate) => montage((n, k, v) => set.voices[n](rate, { kind: k, variant: v ?? 0 }), rate));

  const save = useCallback(async () => {
    const res = await fetch("/api/sound-picks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ picks, notes }) });
    const j = await res.json().catch(() => ({}));
    setSaved(res.ok ? j.savedAt : `not saved: ${j.error ?? res.status}`);
  }, [picks, notes]);

  const cell = (name: SetName, sound: SoundName) => {
    const set = sets[name];
    const kinds = sound === "pop" || sound === "swoop";
    return (
      <div className="labCell">
        {kinds ? (
          KINDS.map(([label, k]) => (
            <button key={label} className="labPlay" onClick={() => play(set, sound, k)}>
              ▶ {label}
            </button>
          ))
        ) : (
          <button className="labPlay" onClick={() => play(set, sound)}>
            ▶
          </button>
        )}
        <button className="labPlay" title="the four variants in a row" onClick={() => [0, 1, 2, 3].forEach((v) => play(set, sound, kinds ? 1 : undefined, v, v * 0.33))}>
          ×4
        </button>
        <label className="labPick">
          <input type="radio" name={`pick-${sound}`} checked={picks[sound] === name} onChange={() => setPicks((p) => ({ ...p, [sound]: name }))} />
          pick
        </label>
      </div>
    );
  };

  return (
    <main className="lab">
      <h1 className="title">SOUND PANEL</h1>
      <p className="labIntro">
        The game&apos;s sounds. Click ▶ to hear one, ×4 to hear its four variants back to back. Add a note where something&apos;s off, and save.
      </p>
      <table className="labTable">
        <thead>
          <tr>
            <th>Sound</th>
            {SETS.map((s) => (
              <th key={s}>
                {s}
                <button className="labPlay labMontage" onClick={() => playMontage(sets[s])}>
                  ▶ 12 s fight
                </button>
              </th>
            ))}
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {SOUND_NAMES.map((sound) => (
            <tr key={sound}>
              <td>
                <div className="labName">{sound}</div>
                <div className="labMuted">{SOUND_BRIEF[sound].when}</div>
              </td>
              {SETS.map((s) => (
                <td key={s}>{cell(s, sound)}</td>
              ))}
              <td>
                <input className="labNote" value={notes[sound] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [sound]: e.target.value }))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="labSave">
        <button className="btn btnGo" onClick={save}>
          SAVE PICKS
        </button>
        <span className="labMuted">
          {Object.keys(picks).length} of {SOUND_NAMES.length} picked{saved ? ` · saved ${saved}` : ""}
        </span>
      </div>
    </main>
  );
}
