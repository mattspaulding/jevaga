"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameCanvas from "@/components/GameCanvas";
import {
  CoachBox,
  Controls,
  DecisionBox,
  ModeSwitch,
  RulebookBox,
  RunHistory,
  StatusChip,
  UsageBox,
  YouBox,
  type Mode,
  type RunRow,
  type Status,
} from "@/components/Panel";
import { describe } from "@/lib/describe";
import { driveWithJev, startRun, type Run, type RunEnd } from "@/lib/game/loop";
import { randomSeed } from "@/lib/game/rng";
import { newWorld, resetRun, SUBSTEP, type Move, type World } from "@/lib/game/world";
import { afterDeath, Cancelled, emptyBook, type Book, type JudgeStep, type Verdict } from "@/lib/learn/judge";
import { createRecorder, type Death } from "@/lib/learn/recorder";
import { paced, playback, type ReplayResult } from "@/lib/learn/replay";
import type { DecideInput, Decision } from "@/lib/system1/types";
import type { CoachInput, Coaching } from "@/lib/system2/coach";
import { addCoachCall, addJevAnswer, emptyUsage, type Usage } from "@/lib/usage";

const PAUSE_BETWEEN_RUNS_MS = 1500;
const REPLAY_BANNER_MS = 1800; // how long "REPLAY · SURVIVED" stays up before the next run
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

// The session's running token/cost totals. A ref, not state: every Jev answer
// and coach reply lands here (live flying, replays, calm-moment checks), and a
// slow ticker copies it into state so the panel updates without re-rendering
// the page four times a second.
const usageRef = { current: emptyUsage() };

// getMove is the one path every Jev answer takes: driveWithJev's live flying,
// the health-check probe, and replayMove (the judge's replays and calm-moment
// checks) all call it, so counting here counts all of them once each.
const getMove = (input: DecideInput, signal?: AbortSignal) =>
  post<Decision>("/api/move", input, signal).then((d) => {
    addJevAnswer(usageRef.current, d.usage);
    return d;
  });
// Replays share one queue: at most 4 questions a second, retried twice on failure.
const replayMove = paced((input) => getMove(input, AbortSignal.timeout(10_000)));
const getCoaching = (input: CoachInput) =>
  post<Coaching>("/api/coach", input).then((c) => {
    addCoachCall(usageRef.current, c.usage);
    return c;
  });

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
  // Jev's rulebook, the deaths it learned from, and the calm moments that check a rule leaves it shooting.
  const [book, setBook] = useState<Book>(emptyBook);
  const bookRef = useRef<Book>(book);
  const [judgeStep, setJudgeStep] = useState<JudgeStep | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [judgedRun, setJudgedRun] = useState<number | null>(null);
  const [freshRule, setFreshRule] = useState<number | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [banner, setBanner] = useState<string | null>(null); // "HIT · RUN 4 OVER", shown until the next run starts
  const [bannerTone, setBannerTone] = useState<"hit" | "good">("hit");
  const [replaying, setReplaying] = useState(false);
  // Each Start gets a run id; Stop bumps it, so an older loop still awaiting
  // something sees it has been stopped and never touches the page again.
  const runId = useRef(0);
  const runCount = useRef(0);
  const running = status === "running" || status === "starting" || status === "retrying" || status === "between";

  // Session token/cost totals for the USAGE window. usageRef (declared above,
  // outside the component) is where getMove and getCoaching actually count;
  // this just copies it into state a few times a second, so the panel updates
  // without re-rendering on every one of Jev's four-a-second answers.
  const [usage, setUsage] = useState<Usage>(usageRef.current);
  useEffect(() => {
    const id = setInterval(() => setUsage({ jev: { ...usageRef.current.jev }, nemotron: { ...usageRef.current.nemotron } }), 500);
    return () => clearInterval(id);
  }, []);

  // "You" mode: holding ← → (A D) glides the ship smoothly; letting go stops
  // it. Space fires, and holding it keeps firing as fast as the gun reloads.
  useEffect(() => {
    if (mode !== "you") return;
    const held = new Set<Move>();
    const steerFromKeys = () => {
      // Left and right held together cancel out.
      const dir = held.has("left") === held.has("right") ? 0 : held.has("left") ? -1 : 1;
      runRef.current?.steer(dir);
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const move = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!move) return;
      e.preventDefault();
      if (e.repeat || held.has(move)) return;
      held.add(move);
      if (move === "fire") runRef.current?.fire();
      else steerFromKeys();
      setLastKey(move);
    };
    const onUp = (e: KeyboardEvent) => {
      const move = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!move) return;
      held.delete(move);
      if (move !== "fire") steerFromKeys();
    };
    const release = () => {
      held.clear();
      steerFromKeys();
    };
    const timer = setInterval(() => {
      if (held.has("fire")) runRef.current?.fire();
    }, 100);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
    };
  }, [mode]);

  const newRun = useCallback(() => {
    const w = resetRun(base);
    worldRef.current = w;
    hitRef.current = false;
    setBanner(null);
    setBannerTone("hit");
    setReplaying(false);
    setScore(0);
    const run = startRun(w, (world) => setScore(world.score));
    runRef.current = run;
    return run;
  }, [base]);

  // Plays a tested replay on the playfield, from its recorded moves (no model
  // calls), at game speed. What the viewer sees is exactly what the judge flew.
  const playReplay = useCallback(
    (death: Death, result: ReplayResult, stopped: () => boolean) =>
      new Promise<void>((resolve) => {
        const pb = playback(death, result);
        worldRef.current = pb.world;
        hitRef.current = false;
        setBanner(null);
        setReplaying(true);
        setScore(pb.world.score);
        let last = performance.now();
        let carry = 0;
        const timer = setInterval(() => {
          if (stopped()) {
            clearInterval(timer);
            resolve();
            return;
          }
          const now = performance.now();
          carry += (now - last) / 1000;
          last = now;
          while (carry >= SUBSTEP && !pb.done()) {
            carry -= SUBSTEP;
            if (pb.step()) hitRef.current = true;
          }
          setScore(pb.world.score);
          if (pb.done()) {
            clearInterval(timer);
            const same = JSON.stringify(pb.world) === JSON.stringify(result.final);
            console.info(`[replay] run ${death.run}: ${result.outcome}; playback matches the tested replay: ${same}`);
            resolve();
          }
        }, 16);
      }),
    [],
  );

  const finishRun = useCallback((end: RunEnd, who: Mode, kills: number, rules: number | null) => {
    runCount.current += 1;
    const n = runCount.current;
    hitRef.current = true;
    setBanner(`HIT · RUN ${n} OVER`);
    setRuns((rs) => [...rs, { ...end, n, who, kills, rules }]);
    return n;
  }, []);

  // You: one run; the fight moves on its own and your keys fly the ship.
  const startYou = useCallback(
    async (stopped: () => boolean) => {
      setLastKey(null);
      setStatus("running");
      const run = newRun();
      const end = await run.done;
      if (stopped()) return;
      if (end) finishRun(end, "you", run.world.kills, null);
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
          await getMove({ ...describe(probe), rules: bookRef.current.rules });
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
        const rec = createRecorder();
        const rules = [...bookRef.current.rules]; // the rulebook stays fixed for the whole run
        const [end] = await Promise.all([
          run.done,
          driveWithJev(run, getMove, {
            rules: () => rules,
            onAsk: rec.onAsk,
            onAskFailed: rec.onAskFailed,
            onDecision: (d) => {
              rec.onDecision(d);
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
        const n = finishRun(end, "jev", run.world.kills, rules.length);
        setStatus("between");

        // Learn from the death: reproduce it, ask Nemotron for a rule, test it on replays.
        const controls = [...bookRef.current.controls];
        for (const c of rec.controls()) if (controls.length < 5) controls.push(c);
        bookRef.current = { ...bookRef.current, controls };
        const death = rec.toDeath(n, run.world);
        if (death) {
          setJudgedRun(n);
          setVerdict(null);
          try {
            const v = await afterDeath(death, bookRef.current, {
              decide: replayMove,
              coach: getCoaching,
              onStep: (s) => {
                if (!stopped()) setJudgeStep(s);
              },
              cancelled: stopped,
            });
            if (stopped()) return;
            bookRef.current = v.book;
            setBook(v.book);
            setJudgeStep(null);
            setVerdict(v);
            const kept = v.kind === "kept" ? v.attempts.at(-1)?.coaching : undefined;
            if (kept) {
              setFreshRule(kept.change.kind === "replace" ? kept.change.n - 1 : v.book.rules.length - 1);
              setTimeout(() => setFreshRule(null), 1200);
            }
            // Show the replay that was tested (with the kept rule, or the last rule tried).
            if (v.shown) {
              await playReplay(v.death, v.shown.result, stopped);
              if (stopped()) return;
              const survived = v.shown.result.outcome === "survived";
              setBannerTone(survived ? "good" : "hit");
              setBanner(survived ? "REPLAY · SURVIVED" : "REPLAY · HIT");
              await sleep(REPLAY_BANNER_MS);
              if (stopped()) return;
            }
          } catch (e) {
            if (e instanceof Cancelled || stopped()) return;
            setJudgeStep(null);
            setError(e instanceof Error ? e.message : String(e));
          }
        }
        await sleep(PAUSE_BETWEEN_RUNS_MS);
      }
    },
    [base, newRun, finishRun, playReplay],
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
    setJudgeStep(null);
    setReplaying(false);
    setStatus("stopped");
  }, []);

  // Start over: an empty rulebook and no saved deaths.
  const forget = useCallback(() => {
    const b = emptyBook();
    bookRef.current = b;
    setBook(b);
    setVerdict(null);
    setJudgedRun(null);
  }, []);

  return (
    <main className="layout">
      <GameCanvas worldRef={worldRef} hitRef={hitRef} score={score} who={mode} banner={banner} bannerTone={bannerTone} replaying={replaying} />
      <aside className="panel">
        <div className="titleRow">
          <h1 className="title">JEVAGA</h1>
          <StatusChip status={status} error={error} />
        </div>
        <p className="tagline">Jev flies the ship four times a second. After each death, Nemotron writes it one rule, and a replay of the death decides whether the rule stays.</p>
        <ModeSwitch mode={mode} onChange={setMode} disabled={running} />
        {mode === "jev" ? (
          <>
            <DecisionBox decision={decision} status={status} />
            <CoachBox step={judgeStep} verdict={verdict} run={judgedRun} />
            <RulebookBox book={book} fresh={freshRule} />
          </>
        ) : (
          <YouBox lastKey={lastKey} />
        )}
        <RunHistory
          runs={runs}
          seed={seed}
          live={status === "running" || status === "starting" || status === "retrying" ? { n: runs.length + 1, who: mode } : null}
        />
        <UsageBox usage={usage} />
        <Controls
          status={status}
          onStart={start}
          onStop={stop}
          onForget={mode === "jev" ? forget : undefined}
          canForget={book.rules.length > 0 || book.deaths.length > 0}
        />
      </aside>
    </main>
  );
}
