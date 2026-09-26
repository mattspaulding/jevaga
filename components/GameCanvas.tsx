"use client";

import { useEffect, useRef, type RefObject } from "react";
import { render, TILE, VIEW_ROWS } from "@/lib/game/render";
import { COLS, visibleRows, type World } from "@/lib/game/world";

const HOP_MS = 140;
const HOP_HEIGHT = 5; // pixels at the top of the arc
const CAMERA_EASE = 8; // higher = camera catches up faster

// Draws every animation frame from the live world, so cars glide without
// re-rendering React. The frog's hop and the camera are eased here.
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
    let lastFrame = performance.now();
    let from = { ...worldRef.current.frog };
    let to = { ...worldRef.current.frog };
    let hopStart = -Infinity;
    let camera = visibleRows(to.row).bottom;

    const draw = (now: number) => {
      const world = worldRef.current;
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const f = world.frog;
      if (f.row !== to.row || f.col !== to.col) {
        // A new run puts the frog back at the start: snap instead of hopping.
        const jump = Math.abs(f.row - to.row) > 1;
        from = jump ? { ...f } : { row: to.row, col: to.col };
        to = { ...f };
        hopStart = jump ? -Infinity : now;
        if (jump) camera = visibleRows(f.row).bottom;
      }
      const p = Math.min(1, (now - hopStart) / HOP_MS);
      const ease = 1 - (1 - p) * (1 - p);
      const frogRow = from.row + (to.row - from.row) * ease;
      const frogCol = from.col + (to.col - from.col) * ease;
      const lift = p < 1 ? Math.sin(Math.PI * p) * HOP_HEIGHT : 0;
      const target = visibleRows(to.row).bottom;
      camera += (target - camera) * Math.min(1, dt * CAMERA_EASE);
      if (Math.abs(target - camera) < 0.002) camera = target;

      const ctx = ref.current?.getContext("2d");
      if (ctx) render(ctx, world, { cameraBottom: camera, frogCol, frogRow, lift, hit: hitRef.current });
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
