"use client";

import { useCallback, useRef, useState } from "react";
import GameCanvas from "@/components/GameCanvas";
import { Controls, DecisionBox, RunHistory, type Status } from "@/components/Panel";
import { playRun, type RunEnd } from "@/lib/game/loop";
import { randomSeed } from "@/lib/game/rng";
import { newWorld, resetRun, type World } from "@/lib/game/world";
import type { DecideInput, Decision } from "@/lib/system1/types";

async function getMove(input: DecideInput): Promise<Decision> {
  const res = await fetch("/api/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as Decision;
}

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
  const [playbook] = useState<string[]>(["Jump forward."]);
  const [runs, setRuns] = useState<(RunEnd & { n: number })[]>([]);
  const stopRef = useRef(false);

  const start = useCallback(async () => {
    stopRef.current = false;
    const w = resetRun(world);
    setWorld(w);
    setHit(false);
    setError(null);
    setDecision(null);
    setStatus("starting");
    let firstMove = true;
    try {
      const { end } = await playRun(w, playbook, {
        getMove: async (input) => {
          const d = await getMove(input);
          if (firstMove) {
            firstMove = false;
            setStatus("running");
          }
          return d;
        },
        onBeat: (_w, d) => {
          setDecision(d);
          setFrame((f) => f + 1);
        },
        stopped: () => stopRef.current,
      });
      if (end) {
        setHit(end.cause === "hit");
        setRuns((rs) => [...rs, { ...end, n: rs.length + 1 }]);
      }
      setStatus("stopped");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [world, playbook]);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return (
    <main className="layout">
      <GameCanvas world={world} frame={frame} hit={hit} />
      <aside className="panel">
        <h1>GO FROG GO</h1>
        <DecisionBox decision={decision} status={status} error={error} />
        <section className="box playbook" aria-label="Playbook">
          <h2>PLAYBOOK</h2>
          <ol>
            {playbook.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </section>
        <RunHistory runs={runs} current={runs.length + 1} seed={seed} />
        <Controls status={status} onStart={start} onStop={stop} />
      </aside>
    </main>
  );
}
