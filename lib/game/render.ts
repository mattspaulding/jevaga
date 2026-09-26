import { carSpans, COLS, VIEW_ROWS, type World } from "./world";

export { VIEW_ROWS };
export const TILE = 16;

const COLORS = {
  grass: "#5fbf3f",
  road: "#4a4a58",
  frog: "#3fbf6a",
  cars: ["#e8423a", "#3b6fe0", "#f2c233", "#9b4de0"],
  splat: "#e8423a",
};

// What the camera and frog look like this frame. The game logic moves the
// frog square to square instantly; the view eases the frog and the camera so
// hops and scrolling look smooth.
export type View = {
  cameraBottom: number; // lowest row on screen, fractional while scrolling
  frogCol: number; // fractional during a hop
  frogRow: number;
  lift: number; // pixels the frog is off the ground mid-hop
  hit: boolean;
};

export function render(ctx: CanvasRenderingContext2D, world: World, view: View) {
  const base = Math.floor(view.cameraBottom);
  const frac = view.cameraBottom - base;
  const rowY = (row: number) => (VIEW_ROWS - 1 - (row - view.cameraBottom)) * TILE;
  ctx.clearRect(0, 0, COLS * TILE, VIEW_ROWS * TILE);
  for (let i = 0; i <= VIEW_ROWS; i++) {
    const rowIndex = base + i;
    const lane = world.rows[rowIndex];
    if (!lane) continue;
    const y = (VIEW_ROWS - 1 - i + frac) * TILE;
    ctx.fillStyle = lane.kind === "grass" ? COLORS.grass : COLORS.road;
    ctx.fillRect(0, y, COLS * TILE, TILE);
    for (const { car, x, len } of carSpans(lane, world.t)) {
      ctx.fillStyle = COLORS.cars[(rowIndex + car) % COLORS.cars.length];
      const w = len * TILE - 2;
      const px = x * TILE + 1;
      ctx.fillRect(px, y + 3, w, TILE - 6);
      // A car crossing the right edge also shows at the left.
      if (px + w > COLS * TILE) ctx.fillRect(px - COLS * TILE, y + 3, w, TILE - 6);
    }
  }
  // Shadow stays on the ground; the frog rises above it mid-hop.
  const fx = view.frogCol * TILE;
  const fy = rowY(view.frogRow);
  if (view.lift > 0.5) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(fx + 4, fy + 10, TILE - 8, 3);
  }
  ctx.fillStyle = view.hit ? COLORS.splat : COLORS.frog;
  ctx.fillRect(fx + 3, fy + 3 - view.lift, TILE - 6, TILE - 6);
}
