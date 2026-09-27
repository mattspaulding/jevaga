"use client";

import type { RunEnd } from "@/lib/game/loop";
import { MOVES, type Move } from "@/lib/game/world";
import type { Book, JudgeStep, Verdict } from "@/lib/learn/judge";
import type { Decision } from "@/lib/system1/types";
import { formatTokens, formatUsd, totalCostUsd, type Usage } from "@/lib/usage";

export type Status = "idle" | "starting" | "running" | "retrying" | "between" | "stopped" | "error";
export type Mode = "jev" | "you";
export type RunRow = RunEnd & { n: number; who: Mode; kills: number; rules: number | null }; // rules: Jev runs only

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
              <span className="runSeconds">
                {r.kills} {r.kills === 1 ? "kill" : "kills"}
                {r.rules !== null && ` · ${r.rules} ${r.rules === 1 ? "rule" : "rules"}`} · {Math.round(r.seconds)} s
              </span>
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

export function Controls({
  status,
  onStart,
  onStop,
  onForget,
  canForget = false,
  soundOn,
  onSound,
  onLibrary,
}: {
  status: Status;
  onStart: () => void;
  onStop: () => void;
  onForget?: () => void; // Jev mode only; undefined hides the button
  canForget?: boolean; // anything learned to forget
  soundOn: boolean;
  onSound: () => void;
  onLibrary: () => void;
}) {
  const busy = status === "running" || status === "starting" || status === "retrying" || status === "between";
  return (
    <div className="controls">
      <button className={`btn ${!busy ? "btnGo" : ""}`} onClick={onStart} disabled={busy}>
        START
      </button>
      <button className="btn" onClick={onStop} disabled={!busy}>
        STOP
      </button>
      {onForget && (
        <button className="btn btnQuiet" onClick={onForget} disabled={busy || !canForget}>
          FORGET RULES
        </button>
      )}
      <button className="btn btnQuiet" onClick={onLibrary} title="Meet the enemies">
        LIBRARY
      </button>
      <button className="btn" onClick={onSound} aria-pressed={soundOn} title="Sound on or off (M)">
        SOUND {soundOn ? "ON" : "OFF"}
      </button>
    </div>
  );
}

// What the coach is doing between runs, then its verdict on the last death.
export function CoachBox({ step, verdict, run }: { step: JudgeStep | null; verdict: Verdict | null; run: number | null }) {
  let tag: { text: string; tone: "gold" | "red" | "lilac" } | null = null;
  const lines: { text: string; className: string }[] = [];
  const who = run ? `run ${run}'s death` : "the death";

  if (step) {
    const doing =
      step.kind === "reproduce"
        ? `Replaying ${who} to check it happens again…`
        : step.kind === "coach"
          ? step.attempt === 1
            ? `Nemotron is studying ${who}…`
            : "Nemotron is writing a different rule…"
          : step.kind === "test"
            ? "Testing the rule on a replay of the death…"
            : step.kind === "earlier"
              ? `Checking earlier deaths still survive: ${step.i} of ${step.of}…`
              : "Checking Jev still fires when nothing is coming…";
    lines.push({ text: doing, className: "coachDoing" });
    if (step.kind === "test") lines.push({ text: `Rule: ${step.coaching.rule}`, className: "coachRule" });
  } else if (verdict) {
    const last = verdict.attempts.at(-1);
    const happened = verdict.death.happened ?? last?.coaching?.happened;
    if (verdict.kind === "kept" && last?.coaching) {
      const replaced = last.coaching.change.kind === "replace";
      const n = last.coaching.change.kind === "replace" ? last.coaching.change.n : verdict.book.rules.length;
      tag = { text: replaced ? "RULE CHANGED" : "NEW RULE", tone: "gold" };
      if (happened) lines.push({ text: `What happened: ${happened}`, className: "coachHappened" });
      lines.push({ text: `Rule ${n}: ${last.coaching.rule}`, className: "coachRule" });
      const parts = ["Replay: survived."];
      if (last.earlier.tested) parts.push(`Earlier deaths: ${last.earlier.survived} of ${last.earlier.tested} still survive.`);
      if (last.controls.tested) parts.push(`Still fires in ${last.controls.fired} of ${last.controls.tested} calm moments.`);
      lines.push({ text: parts.join(" "), className: "coachMeta" });
    } else if (verdict.kind === "luck") {
      tag = { text: "LUCK", tone: "lilac" };
      lines.push({ text: "Replayed with the same rules, Jev lived. That death came down to timing, so no rule.", className: "coachHappened" });
    } else if (verdict.kind === "none") {
      tag = { text: "NO RULE", tone: "lilac" };
      if (happened) lines.push({ text: `What happened: ${happened}`, className: "coachHappened" });
      lines.push({ text: "Nemotron: nothing Jev read could have saved it. Rulebook unchanged.", className: "coachMeta" });
    } else if (verdict.kind === "didnt-hold") {
      tag = { text: "DIDN'T HOLD", tone: "red" };
      if (happened) lines.push({ text: `What happened: ${happened}`, className: "coachHappened" });
      const tried = verdict.attempts.filter((a) => a.coaching?.rule);
      const final = tried.at(-1);
      if (final?.coaching?.rule) lines.push({ text: `Last rule tried: ${final.coaching.rule}`, className: "coachRule" });
      const reason = !final
        ? ""
        : final.thisDeath && final.thisDeath.outcome !== "survived"
          ? "Jev still died in the replay."
          : final.earlier.survived < final.earlier.tested
            ? "It broke an earlier fix."
            : "Jev stopped shooting with it.";
      lines.push({ text: `${reason} ${tried.length > 1 ? "Both rules failed" : "The rule failed"}, so the rulebook is unchanged.`.trim(), className: "coachMeta" });
    } else if (verdict.kind === "untested") {
      tag = { text: "NO RULE", tone: "lilac" };
      lines.push({ text: "Jev didn't answer during the replay, so no rule could be tested. Rulebook unchanged.", className: "coachMeta" });
    } else {
      tag = { text: "NO RULE", tone: "lilac" };
      lines.push({ text: `Nemotron didn't answer (${last?.error ?? "no reply"}). Rulebook unchanged.`, className: "coachMeta" });
    }
  } else {
    lines.push({ text: "Watching. After each death, Nemotron writes Jev one rule, and a replay of the death decides if it stays.", className: "coachHappened" });
  }

  return (
    <section className="win winCoach coach" aria-label="Coach" aria-live="polite">
      <div className="coachHead">
        <h2>COACH · NEMOTRON ON NEBIUS</h2>
        {tag && <span className={`tag ${tag.tone}`}>{tag.text}</span>}
      </div>
      {lines.map((l, i) => (
        <p key={i} className={l.className}>
          {l.text}
        </p>
      ))}
    </section>
  );
}

// Jev's rulebook. A rule that just arrived flashes for a second.
export function RulebookBox({ book, fresh }: { book: Book; fresh: number | null }) {
  return (
    <section className="win winNeutral" aria-label="Rulebook">
      <h2>RULEBOOK · {book.rules.length} {book.rules.length === 1 ? "RULE" : "RULES"}</h2>
      {book.rules.length ? (
        <ol className="ruleList">
          {book.rules.map((r, i) => (
            <li key={i} className={`ruleRow ${fresh === i ? "fresh" : ""}`}>
              <span className="ruleN">{i + 1}</span>
              <span className="ruleText">{r}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="ruleEmpty">Empty. Jev starts on reflexes alone.</p>
      )}
    </section>
  );
}

// Token counts and dollar cost for the session so far, reset only on reload.
export function UsageBox({ usage }: { usage: Usage }) {
  const { jev, nemotron } = usage;
  return (
    <section className="win winNeutral" aria-label="Usage this session">
      <h2>USAGE · THIS SESSION</h2>
      <ul className="usageList">
        <li className="usageRow">
          <span className="usageLabel usageJev">JEV</span>
          <span className="usageCount">
            {jev.answers.toLocaleString()} {jev.answers === 1 ? "answer" : "answers"} · {jev.cached.toLocaleString()} cached
          </span>
          <span className="usageTokens">{formatTokens(jev.inputTokens + jev.outputTokens)} tokens</span>
          <span className="usageCost">{formatUsd(jev.costUsd)}</span>
        </li>
        <li className="usageRow">
          <span className="usageLabel usageCoach">NEMOTRON</span>
          <span className="usageCount">
            {nemotron.calls.toLocaleString()} {nemotron.calls === 1 ? "rule" : "rules"} asked
          </span>
          <span className="usageTokens">{formatTokens(nemotron.inputTokens + nemotron.outputTokens)} tokens</span>
          <span className="usageCost">{formatUsd(nemotron.costUsd)}</span>
        </li>
        <li className="usageRow usageTotal">
          <span className="usageLabel">TOTAL</span>
          <span className="usageTotalCost">{formatUsd(totalCostUsd(usage))}</span>
        </li>
      </ul>
    </section>
  );
}
