"use client";

import type { RunEnd } from "@/lib/game/loop";
import { MOVES, type Move } from "@/lib/game/world";
import type { Decision } from "@/lib/system1/types";

export type Status = "idle" | "starting" | "running" | "retrying" | "between" | "stopped" | "error";
export type Mode = "jev" | "you";
export type RunRow = RunEnd & { n: number; who: Mode };

// A small chip next to the title for Jev's connection, so outages never move the layout.
export function StatusChip({ status, error }: { status: Status; error: string | null }) {
  if (status === "retrying") return <span className="chip">JEV UNAVAILABLE · RETRYING</span>;
  if (status === "error") return <span className="chip" title={error ?? undefined}>JEV UNAVAILABLE</span>;
  return null;
}

export function ModeSwitch({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled: boolean }) {
  return (
    // Toggle buttons, not radios: arrow keys belong to the ship, so they must not flip the mode.
    <div className={`switch ${disabled ? "disabled" : ""}`} role="group" aria-label="Who plays">
      {(["jev", "you"] as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            aria-pressed={active}
            className={`switchTab ${active ? `active ${m}` : ""}`}
            disabled={disabled}
            onClick={() => onChange(m)}
          >
            {active && <span className="switchCursor" aria-hidden="true" />}
            {m === "jev" ? "JEV PLAYS" : "YOU PLAY"}
          </button>
        );
      })}
    </div>
  );
}

export function DecisionBox({ decision, status }: { decision: Decision | null; status: Status }) {
  return (
    <section className={`win winJev ${status === "between" ? "between" : ""}`} aria-label="Jev decision">
      <h2>JEV · VIA VERCEL AI GATEWAY</h2>
      {decision ? (
        <>
          <p className="pickLine">
            <span className="pickMove">{decision.move}</span>
            <span className="pickConf">{decision.confidence.toFixed(2)}</span>
            {decision.source === "simulated" && <span className="badge">SIMULATED</span>}
            <span className="pickMs">{Math.round(decision.ms ?? 0)} MS</span>
          </p>
          <div className="meterTrough confMeter">
            <div className="meterFill" style={{ width: `${Math.round(decision.confidence * 100)}%` }} />
          </div>
          <ul className="probList">
            {MOVES.map((m) => (
              <li key={m} className={`probRow ${m === decision.move ? "chosen" : ""}`}>
                <span className="probLabel">{m}</span>
                <div className="meterTrough small probMeter">
                  <div className="meterFill" style={{ width: `${Math.round(decision.probabilities[m] * 100)}%` }} />
                </div>
                <span className="probValue">{decision.probabilities[m].toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <p className="jevLastLine">The fight kept moving for {Math.round(decision.ms ?? 0)} ms while Jev thought.</p>
        </>
      ) : (
        <p className="jevEmpty">
          {status === "starting"
            ? "Asking Jev…"
            : status === "running" || status === "retrying"
              ? "Waiting on Jev…"
              : status === "error"
                ? "Jev didn't answer. Press Start to try again."
                : "Press Start. Jev picks every move (left, right, stay or fire) with a confidence you can watch."}
        </p>
      )}
    </section>
  );
}


const KEY_WORD: Partial<Record<Move, string>> = { left: "LEFT", right: "RIGHT", fire: "FIRE" };

export function YouBox({ lastKey }: { lastKey: Move | null }) {
  const word = lastKey ? (KEY_WORD[lastKey] ?? "READY") : "READY";
  return (
    <section className="win winYou" aria-label="You">
      <h2>YOU · ARROWS OR A D, SPACE TO FIRE</h2>
      <div className="youRow">
        <div className="keypad">
          <span className={`key ${lastKey === "left" ? "lit" : ""}`} aria-hidden="true">
            ←
          </span>
          <span className={`key keySpace ${lastKey === "fire" ? "lit" : ""}`} aria-hidden="true">
            SPACE
          </span>
          <span className={`key ${lastKey === "right" ? "lit" : ""}`} aria-hidden="true">
            →
          </span>
        </div>
        <span className={`youWord ${lastKey ? "" : "ready"}`}>{word}</span>
      </div>
      <p className="youLine">The ship glides while you hold an arrow and stops when you let go. Hold Space to keep firing.</p>
    </section>
  );
}

// `live` is the run being flown right now, shown after the finished ones.
export function RunHistory({ runs, seed, live }: { runs: RunRow[]; seed: number; live: { n: number; who: Mode } | null }) {
  const best = runs.reduce((b, r) => Math.max(b, r.score), 0);
  const shown = runs.length > 8 ? runs.slice(-8) : runs;
  return (
    <section className="win winNeutral" aria-label="Runs">
      <h2>RUNS</h2>
      <ol className="runList">
        {shown.map((r) => {
          const isBest = r.score === best && best > 0;
          return (
            <li key={r.n} className="runRow">
              <span className="runN">#{r.n}</span>
              <span className={`runWho ${r.who}`}>{r.who === "jev" ? "JEV" : "YOU"}</span>
              <span className={`runScore ${isBest ? "best" : ""}`}>
                {r.score}
                {isBest && <span className="runStar"> ★</span>}
              </span>
              <span className="runSeconds">{Math.round(r.seconds)} S</span>
            </li>
          );
        })}
        {live && (
          <li className="runRow">
            <span className="runN">#{live.n}</span>
            <span className={`runWho ${live.who}`}>{live.who === "jev" ? "JEV" : "YOU"}</span>
            <span className="runLive">in progress</span>
          </li>
        )}
        {runs.length === 0 && !live && <li className="runEmpty">#1  not started</li>}
      </ol>
      <p className="runSeed">
        seed {seed} · the same fight every run
      </p>
    </section>
  );
}

export function Controls({ status, onStart, onStop }: { status: Status; onStart: () => void; onStop: () => void }) {
  const busy = status === "running" || status === "starting" || status === "retrying" || status === "between";
  return (
    <div className="controls">
      <button className={`btn ${!busy ? "btnGo" : ""}`} onClick={onStart} disabled={busy}>
        START
      </button>
      <button className="btn" onClick={onStop} disabled={!busy}>
        STOP
      </button>
    </div>
  );
}
