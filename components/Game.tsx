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
import { jevController, keyboardController, playRun, type Choice, type RunEnd } from "@/lib/game/loop";
import { randomSeed } from "@/lib/game/rng";
import { newWorld, resetRun, type Move, type World } from "@/lib/game/world";
import { describeMoves, describeState } from "@/lib/describe";
import type { DecideInput, Decision } from "@/lib/system1/types";
import type { BeatLog, Lesson } from "@/lib/system2/nemotron";

const PAUSE_BETWEEN_RUNS_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}
const getMove = (input: DecideInput, signal?: AbortSignal) => post<Decision>("/api/move", input, signal);
const getLesson = (input: { playbook: string[]; beats: BeatLog[]; cause: RunEnd["cause"] }) =>
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
  const [world, setWorld] = useState<World>(() => newWorld(seed));
  const [mode, setMode] = useState<Mode>("jev");
  const [frame, setFrame] = useState(0);
  const [hit, setHit] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [late, setLate] = useState(0);
  const [lastKey, setLastKey] = useState<Move | null>(null);
  const [playbook, setPlaybook] = useState<string[]>(["Jump forward."]);
  const [coach, setCoach] = useState<Coach>({ kind: "idle" });
  const [runs, setRuns] = useState<(RunEnd & { n: number; who: Mode })[]>([]);
  // Each Start gets a run id; Stop bumps it, so an old loop still awaiting
  // something sees it has been stopped and never touches the page again.
  const runId = useRef(0);
  const playbookRef = useRef(playbook);
  const runCount = useRef(0);
  const keyboard = useRef(keyboardController());
  const running = status === "running" || status === "starting" || status === "retrying" || status === "coaching";

  // Arrow keys / WASD steer the frog in "You" mode.
  useEffect(() => {
    if (mode !== "you") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const move = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!move) return;
      e.preventDefault();
      keyboard.current.press(move);
      setLastKey(move);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const record = useCallback((end: RunEnd, who: Mode) => {
    runCount.current += 1;
    const n = runCount.current;
    setHit(end.cause === "hit");
    setRuns((rs) => [...rs, { ...end, n, who }]);
  }, []);

  const onBeat = useCallback((_w: World, choice: Choice) => {
    if (choice.decision) setDecision(choice.decision);
    if (choice.late) setLate((n) => n + 1);
    setFrame((f) => f + 1);
  }, []);

  // You: one run on the road, same clock as Jev. Press Start to go again.
  const startYou = useCallback(async (stopped: () => boolean) => {
    const w = resetRun(world);
    keyboard.current = keyboardController(); // drop any key pressed before Start
    setWorld(w);
    setHit(false);
    setLastKey(null);
    setStatus("running");
    const { end } = await playRun(w, keyboard.current, { playbook: [], onBeat, stopped });
    if (stopped()) return;
    if (end) record(end, "you");
    setStatus("stopped");
  }, [world, onBeat, record]);

  // Jev: run after run on the same road until Stop. Jev plays in real time,
  // the run ends, Nemotron writes a rule, the rule joins the playbook, the road replays.
  const startJev = useCallback(async (stopped: () => boolean) => {
    setStatus("starting");
    // Health check: if Jev can't answer the first question in three tries, don't start.
    const first = resetRun(world);
    for (let tries = 1; ; tries++) {
      try {
        await getMove({ state: describeState(first), moves: describeMoves(first), playbook: playbookRef.current });
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
      const w = resetRun(world);
      setWorld(w);
      setHit(false);
      setDecision(null);
      setLate(0);
      setCoach({ kind: "idle" });
      setStatus("running");
      const { end, beats } = await playRun(w, jevController(getMove), {
        playbook: playbookRef.current,
        onBeat,
        onPause: () => setStatus("retrying"),
        onResume: () => setStatus("running"),
        stopped,
      });
      if (!end || stopped()) return;
      record(end, "jev");

      setStatus("coaching");
      setCoach({ kind: "thinking" });
      try {
        const lesson = await getLesson({ playbook: playbookRef.current, beats, cause: end.cause });
        if (stopped()) return;
        playbookRef.current = [...playbookRef.current, lesson.rule];
        setPlaybook(playbookRef.current);
        setCoach({ kind: "lesson", lesson });
      } catch {
        if (stopped()) return;
        setCoach({ kind: "failed" });
      }
      await sleep(PAUSE_BETWEEN_RUNS_MS);
    }
  }, [world, onBeat, record]);

  const start = useCallback(() => {
    const id = ++runId.current;
    const stopped = () => runId.current !== id;
    setError(null);
    return mode === "you" ? startYou(stopped) : startJev(stopped);
  }, [mode, startYou, startJev]);

  const stop = useCallback(() => {
    runId.current++;
    setStatus("stopped");
  }, []);

  return (
    <main className="layout">
      <GameCanvas world={world} frame={frame} hit={hit} />
      <aside className="panel">
        <div className="titleRow">
          <h1>GO FROG GO</h1>
          <StatusChip status={status} error={error} />
        </div>
        <ModeSwitch mode={mode} onChange={setMode} disabled={running} />
        {mode === "jev" ? (
          <>
            <DecisionBox decision={decision} status={status} late={late} />
            <CoachBox coach={coach} />
            <Playbook rules={playbook} />
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
