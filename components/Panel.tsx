"use client";

import type { RunEnd } from "@/lib/game/loop";
import { MOVES, type Move } from "@/lib/game/world";
import type { Decision } from "@/lib/system1/types";

export type Status = "idle" | "starting" | "running" | "retrying" | "between" | "stopped" | "error";
export type Mode = "jev" | "you";
export type RunRow = RunEnd & { n: number; who: Mode };

// A small chip next to the title for Jev's connection, so outages never move the layout.
export function StatusChip({ status, error }: { status: Status; error: string | null }) {
  if (status === "retrying") return <span className="chip warn-chip">Jev unavailable · retrying</span>;
  if (status === "error") return <span className="chip warn-chip" title={error ?? undefined}>Jev unavailable</span>;
  return null;
}

export function ModeSwitch({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled: boolean }) {
  return (
    <div className="modes" role="radiogroup" aria-label="Who plays">
      {(["jev", "you"] as Mode[]).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} disabled={disabled} onClick={() => onChange(m)}>
          {m === "jev" ? "Jev plays" : "You play"}
        </button>
      ))}
    </div>
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
            {decision.ms !== undefined && <span className="ms">{decision.ms} ms</span>}
          </p>
          <div className="bar">
            <div style={{ width: `${Math.round(decision.confidence * 100)}%` }} />
          </div>
          <ul className="probs">
            {MOVES.map((m) => (
              <li key={m} className={m === decision.move ? "chosen" : ""}>
                <span>{m}</span>
                <div className="bar small">
                  <div style={{ width: `${Math.round(decision.probabilities[m] * 100)}%` }} />
                </div>
                <span className="num">{decision.probabilities[m].toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">
          {status === "starting"
            ? "Asking Jev…"
            : status === "running" || status === "retrying"
              ? "Waiting on Jev…"
              : status === "error"
                ? "Jev didn't answer. Press Start to try again."
                : "Press Start."}
        </p>
      )}
    </section>
  );
}

// Nemotron's plan: Jev's instructions. Live plans arrive in slice 6.
export function PlanBox({ plan, age, stale }: { plan: string; age: number | null; stale: boolean }) {
  return (
    <section className="box coach" aria-label="Nemotron plan">
      <h2>NEMOTRON · Nebius Token Factory</h2>
      <p className="rule">{plan}</p>
      <p className="happened">{age === null ? "Starting plan." : `${age.toFixed(0)} s ago${stale ? " · stale" : ""}`}</p>
    </section>
  );
}

const ARROW: Record<Move, string> = { left: "←", right: "→", stay: "·", fire: "▲" };

export function YouBox({ lastKey }: { lastKey: Move | null }) {
  return (
    <section className="box decision you" aria-label="You">
      <h2>YOU · ← → or A D to move, Space to fire</h2>
      <p className="pick">
        <strong>{lastKey ? `${ARROW[lastKey]} ${lastKey}` : "—"}</strong>
      </p>
      <p className="muted">Same fight and speed as Jev.</p>
    </section>
  );
}

export function RunHistory({ runs, seed }: { runs: RunRow[]; seed: number }) {
  const best = runs.reduce((b, r) => Math.max(b, r.score), 0);
  return (
    <section className="box runs" aria-label="Runs">
      <h2>RUNS</h2>
      <ol>
        {runs.map((r) => (
          <li key={r.n}>
            #{r.n} <span className="who">{r.who}</span> <span className="num">{r.score}</span>{" "}
            <span className="muted">{r.seconds.toFixed(0)} s</span>
            {r.score === best && best > 0 && " ★"}
          </li>
        ))}
        {runs.length === 0 && <li className="muted">No runs yet</li>}
      </ol>
      <p className="muted seed">seed {seed}</p>
    </section>
  );
}

export function Controls({ status, onStart, onStop }: { status: Status; onStart: () => void; onStop: () => void }) {
  const busy = status === "running" || status === "starting" || status === "retrying" || status === "between";
  return (
    <div className="controls">
      <button onClick={onStart} disabled={busy}>
        Start
      </button>
      <button onClick={onStop} disabled={!busy}>
        Stop
      </button>
    </div>
  );
}
