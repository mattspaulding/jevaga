"use client";

import { useEffect, useRef, type RefObject } from "react";
import { shakeAt, startAftermath, type Aftermath } from "@/lib/game/aftermath";
import { createCueTracker } from "@/lib/game/cues";
import { makeRng } from "@/lib/game/rng";
import { sound } from "@/lib/game/sound";
import { render, VIEW_H, VIEW_W, type Star } from "@/lib/game/render";
import type { World } from "@/lib/game/world";


// Draws every animation frame from the live fight, so movement is smooth
// without re-rendering React. The starfield scrolls, the hit is timed and the
// sound cues are read off the fight here.
export default function GameCanvas({
  worldRef,
  hitRef,
  replayingRef,
  score,
  who,
  banner,
  bannerTone = "hit",
  replaying = false,
  simulated = false,
}: {
  worldRef: RefObject<World>;
  hitRef: RefObject<boolean>;
  replayingRef: RefObject<boolean>; // set before a replay's world is swapped in, so its first frame cues a rewind
  score: number;
  who: "jev" | "you";
  banner: string | null;
  bannerTone?: "hit" | "good";
  replaying?: boolean; // the playfield is showing a death's replay, not a live run
  simulated?: boolean; // the offline stand-in is flying, not Jev (SYSTEM1=fake)
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const whoRef = useRef(who);
  useEffect(() => {
    whoRef.current = who;
  }, [who]);
  useEffect(() => {
    const r = makeRng(7);
    // Three depths: many dim far stars, fewer near ones, a rare bright one.
    const layer = (n: number, depth: Star["depth"]): Star[] =>
      Array.from({ length: n }, () => ({ x: r() * VIEW_W, y: r() * VIEW_H, depth }));
    const stars = [...layer(36, 0), ...layer(14, 1), ...layer(3, 2)];
    let raf = 0;
    let boomStart = -Infinity;
    let wasHit = false;
    let after: Aftermath | null = null; // the death sequence, from the world at the hit
    let world = worldRef.current;
    const t0 = performance.now();
    const cues = createCueTracker();

    const draw = (now: number) => {
      if (worldRef.current !== world) {
        // A new run: clear the explosion.
        world = worldRef.current;
        boomStart = -Infinity;
        wasHit = false;
        after = null;
      }
      if (hitRef.current && !wasHit) {
        wasHit = true;
        boomStart = now;
        if (!world.alive) after = startAftermath(world);
      }
      const s = (now - boomStart) / 1000;
      const canvas = ref.current;
      if (canvas) {
        // the playfield shakes for a moment when the ship blows up
        const k = canvas.clientWidth / VIEW_W;
        const shake = after ? shakeAt(s) : { x: 0, y: 0 };
        canvas.style.transform = shake.x || shake.y ? `translate(${shake.x * k}px, ${shake.y * k}px)` : "";
      }
      for (const cue of cues.update(world, replayingRef.current)) sound.play(cue);
      const ctx = ref.current?.getContext("2d");
      if (ctx) render(ctx, world, { who: whoRef.current, stars, starSeconds: (now - t0) / 1000, boomMs: wasHit ? now - boomStart : null, aftermath: after ? { a: after, s } : null });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef, hitRef, replayingRef]);
  return (
    <div className="gameWrap">
      <canvas ref={ref} width={VIEW_W} height={VIEW_H} className="game" aria-label="Jevaga playfield" />
      <div className="hud hudScore">
        <span className="hudLabel">SCORE</span>
        <span className="hudNum">{score}</span>
      </div>
      <div className={`hud whoTag ${replaying ? "replay" : simulated ? "simulated" : who}`}>{replaying ? "REPLAY" : simulated ? "SIMULATED" : who === "jev" ? "JEV" : "YOU"}</div>
      {banner && (
        <div className={`hitBanner ${bannerTone}`} role="status">
          {banner}
        </div>
      )}
    </div>
  );
}
