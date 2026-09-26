"use client";

import type { RunEnd } from "@/lib/game/loop";
import { MOVES } from "@/lib/game/world";
import type { Decision } from "@/lib/system1/types";

export type Status = "idle" | "starting" | "running" | "stopped" | "error";

export function DecisionBox({ decision, status, error }: { decision: Decision | null; status: Status; error: string | null }) {
  return (
    <section className="box decision" aria-label="Jev decision">
      <h2>JEV · via Vercel AI Gateway</h2>
      {status === "error" ? (
        <p className="warn">Jev unavailable. {error}</p>
      ) : decision ? (
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
        <p className="muted">{status === "starting" ? "Asking Jev…" : "Press Start."}</p>
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
  const busy = status === "running" || status === "starting";
  return (
    <div className="controls">
      <button onClick={onStart} disabled={busy}>Start</button>
      <button onClick={onStop} disabled={!busy}>Stop</button>
    </div>
  );
}
