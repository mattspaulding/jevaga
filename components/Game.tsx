"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameCanvas from "@/components/GameCanvas";
import {
  CoachBox,
  Controls,
  DecisionBox,
  ModeSwitch,
  Playbook,
  RunHistory,
  StatusChip,
  YouBox,
  type Coach,
  type Mode,
  type Status,
} from "@/components/Panel";
import { describeMoves, describeState } from "@/lib/describe";
import { afterRun, newMemory } from "@/lib/game/coachMemory";
import { driveWithJev, startRun, type Run, type RunEnd } from "@/lib/game/loop";
import { randomSeed } from "@/lib/game/rng";
import { newWorld, resetRun, type Move, type World } from "@/lib/game/world";
import type { DecideInput, Decision } from "@/lib/system1/types";
import type { BeatLog, Lesson, RunRecord } from "@/lib/system2/nemotron";

const PAUSE_BETWEEN_RUNS_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}
const getMove = (input: DecideInput, signal?: AbortSignal) => post<Decision>("/api/move", input, signal);
const getLesson = (input: { playbook: string[]; beats: BeatLog[]; cause: RunEnd["cause"]; history: RunRecord[]; rejected: string[] }) =>
  post<Lesson>("/api/lesson", input);

const KEYS: Record<string, Move> = {
  ArrowUp: "forward",
  w: "forward",
  ArrowDown: "back",
  s: "back",
  ArrowLeft: "left",
  a: "left",
  ArrowRight: "right",
  d: "right",
};

// ?seed=1234 picks the road; otherwise a random one, shown in the panel.
function initialSeed(): number {
  const fromUrl = Number(new URLSearchParams(window.location.search).get("seed"));
  return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : randomSeed();
}

// Client-only (loaded with ssr: false from app/page.tsx), so it can read the URL on first render.
export default function Game() {
  const [seed] = useState<number>(initialSeed);
  const [base] = useState<World>(() => newWorld(seed));
  const worldRef = useRef<World>(base);
  const hitRef = useRef(false);
  const runRef = useRef<Run | null>(null);
  const [mode, setMode] = useState<Mode>("jev");
  const [distance, setDistance] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [lastKey, setLastKey] = useState<Move | null>(null);
  const [playbook, setPlaybook] = useState<string[]>(["Jump forward."]);
  const [previousPlaybook, setPreviousPlaybook] = useState<string[]>([]);
  const memory = useRef(newMemory());
  const [coach, setCoach] = useState<Coach>({ kind: "idle" });
  const [runs, setRuns] = useState<(RunEnd & { n: number; who: Mode })[]>([]);
  // Each Start gets a run id; Stop bumps it, so an older loop still awaiting
  // something sees it has been stopped and never touches the page again.
  const runId = useRef(0);
  const playbookRef = useRef(playbook);
  const runCount = useRef(0);
  const running = status === "running" || status === "starting" || status === "retrying" || status === "coaching";

  // Arrow keys / WASD hop the frog instantly in "You" mode.
  useEffect(() => {
    if (mode !== "you") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const move = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!move) return;
      e.preventDefault();
      runRef.current?.hop(move);
      setLastKey(move);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const newRun = useCallback(() => {
    const w = resetRun(base);
    worldRef.current = w;
    hitRef.current = false;
    setDistance(0);
    const run = startRun(w, (world) => setDistance(world.furthest));
    runRef.current = run;
    return run;
  }, [base]);

  const finishRun = useCallback((end: RunEnd, who: Mode) => {
    runCount.current += 1;
    const n = runCount.current;
    hitRef.current = end.cause === "hit";
    setRuns((rs) => [...rs, { ...end, n, who }]);
  }, []);

  // You: one run; the world moves on its own and your keys hop the frog.
  const startYou = useCallback(
    async (stopped: () => boolean) => {
      setLastKey(null);
      setStatus("running");
      const run = newRun();
      const end = await run.done;
      if (stopped()) return;
      if (end) finishRun(end, "you");
      setStatus("stopped");
    },
    [newRun, finishRun],
  );

  // Jev: run after run on the same road until Stop. Jev hops whenever its
  // answer lands; after each run Nemotron writes a rule for the playbook.
  const startJev = useCallback(
    async (stopped: () => boolean) => {
      setStatus("starting");
      // Health check: if Jev can't answer the first question in three tries, don't start.
      const probe = resetRun(base);
      for (let tries = 1; ; tries++) {
        try {
          await getMove({ state: describeState(probe), moves: describeMoves(probe), playbook: playbookRef.current });
          if (stopped()) return;
          break;
        } catch (e) {
          if (stopped()) return;
          if (tries >= 3) {
            setError(e instanceof Error ? e.message : String(e));
            setStatus("error");
            return;
          }
          await sleep(1000);
          if (stopped()) return;
        }
      }
      setCoach({ kind: "idle" });
      while (!stopped()) {
        // The coach's last message stays up during the next run, so viewers can watch it play out.
        setDecision(null);
        setStatus("running");
        const run = newRun();
        const [end, decisions] = await Promise.all([
          run.done,
          driveWithJev(run, getMove, {
            playbook: playbookRef.current,
            onDecision: (d) => {
              if (!stopped()) setDecision(d);
            },
            onPause: () => {
              if (!stopped()) setStatus("retrying");
            },
            onResume: () => {
              if (!stopped()) setStatus("running");
            },
          }),
        ]);
        if (!end || stopped()) return;
        finishRun(end, "jev");
        // If this playbook did much worse than the best run's, take it back.
        const rollback = afterRun(memory.current, { n: runCount.current, distance: end.distance, cause: end.cause, playbook: playbookRef.current });
        if (rollback) {
          setPreviousPlaybook(playbookRef.current);
          playbookRef.current = rollback.playbook;
          setPlaybook(rollback.playbook);
          setCoach({ kind: "rollback", rollback });
          await sleep(PAUSE_BETWEEN_RUNS_MS * 2);
          continue;
        }

        setStatus("coaching");
        setCoach({ kind: "thinking" });
        try {
          const lesson = await getLesson({
            playbook: playbookRef.current,
            beats: decisions,
            cause: end.cause,
            history: memory.current.history,
            rejected: memory.current.rejected,
          });
          if (stopped()) return;
          setPreviousPlaybook(playbookRef.current);
          playbookRef.current = lesson.playbook;
          setPlaybook(lesson.playbook);
          setCoach({ kind: "lesson", lesson });
        } catch {
          if (stopped()) return;
          setCoach({ kind: "failed" });
        }
        await sleep(PAUSE_BETWEEN_RUNS_MS);
      }
    },
    [base, newRun, finishRun],
  );

  const start = useCallback(() => {
    const id = ++runId.current;
    const stopped = () => runId.current !== id;
    setError(null);
    return mode === "you" ? startYou(stopped) : startJev(stopped);
  }, [mode, startYou, startJev]);

  const stop = useCallback(() => {
    runId.current++;
    runRef.current?.stop();
    setStatus("stopped");
  }, []);

  return (
    <main className="layout">
      <GameCanvas worldRef={worldRef} hitRef={hitRef} distance={distance} />
      <aside className="panel">
        <div className="titleRow">
          <h1>GO FROG GO</h1>
          <StatusChip status={status} error={error} />
        </div>
        <ModeSwitch mode={mode} onChange={setMode} disabled={running} />
        {mode === "jev" ? (
          <>
            <DecisionBox decision={decision} status={status} />
            <CoachBox coach={coach} />
            <Playbook rules={playbook} previous={previousPlaybook} />
          </>
        ) : (
          <YouBox lastKey={lastKey} />
        )}
        <RunHistory runs={runs} current={runs.length + 1} seed={seed} />
        <Controls status={status} onStart={start} onStop={stop} />
      </aside>
    </main>
  );
}
