"use client";

import { useCallback, useRef, useState } from "react";
import GameCanvas from "@/components/GameCanvas";
import { CoachBox, Controls, DecisionBox, Playbook, RunHistory, StatusChip, type Coach, type Status } from "@/components/Panel";
import { playRun, type RunEnd } from "@/lib/game/loop";
import { randomSeed } from "@/lib/game/rng";
import { newWorld, resetRun, type World } from "@/lib/game/world";
import type { DecideInput, Decision } from "@/lib/system1/types";
import type { BeatLog, Lesson } from "@/lib/system2/nemotron";

const PAUSE_BETWEEN_RUNS_MS = 1500;
const RETRY_MS = 3000;
class Stopped extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}
const getMove = (input: DecideInput) => post<Decision>("/api/move", input);
const getLesson = (input: { playbook: string[]; beats: BeatLog[]; cause: RunEnd["cause"] }) =>
  post<Lesson>("/api/lesson", input);

// ?seed=1234 picks the road; otherwise a random one, shown in the panel.
function initialSeed(): number {
  const fromUrl = Number(new URLSearchParams(window.location.search).get("seed"));
  return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : randomSeed();
}

// Client-only (loaded with ssr: false from app/page.tsx), so it can read the URL on first render.
export default function Game() {
  const [seed] = useState<number>(initialSeed);
  const [world, setWorld] = useState<World>(() => newWorld(seed));
  const [frame, setFrame] = useState(0);
  const [hit, setHit] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [playbook, setPlaybook] = useState<string[]>(["Jump forward."]);
  const [coach, setCoach] = useState<Coach>({ kind: "idle" });
  const [runs, setRuns] = useState<(RunEnd & { n: number })[]>([]);
  const stopRef = useRef(false);
  const playbookRef = useRef(playbook);
  const runCount = useRef(0);

  // Run after run on the same road until Stop: Jev plays, the run ends,
  // Nemotron writes a rule, the rule joins the playbook, the road replays.
  const start = useCallback(async () => {
    stopRef.current = false;
    setError(null);
    setStatus("starting");
    let firstMove = true;
    let startTries = 0;
    try {
      while (!stopRef.current) {
        const w = resetRun(world);
        setWorld(w);
        setHit(false);
        setDecision(null);
        setCoach({ kind: "idle" });
        const { end, beats } = await playRun(w, playbookRef.current, {
          // The first call doubles as the health check: if Jev is down the
          // game doesn't start. Mid-run, pause and retry every 3 s instead.
          getMove: async (input) => {
            for (;;) {
              try {
                const d = await getMove(input);
                if (firstMove) firstMove = false;
                setStatus("running");
                return d;
              } catch (e) {
                // Jev through the gateway blips often; give the first call three tries.
                if (firstMove && ++startTries >= 3) throw e;
                if (firstMove) {
                  await sleep(1000);
                  continue;
                }
                if (stopRef.current) throw new Stopped();
                setStatus("retrying");
                await sleep(RETRY_MS);
                if (stopRef.current) throw new Stopped();
              }
            }
          },
          onBeat: (_w, d) => {
            setDecision(d);
            setFrame((f) => f + 1);
          },
          stopped: () => stopRef.current,
        });
        if (!end) break;
        runCount.current += 1;
        const n = runCount.current;
        setHit(end.cause === "hit");
        setRuns((rs) => [...rs, { ...end, n }]);

        setStatus("coaching");
        setCoach({ kind: "thinking" });
        try {
          const lesson = await getLesson({ playbook: playbookRef.current, beats, cause: end.cause });
          playbookRef.current = [...playbookRef.current, lesson.rule];
          setPlaybook(playbookRef.current);
          setCoach({ kind: "lesson", lesson });
        } catch {
          setCoach({ kind: "failed" });
        }
        await sleep(PAUSE_BETWEEN_RUNS_MS);
        setStatus("running");
      }
      setStatus("stopped");
    } catch (e) {
      if (e instanceof Stopped) return setStatus("stopped");
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [world]);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return (
    <main className="layout">
      <GameCanvas world={world} frame={frame} hit={hit} />
      <aside className="panel">
        <div className="titleRow">
          <h1>GO FROG GO</h1>
          <StatusChip status={status} error={error} />
        </div>
        <DecisionBox decision={decision} status={status} />
        <CoachBox coach={coach} />
        <Playbook rules={playbook} />
        <RunHistory runs={runs} current={runs.length + 1} seed={seed} />
        <Controls status={status} onStart={start} onStop={stop} />
      </aside>
    </main>
  );
}
