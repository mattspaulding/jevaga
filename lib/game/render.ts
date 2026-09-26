import { SHIP_ROW, enemyPos, COLS, ROWS, type World } from "./world";
import { BODY, drawSprite, type SpriteName } from "./sprites";

export const TILE = 16;
export const VIEW_W = COLS * TILE;
export const VIEW_H = ROWS * TILE;

const SPACE = "#0b0d1c";
const STAR_FAR = "#3a3a58";
const STAR_NEAR = "#b8c0e0";

// Frame timings from the "In motion" board of the sprite canvas.
const FLAP_S = 0.33; // enemies flap between two frames
const THRUST_S = 0.08; // the ship's flame flickers
const POP_S = 0.08; // three frames when an enemy is destroyed
export const BOOM_FRAME_MS = 150; // four frames when the ship is hit
export const BOOM_MS = BOOM_FRAME_MS * 4;

export type Star = { x: number; y: number; depth: 0 | 1 | 2 }; // far, near, bright
export const STAR_SPEED = [4, 9, 16]; // pixels per second, by depth

export type View = {
  who: "jev" | "you"; // the ship's color says who is flying
  stars: Star[];
  starSeconds: number; // how far the starfield has scrolled
  boomMs: number | null; // time since the ship was hit, or null
};

// Every object is drawn centred on its position: (x × 16 + 8, y × 16 + 8).
const px = (x: number) => x * TILE + TILE / 2;

export function render(ctx: CanvasRenderingContext2D, world: World, view: View) {
  ctx.fillStyle = SPACE;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  for (const st of view.stars) {
    const y = (st.y + view.starSeconds * STAR_SPEED[st.depth]) % VIEW_H;
    if (st.depth === 2) drawSprite(ctx, "star-bright", st.x, y);
    else {
      ctx.fillStyle = st.depth === 0 ? STAR_FAR : STAR_NEAR;
      ctx.fillRect(Math.round(st.x), Math.round(y), 1, 1);
    }
  }

  const flap = Math.floor(world.t / FLAP_S) % 2 === 0 ? "a" : "b";
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const p = enemyPos(e, world.t);
    const name = (e.diving ? `dive${e.kind}` : `enemy${e.kind}-${flap}`) as SpriteName;
    drawSprite(ctx, name, px(p.x), px(p.y), BODY.enemy[e.kind]);
  }
  for (const pop of world.pops) {
    const frame = Math.floor((world.t - pop.t) / POP_S);
    if (frame < 3) drawSprite(ctx, `pop-${frame + 1}` as SpriteName, px(pop.x), px(pop.y), BODY.enemy[pop.kind]);
  }

  for (const b of world.bullets) drawSprite(ctx, "bullet", px(b.x), px(b.y));
  for (const s of world.shots) drawSprite(ctx, "shot", px(s.x), px(s.y));

  const ship = BODY[view.who];
  const sx = px(world.ship.x);
  const sy = px(SHIP_ROW);
  if (view.boomMs === null) {
    const thrust = Math.floor(world.t / THRUST_S) % 2 === 1;
    drawSprite(ctx, thrust ? "ship-thrust" : "ship", sx, sy, ship);
  } else {
    const frame = Math.floor(view.boomMs / BOOM_FRAME_MS);
    if (frame < 4) drawSprite(ctx, `boom-${frame + 1}` as SpriteName, sx, sy, ship);
  }
}
