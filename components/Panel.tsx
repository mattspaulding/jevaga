"use client";

import type { RunEnd } from "@/lib/game/loop";
import { MOVES } from "@/lib/game/world";
import type { Decision } from "@/lib/system1/types";
import type { Lesson } from "@/lib/system2/nemotron";

export type Status = "idle" | "starting" | "running" | "retrying" | "coaching" | "stopped" | "error";
// A small chip next to the title for Jev's connection, so outages never move the layout.
export function StatusChip({ status, error }: { status: Status; error: string | null }) {
  if (status === "retrying") return <span className="chip warn-chip">Jev unavailable · retrying</span>;
  if (status === "error") return <span className="chip warn-chip" title={error ?? undefined}>Jev unavailable</span>;
  return null;
}

export type Coach = { kind: "idle" } | { kind: "thinking" } | { kind: "lesson"; lesson: Lesson } | { kind: "failed" };

export function CoachBox({ coach }: { coach: Coach }) {
  return (
    <section className="box coach" aria-label="Nemotron coach">
      <h2>NEMOTRON · Nebius Token Factory</h2>
      {coach.kind === "idle" && <p className="muted">Watching. Teaches after each run.</p>}
      {coach.kind === "thinking" && <p className="thinking">thinking…</p>}
      {coach.kind === "failed" && <p className="warn">Couldn&apos;t write a lesson this time.</p>}
      {coach.kind === "lesson" && (
        <>
          <p className="happened">{coach.lesson.whatHappened}</p>
          <p className="rule">New rule: {coach.lesson.rule}</p>
        </>
      )}
    </section>
  );
}

// Numbered rules; the newest flashes when it lands (keyed by count, so it replays).
export function Playbook({ rules }: { rules: string[] }) {
  return (
    <section className="box playbook" aria-label="Playbook">
      <h2>PLAYBOOK</h2>
      <ol>
        {rules.map((r, i) => (
          <li key={`${i}-${rules.length}`} className={i === rules.length - 1 && i > 0 ? "fresh" : ""}>
            {r}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DecisionBox({ decision, status }: { decision: Decision | null; status: Status }) {
  return (
    <section className="box decision" aria-label="Jev decision">
      <h2>JEV · via Vercel AI Gateway</h2>
      {decision ? (
        <>
          <p className="pick">
            <strong>{decision.move}</strong> <span className="num">{decision.confidence.toFixed(2)}</span>
            {decision.source === "simulated" && <span className="badge">SIMULATED</span>}
          </p>
          <div className="bar"><div style={{ width: `${Math.round(decision.confidence * 100)}%` }} /></div>
          <ul className="probs">
            {MOVES.map((m) => (
              <li key={m} className={m === decision.move ? "chosen" : ""}>
                <span>{m}</span>
                <div className="bar small"><div style={{ width: `${Math.round(decision.probabilities[m] * 100)}%` }} /></div>
                <span className="num">{decision.probabilities[m].toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">{status === "starting" ? "Asking Jev…" : status === "error" ? "Jev didn't answer. Press Start to try again." : "Press Start."}</p>
      )}
    </section>
  );
}

export function RunHistory({ runs, current, seed }: { runs: (RunEnd & { n: number })[]; current: number; seed: number }) {
  const best = runs.reduce((b, r) => Math.max(b, r.distance), 0);
  return (
    <section className="box runs" aria-label="Runs">
      <h2>RUNS</h2>
      <ol>
        {runs.map((r) => (
          <li key={r.n}>
            #{r.n} <span className="num">{r.distance}</span>
            {r.cause === "stalled" && <span className="muted"> timeout</span>}
            {r.distance === best && best > 0 && " ★"}
          </li>
        ))}
        {runs.length === 0 && <li className="muted">Run {current}</li>}
      </ol>
      <p className="muted seed">seed {seed}</p>
    </section>
  );
}

export function Controls({ status, onStart, onStop }: { status: Status; onStart: () => void; onStop: () => void }) {
  const busy = status === "running" || status === "starting" || status === "coaching" || status === "retrying";
  return (
    <div className="controls">
      <button onClick={onStart} disabled={busy}>Start</button>
      <button onClick={onStop} disabled={!busy}>Stop</button>
    </div>
  );
}
