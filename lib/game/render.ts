import { carSpans, COLS, VIEW_ROWS, visibleRows, type World } from "./world";

export { VIEW_ROWS };
export const TILE = 16;

const COLORS = {
  grass: "#5fbf3f",
  road: "#4a4a58",
  frog: "#3fbf6a",
  cars: ["#e8423a", "#3b6fe0", "#f2c233", "#9b4de0"],
  splat: "#e8423a",
};

// Draws the rows around the frog; cars at their exact positions, so they
// glide. The camera keeps the frog 3 rows from the bottom.
export function render(ctx: CanvasRenderingContext2D, world: World, opts: { hit?: boolean } = {}) {
  const { bottom } = visibleRows(world.frog.row);
  ctx.clearRect(0, 0, COLS * TILE, VIEW_ROWS * TILE);
  for (let i = 0; i < VIEW_ROWS; i++) {
    const rowIndex = bottom + i;
    const lane = world.rows[rowIndex];
    const y = (VIEW_ROWS - 1 - i) * TILE;
    if (!lane) continue;
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
  const fy = (VIEW_ROWS - 1 - (world.frog.row - bottom)) * TILE;
  ctx.fillStyle = opts.hit ? COLORS.splat : COLORS.frog;
  ctx.fillRect(world.frog.col * TILE + 3, fy + 3, TILE - 6, TILE - 6);
}
