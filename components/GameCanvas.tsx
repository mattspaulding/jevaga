"use client";

import { useEffect, useRef, type RefObject } from "react";
import { makeRng } from "@/lib/game/rng";
import { render, VIEW_H, VIEW_W, type Star } from "@/lib/game/render";
import type { World } from "@/lib/game/world";


// Draws every animation frame from the live fight, so movement is smooth
// without re-rendering React. The starfield scrolls and the hit is timed here.
export default function GameCanvas({
  worldRef,
  hitRef,
  score,
  who,
  banner,
  bannerTone = "hit",
  replaying = false,
}: {
  worldRef: RefObject<World>;
  hitRef: RefObject<boolean>;
  score: number;
  who: "jev" | "you";
  banner: string | null;
  bannerTone?: "hit" | "good";
  replaying?: boolean; // the playfield is showing a death's replay, not a live run
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
    let world = worldRef.current;
    const t0 = performance.now();

    const draw = (now: number) => {
      if (worldRef.current !== world) {
        // A new run: clear the explosion.
        world = worldRef.current;
        boomStart = -Infinity;
        wasHit = false;
      }
      if (hitRef.current && !wasHit) {
        wasHit = true;
        boomStart = now;
      }
      const ctx = ref.current?.getContext("2d");
      if (ctx) render(ctx, world, { who: whoRef.current, stars, starSeconds: (now - t0) / 1000, boomMs: wasHit ? now - boomStart : null });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef, hitRef]);
  return (
    <div className="gameWrap">
      <canvas ref={ref} width={VIEW_W} height={VIEW_H} className="game" aria-label="Jevaga playfield" />
      <div className="hud hudScore">
        <span className="hudLabel">SCORE</span>
        <span className="hudNum">{score}</span>
      </div>
      <div className={`hud whoTag ${replaying ? "replay" : who}`}>{replaying ? "REPLAY" : who === "jev" ? "JEV" : "YOU"}</div>
      {banner && (
        <div className={`hitBanner ${bannerTone}`} role="status">
          {banner}
        </div>
      )}
    </div>
  );
}
