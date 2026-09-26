"use client";

import { useEffect, useRef, type RefObject } from "react";
import { makeRng } from "@/lib/game/rng";
import { render, VIEW_H, VIEW_W } from "@/lib/game/render";
import type { World } from "@/lib/game/world";

const SLIDE_MS = 90;
const BOOM_MS = 600;
const STAR_SPEED = 6; // pixels per second at depth 1

// Draws every animation frame from the live fight, so movement is smooth
// without re-rendering React. The ship's slide, the stars and the explosion are eased here.
export default function GameCanvas({
  worldRef,
  hitRef,
  score,
  who,
}: {
  worldRef: RefObject<World>;
  hitRef: RefObject<boolean>;
  score: number;
  who: "JEV" | "YOU";
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const r = makeRng(7);
    const stars = Array.from({ length: 50 }, () => ({ x: r() * VIEW_W, y: r() * VIEW_H, s: 0.4 + r() * 1.2 }));
    let raf = 0;
    let from = worldRef.current.ship.col;
    let to = from;
    let slideStart = -Infinity;
    let boomStart = -Infinity;
    let wasHit = false;
    let world = worldRef.current;
    const t0 = performance.now();

    const draw = (now: number) => {
      if (worldRef.current !== world) {
        // A new run: snap the ship back and clear the explosion.
        world = worldRef.current;
        from = to = world.ship.col;
        slideStart = boomStart = -Infinity;
        wasHit = false;
      }
      if (world.ship.col !== to) {
        from = to;
        to = world.ship.col;
        slideStart = now;
      }
      if (hitRef.current && !wasHit) {
        wasHit = true;
        boomStart = now;
      }
      const p = Math.min(1, (now - slideStart) / SLIDE_MS);
      const shipX = from + (to - from) * (1 - (1 - p) * (1 - p));
      const boom = wasHit ? Math.min(0.999, (now - boomStart) / BOOM_MS) : 0;
      const ctx = ref.current?.getContext("2d");
      if (ctx) render(ctx, world, { shipX, stars, starScroll: ((now - t0) / 1000) * STAR_SPEED, boom });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef, hitRef]);
  return (
    <div className="gameWrap">
      <canvas ref={ref} width={VIEW_W} height={VIEW_H} className="game" aria-label="Jevaga playfield" />
      <div className="distance">score {score}</div>
      <div className="whoTag">{who}</div>
    </div>
  );
}
