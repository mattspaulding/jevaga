"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameCanvas from "@/components/GameCanvas";
import { Controls, DecisionBox, ModeSwitch, PlanBox, RunHistory, StatusChip, YouBox, type Mode, type RunRow, type Status } from "@/components/Panel";
import { describeFight, describeMoves } from "@/lib/describe";
import { driveWithJev, startRun, type Run, type RunEnd } from "@/lib/game/loop";
import { randomSeed } from "@/lib/game/rng";
import { newWorld, resetRun, type Move, type World } from "@/lib/game/world";
import { STARTING_PLAN, type DecideInput, type Decision } from "@/lib/system1/types";

const PAUSE_BETWEEN_RUNS_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}
const getMove = (input: DecideInput, signal?: AbortSignal) => post<Decision>("/api/move", input, signal);

const KEYS: Record<string, Move> = { ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", " ": "fire" };

// ?seed=1234 picks the fight; otherwise a random one, shown in the panel.
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
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [lastKey, setLastKey] = useState<Move | null>(null);
  const [plan] = useState(STARTING_PLAN);
  const planRef = useRef(plan);
  const [runs, setRuns] = useState<RunRow[]>([]);
  // Each Start gets a run id; Stop bumps it, so an older loop still awaiting
  // something sees it has been stopped and never touches the page again.
  const runId = useRef(0);
  const runCount = useRef(0);
  const running = status === "running" || status === "starting" || status === "retrying" || status === "between";

  // ← → / A D move, Space fires, instantly, in "You" mode.
  useEffect(() => {
    if (mode !== "you") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const move = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!move) return;
      e.preventDefault();
      runRef.current?.act(move);
      setLastKey(move);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const newRun = useCallback(() => {
    const w = resetRun(base);
    worldRef.current = w;
    hitRef.current = false;
    setScore(0);
    const run = startRun(w, (world) => setScore(world.score));
    runRef.current = run;
    return run;
  }, [base]);

  const finishRun = useCallback((end: RunEnd, who: Mode) => {
    runCount.current += 1;
    const n = runCount.current;
    hitRef.current = true;
    setRuns((rs) => [...rs, { ...end, n, who }]);
  }, []);

  // You: one run; the fight moves on its own and your keys fly the ship.
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

  // Jev: run after run until Stop. Jev acts whenever its answer lands.
  const startJev = useCallback(
    async (stopped: () => boolean) => {
      setStatus("starting");
      // Health check: if Jev can't answer the first question in three tries, don't start.
      const probe = resetRun(base);
      for (let tries = 1; ; tries++) {
        try {
          await getMove({ state: describeFight(probe), moves: describeMoves(probe), plan: planRef.current });
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
      while (!stopped()) {
        setDecision(null);
        setStatus("running");
        const run = newRun();
        const [end] = await Promise.all([
          run.done,
          driveWithJev(run, getMove, {
            plan: () => planRef.current,
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
        setStatus("between");
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
      <GameCanvas worldRef={worldRef} hitRef={hitRef} score={score} who={mode === "jev" ? "JEV" : "YOU"} />
      <aside className="panel">
        <div className="titleRow">
          <h1>JEVAGA</h1>
          <StatusChip status={status} error={error} />
        </div>
        <ModeSwitch mode={mode} onChange={setMode} disabled={running} />
        {mode === "jev" ? (
          <>
            <DecisionBox decision={decision} status={status} />
            <PlanBox plan={plan} age={null} stale={false} />
          </>
        ) : (
          <YouBox lastKey={lastKey} />
        )}
        <RunHistory runs={runs} seed={seed} />
        <Controls status={status} onStart={start} onStop={stop} />
      </aside>
    </main>
  );
}
