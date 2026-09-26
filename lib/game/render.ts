import { COLS, enemyPos, ROWS, SHIP_ROW, type World } from "./world";

export const TILE = 16;
export const VIEW_W = COLS * TILE;
export const VIEW_H = ROWS * TILE;

const COLORS = {
  space: "#0b0d1c",
  star: "#cfd6ff",
  enemies: ["#e8423a", "#9b4de0", "#3b6fe0"],
  diver: "#f2c233",
  bullet: "#ff8a80",
  shot: "#ffe680",
  ship: "#3fbf6a",
  shipHi: "#c8f07a",
  boom: "#ffb347",
};

export type View = {
  shipX: number; // fractional during a slide
  stars: { x: number; y: number; s: number }[];
  starScroll: number; // pixels
  boom: number; // 0..1 explosion progress, 0 = none
};

// Plain shapes for now; sprites come in slice 7.
export function render(ctx: CanvasRenderingContext2D, world: World, view: View) {
  ctx.fillStyle = COLORS.space;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = COLORS.star;
  for (const st of view.stars) {
    const y = (st.y + view.starScroll * st.s) % VIEW_H;
    ctx.fillRect(Math.round(st.x), Math.round(y), 1, 1);
  }

  for (const e of world.enemies) {
    if (!e.alive) continue;
    const p = enemyPos(e, world.t);
    ctx.fillStyle = e.diving ? COLORS.diver : COLORS.enemies[e.kind];
    ctx.fillRect(Math.round(p.x * TILE + 2), Math.round(p.y * TILE + 3), TILE - 4, TILE - 6);
  }
  ctx.fillStyle = COLORS.bullet;
  for (const b of world.bullets) ctx.fillRect(b.col * TILE + 7, Math.round(b.y * TILE), 2, 5);
  ctx.fillStyle = COLORS.shot;
  for (const s of world.shots) ctx.fillRect(s.col * TILE + 7, Math.round(s.y * TILE), 2, 6);

  const sx = view.shipX * TILE;
  const sy = SHIP_ROW * TILE;
  if (view.boom > 0) {
    const r = 2 + view.boom * 10;
    ctx.fillStyle = COLORS.boom;
    ctx.globalAlpha = 1 - view.boom;
    ctx.fillRect(sx + 8 - r, sy + 8 - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = COLORS.ship;
    ctx.fillRect(sx + 2, sy + 8, 12, 6);
    ctx.fillRect(sx + 6, sy + 3, 4, 5);
    ctx.fillStyle = COLORS.shipHi;
    ctx.fillRect(sx + 7, sy + 4, 2, 2);
  }
}
