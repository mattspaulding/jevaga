"use client";

import { useEffect, useRef } from "react";
import { render, TILE, VIEW_ROWS } from "@/lib/game/render";
import { COLS, type World } from "@/lib/game/world";

// Redraws whenever `frame` changes. The world object itself is mutated by the loop.
export default function GameCanvas({ world, frame, hit }: { world: World; frame: number; hit: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) render(ctx, world, { hit });
  }, [world, frame, hit]);
  return (
    <div className="gameWrap">
      <canvas ref={ref} width={COLS * TILE} height={VIEW_ROWS * TILE} className="game" aria-label="Road with the frog" />
      <div className="distance">distance {world.furthest}</div>
    </div>
  );
}
