import {
  BAT_DROP,
  batCommitAge,
  batZigX,
  COLS,
  COMMIT_ROW,
  CY_GLOW,
  enemyPos,
  ENTRY_LEAD,
  ENTRY_PATHS,
  ENTRY_SPEED,
  entryAt,
  HOVER_ROW,
  PICKUP_BLINK,
  PICKUP_STAYS,
  ROWS,
  SHIP_ROW,
  wingmen,
  type Dive,
  type Enemy,
  type Weapon,
  type World,
} from "./world";
import { bulletsAt, dancing, debrisAt, enemyAt, flashAt, shotsAt, type Aftermath } from "./aftermath";
import { BODY, drawSprite, PALETTE_GOLD, type SpriteName } from "./sprites";

export const TILE = 16;
export const VIEW_W = COLS * TILE;
export const VIEW_H = ROWS * TILE;

const SPACE = "#0b0d1c";
const STAR_FAR = "#3a3a58";
const STAR_NEAR = "#b8c0e0";
const GLOW = "#ffe680";

// Frame timings from the "In motion" board of the sprite canvas.
const FLAP_S = 0.33; // enemies flap between two frames
const REV_S = 0.06; // a revving Drone flaps much faster
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
  aftermath?: { a: Aftermath; s: number } | null; // after a hit: the death sequence, s seconds in
};

// Every object is drawn centred on its position: (x × 16 + 8, y × 16 + 8).
const px = (x: number) => x * TILE + TILE / 2;

// A dotted line in playfield cells, one pixel dot every `gap` pixels.
function dotted(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], color: string, alpha: number, gap = 3) {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = px(pts[i - 1].x), ay = px(pts[i - 1].y);
    const bx = px(pts[i].x), by = px(pts[i].y);
    const len = Math.hypot(bx - ax, by - ay);
    for (let s = carry; s < len; s += gap) ctx.fillRect(Math.round(ax + ((bx - ax) * s) / len), Math.round(ay + ((by - ay) * s) / len), 1, 1);
    carry = len > 0 ? (gap - ((len - carry) % gap)) % gap : carry;
  }
  ctx.globalAlpha = 1;
}

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, color: string) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  ctx.fillStyle = color;
  for (let i = 1; i <= 3; i++)
    for (const side of [-1, 1]) ctx.fillRect(Math.round(px(x) - ux * i * 1.5 + side * uy * i * 1.5), Math.round(px(y) - uy * i * 1.5 - side * ux * i * 1.5), 1, 1);
}

// Every dive shows where it's going before it gets there (enemy-design.md, section 4),
// in its enemy's color.
function pathLine(ctx: CanvasRenderingContext2D, e: Enemy, d: Dive, t: number) {
  const color = BODY.enemy[e.kind];
  const column = (from: number, alpha: number) => dotted(ctx, [{ x: d.col, y: from }, { x: d.col, y: SHIP_ROW }], color, alpha, 2);
  if (d.phase === "home" || d.phase === "enter" || d.phase === "settle") return;
  if (e.kind === 2) {
    // Drone: the column it will fall down, and a carrier's mini-drones' columns either side
    const from = d.phase === "fall" ? d.y + 0.6 : d.y;
    column(from, 0.7);
    if (e.carries === "wingmen" && d.phase !== "fall")
      for (const x of [d.col - 1, d.col + 1]) if (x >= 0 && x <= COLS - 1) dotted(ctx, [{ x, y: from }, { x, y: SHIP_ROW }], color, 0.45, 2);
    return;
  }
  if (e.kind === 0) {
    if (d.phase === "park") column(d.y + 0.6, 0.35);
    else if (d.phase === "drop") column(d.y + 0.6, 0.7);
    else {
      // Cyclops on its way: a line to the spot it will park, marked with a square
      dotted(ctx, [{ x: d.x, y: d.y }, { x: d.col, y: HOVER_ROW }], color, 0.8);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = color;
      const cx = Math.round(px(d.col)), cy = Math.round(px(HOVER_ROW));
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(cx + i, cy - 3, 1, 1);
        ctx.fillRect(cx + i, cy + 3, 1, 1);
        ctx.fillRect(cx - 3, cy + i, 1, 1);
        ctx.fillRect(cx + 3, cy + i, 1, 1);
      }
      ctx.globalAlpha = 1;
      column(HOVER_ROW + 0.6, 0.3);
    }
    return;
  }
  if (d.phase === "commit") {
    // Bat: the arrow to the spot it committed to
    if (d.y < SHIP_ROW - 1) {
      // stops short of the ship's row so the head isn't hidden under the ship
      const tip = { x: d.col - (d.vx / 4) * 0.7, y: SHIP_ROW - 0.7 };
      dotted(ctx, [{ x: d.x, y: d.y + 0.5 }, tip], color, 0.9, 2);
      arrowHead(ctx, tip.x, tip.y, tip.x - d.x, tip.y - d.y, color);
    }
    return;
  }
  // Bat: the rest of its zigzag, down to the row where it commits
  const end = batCommitAge(d);
  const pts = [];
  for (let a = d.phase === "zig" ? t - d.since : 0; a < end; a += 0.04) pts.push({ x: batZigX(d, a), y: d.y0 + BAT_DROP * a });
  pts.push({ x: batZigX(d, end), y: COMMIT_ROW });
  dotted(ctx, pts, color, 0.75);
}

// Each fly-in group's path, from 1 s before its first enemy appears until its
// last one has flown it, drawn ahead of the last enemy in the file.
function entryLines(ctx: CanvasRenderingContext2D, world: World) {
  const tail = new Map<number, Enemy>();
  for (const e of world.enemies) {
    const d = e.diving;
    if (!e.alive || d?.phase !== "enter") continue;
    const last = tail.get(d.path);
    if (!last || d.since > last.diving!.since) tail.set(d.path, e);
  }
  for (const [path, e] of tail) {
    const d = e.diving!;
    const first = Math.min(...world.enemies.filter((o) => o.alive && o.diving?.phase === "enter" && o.diving.path === path).map((o) => o.diving!.since));
    if (world.t < first - ENTRY_LEAD) continue;
    const along = Math.max(0, (world.t - d.since) * ENTRY_SPEED);
    const pts = ENTRY_PATHS[path].filter((p) => p.at > along);
    dotted(ctx, [entryAt(path, along), ...pts], BODY.enemy[e.kind], 0.55);
  }
}

// Weapon icons, drawn in code (5 × 5 pixels): an eye, a fan of three, a pair of wings.
const ICONS: Record<Weapon, string[]> = {
  beam: [".OOO.", "OWKWO", "OKKKO", "OWKWO", ".OOO."],
  fan: ["R.R.R", ".RRR.", "..R..", "..R..", "..R.."],
  wingmen: ["M...M", "MM.MM", ".MMM.", "..M..", "....."],
};
const ICON_COLORS: Record<string, string> = { O: "#ffb347", W: "#f2f0e6", K: "#1b1b28", R: "#e8423a", M: "#b8c0e0" };
function icon(ctx: CanvasRenderingContext2D, weapon: Weapon, cx: number, cy: number, scale = 1) {
  const rows = ICONS[weapon];
  const x0 = Math.round(cx - (5 * scale) / 2);
  const y0 = Math.round(cy - (5 * scale) / 2);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = ICON_COLORS[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale);
    }
  });
}

// A mini-drone (a carrier Drone's, or one of your Wingmen): a small chevron.
function mini(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, up: boolean) {
  const rows = ["X...X", "XX.XX", ".XXX.", "..X.."];
  const x0 = Math.round(cx - 2.5);
  const y0 = Math.round(cy - 2);
  (up ? [...rows].reverse() : rows).forEach((row, y) => {
    for (let x = 0; x < 5; x++)
      if (row[x] === "X") {
        ctx.fillStyle = color;
        ctx.fillRect(x0 + x, y0 + y, 1, 1);
      }
  });
}

// Eye Beams: a carrier Cyclops's thin warning line, then the beam filling the
// column; your own is a flash up your column.
function beams(ctx: CanvasRenderingContext2D, world: World, t: number, shipColor: string) {
  for (const b of world.beams) {
    const cx = Math.round(px(b.x));
    if (b.from === "ship") {
      const fade = Math.max(0, 1 - (t - b.start) / (b.end - b.start));
      ctx.globalAlpha = fade;
      ctx.fillStyle = shipColor;
      ctx.fillRect(cx - 2, 0, 5, Math.round(px(SHIP_ROW) - 6));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx - 1, 0, 2, Math.round(px(SHIP_ROW) - 6));
      ctx.globalAlpha = 1;
      continue;
    }
    const owner = world.enemies.find((e) => e.id === b.owner);
    const top = Math.round(px(owner ? enemyPos(owner, t).y : HOVER_ROW) + 6);
    const bottom = VIEW_H;
    if (t < b.start) {
      // the warning line blinks faster as the beam gets closer
      const u = (t - b.warn) / (b.start - b.warn);
      if (Math.floor(t / (0.12 - 0.08 * u)) % 2 === 0) {
        ctx.globalAlpha = 0.5 + 0.5 * u;
        ctx.fillStyle = "#ffb347";
        ctx.fillRect(cx, top, 1, bottom - top);
        ctx.globalAlpha = 1;
      }
      continue;
    }
    const flicker = Math.floor(t / 0.04) % 2 === 0 ? 1 : 0.8;
    ctx.globalAlpha = 0.9 * flicker;
    ctx.fillStyle = "#ffb347";
    ctx.fillRect(cx - 3, top, 7, bottom - top);
    ctx.fillStyle = GLOW;
    ctx.fillRect(cx - 2, top, 5, bottom - top);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - 1, top, 2, bottom - top);
    ctx.globalAlpha = 1;
  }
}

// A Cyclops hit once keeps its eye shut: a lid over the eye with a dark slit.
function eyeShut(ctx: CanvasRenderingContext2D, cx: number, cy: number, dive: boolean) {
  const x = Math.round(cx), y = Math.round(cy);
  const top = dive ? 0 : -2;
  ctx.fillStyle = BODY.enemy[0];
  ctx.fillRect(x - 3, y + top, 6, dive ? 5 : 4);
  ctx.fillStyle = "#1b1b28";
  ctx.fillRect(x - 3, y + top + (dive ? 2 : 1), 6, 1);
}

// A Cyclops's eye glows before it fires: the eye fills with light, the pupil
// goes white, and two rays reach out past its body. `amount` runs 0 to 1.
function eyeGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, amount: number, dive: boolean) {
  const x = Math.round(cx), y = Math.round(cy);
  const top = dive ? 0 : -2; // the eye sits lower in the dive pose
  const pupil = dive ? 2 : -1;
  ctx.fillStyle = GLOW;
  ctx.globalAlpha = 0.3 + 0.6 * amount;
  ctx.fillRect(x - 3, y + top, 6, dive ? 5 : 4);
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.5 + 0.5 * amount;
  ctx.fillRect(x - 1, y + pupil, 2, 2);
  ctx.fillStyle = GLOW;
  ctx.globalAlpha = amount;
  const reach = 1 + Math.round(2 * amount);
  ctx.fillRect(x - 7 - reach, y + pupil, reach + 1, 1);
  ctx.fillRect(x + 7, y + pupil, reach + 1, 1);
  ctx.globalAlpha = 1;
}

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

  const after = view.aftermath ?? null;
  const t = after ? after.a.tHit + after.s : world.t;
  if (!after) {
    entryLines(ctx, world);
    for (const e of world.enemies) if (e.alive && e.diving) pathLine(ctx, e, e.diving, t);
  }

  const flap = Math.floor(t / FLAP_S) % 2 === 0 ? "a" : "b";
  if (after) {
    // After the hit: everyone flies home, then the formation dances (lib/game/aftermath.ts).
    const party = dancing(after.a, after.s);
    const beat = party ? (Math.floor(t / 0.12) % 2 === 0 ? "a" : "b") : flap; // flapping double time
    for (const e of after.a.enemies) {
      const p = enemyAt(after.a, e, after.s);
      if (p.y < -1) continue;
      drawSprite(ctx, `enemy${e.kind}-${beat}` as SpriteName, px(p.x), px(p.y), BODY.enemy[e.kind]);
      if (e.kind === 0 && (e.hp === 1 || p.wink)) eyeShut(ctx, px(p.x), px(p.y), false);
    }
  }
  for (const e of after ? [] : world.enemies) {
    if (!e.alive) continue;
    const p = enemyPos(e, t);
    if (p.y < -1) continue; // still waiting to fly in
    const d = e.diving;
    // Flying in, it wears its dive pose while heading down and its formation pose while climbing.
    const climbing = d?.phase === "enter" && entryAt(d.path, (t - d.since) * ENTRY_SPEED - 0.3).y > p.y;
    const inSlot = !d || d.phase === "rev" || d.phase === "flap" || d.phase === "open" || d.phase === "home" || d.phase === "settle" || climbing;
    let frame = flap;
    let jitter = 0;
    if (d?.phase === "rev") {
      frame = Math.floor(t / REV_S) % 2 === 0 ? "a" : "b";
      jitter = Math.floor(t / REV_S) % 2 === 0 ? -1 : 1;
    }
    const name = (inSlot ? `enemy${e.kind}-${frame}` : `dive${e.kind}`) as SpriteName;
    const flash = t - e.hurt < 0.12; // a hit that didn't kill flashes white
    const gleam = !!e.carries && (t + e.id * 0.13) % 0.8 < 0.1; // a carrier blinks gold now and then
    drawSprite(ctx, name, px(p.x) + jitter, px(p.y), flash ? "#ffffff" : gleam ? GLOW : BODY.enemy[e.kind]);
    if (e.kind === 0 && e.hp === 1 && !flash) eyeShut(ctx, px(p.x), px(p.y), !inSlot);
    if (e.kind === 0 && e.charge !== null) eyeGlow(ctx, px(p.x), px(p.y), 1 - Math.max(0, e.charge - t) / CY_GLOW, !inSlot);
    if (e.kind === 0 && d?.phase === "park" && e.carries !== "beam") {
      const into = (t - d.since) % CY_GLOW;
      eyeGlow(ctx, px(p.x), px(p.y), into / CY_GLOW, true);
    }
    if (e.kind === 0 && d?.phase === "park" && e.carries === "beam") eyeGlow(ctx, px(p.x), px(p.y), Math.min(1, (t - d.since) / 0.8), true);
    if (e.carries) {
      // a carrier's weapon glows over it, in the empty strip above its sprite
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 8);
      icon(ctx, e.carries, px(p.x), px(p.y) - 8);
      ctx.globalAlpha = 1;
    }
  }
  for (const pop of world.pops) {
    const frame = Math.floor((t - pop.t) / POP_S);
    if (frame < 3) drawSprite(ctx, `pop-${frame + 1}` as SpriteName, px(pop.x), px(pop.y), BODY.enemy[pop.kind]);
  }

  if (!after) {
    for (const m of world.minis) mini(ctx, px(m.x), px(m.y), BODY.enemy[2], false);
    for (const p of world.pickups) {
      // falling, it flips; on your row it sits on a gold tile and blinks through its last second
      const blink = p.landed !== null && t - p.landed > PICKUP_STAYS - PICKUP_BLINK && Math.floor(t / 0.1) % 2 === 0;
      if (blink) continue;
      const cx = px(p.x);
      const cy = px(p.y);
      ctx.fillStyle = GLOW;
      ctx.fillRect(Math.round(cx - 7), Math.round(cy - 7), 14, 14);
      ctx.fillStyle = "#0b0d1c";
      ctx.fillRect(Math.round(cx - 6), Math.round(cy - 6), 12, 12);
      if (p.landed !== null || Math.floor(t / 0.12) % 2 === 0) icon(ctx, p.weapon, cx, cy, 2);
      else icon(ctx, p.weapon, cx, cy, 1);
    }
    beams(ctx, world, t, BODY[view.who]);
  }
  for (const b of after ? bulletsAt(after.a, after.s) : world.bullets) drawSprite(ctx, b.from === 0 ? "bullet-aim" : "bullet", px(b.x), px(b.y));
  for (const s of after ? shotsAt(after.a, after.s) : world.shots) drawSprite(ctx, "shot", px(s.x), px(s.y));

  const ship = BODY[view.who];
  const sx = px(world.ship.x);
  const sy = px(SHIP_ROW);
  if (view.boomMs === null) {
    const thrust = Math.floor(t / THRUST_S) % 2 === 1;
    drawSprite(ctx, thrust ? "ship-thrust" : "ship", sx, sy, ship);
    for (const w of wingmen(world)) mini(ctx, px(w.x), sy + 2, ship, true);
  } else {
    const frame = Math.floor(view.boomMs / BOOM_FRAME_MS);
    if (frame < 4) drawSprite(ctx, `boom-${frame + 1}` as SpriteName, sx, sy, ship);
  }
  if (after) {
    // The ship's pieces, then a white flash over everything.
    for (const p of debrisAt(after.a, after.s)) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.d.color === "body" ? ship : p.d.color === "gold" ? PALETTE_GOLD : "#ffffff";
      ctx.fillRect(Math.round(px(p.x) - p.d.size / 2), Math.round(px(p.y) - p.d.size / 2), p.d.size, p.d.size);
    }
    const flash = flashAt(after.s);
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    ctx.globalAlpha = 1;
  }
}
