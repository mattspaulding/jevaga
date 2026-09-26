"use client";

import { useEffect, useRef, type RefObject } from "react";
import { render, TILE, VIEW_ROWS } from "@/lib/game/render";
import { COLS, type World } from "@/lib/game/world";

// Draws every animation frame from the live world, so cars glide smoothly
// without re-rendering React. `distance` comes from React state.
export default function GameCanvas({
  worldRef,
  hitRef,
  distance,
}: {
  worldRef: RefObject<World>;
  hitRef: RefObject<boolean>;
  distance: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const ctx = ref.current?.getContext("2d");
      if (ctx) render(ctx, worldRef.current, { hit: hitRef.current });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef, hitRef]);
  return (
    <div className="gameWrap">
      <canvas ref={ref} width={COLS * TILE} height={VIEW_ROWS * TILE} className="game" aria-label="Road with the frog" />
      <div className="distance">distance {distance}</div>
    </div>
  );
}
