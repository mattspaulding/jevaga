// Every sprite in the fight, copied from the Grids board of the "Jevaga sprites"
// design canvas (https://claude.ai/artifact/Rubi3VRwQKMfUmArD9pLdL). One character
// per pixel; PALETTE says what each letter is. C is the body color of whoever
// is drawn (the ship: who flies; an enemy: its kind), S and h are shades of it.
// Regenerate from the board rather than editing by hand.

export const SPRITES = {
  "ship": [
    ".......KK.......",
    "......KhhK......",
    "......KCCK......",
    ".....KCXXCK.....",
    ".KK..KXWXXK..KK.",
    "KhCK.KXXXXK.KhCK",
    "KhCK.KCXXCK.KhCK",
    "KCCKKCCUUCCKKCCK",
    "KCCCCCCCCCCCCCCK",
    "KCCCCCCCCCCCCCCK",
    "KCCKKCCCCCCKKCCK",
    "KSSK.KCCCCK.KSSK",
    ".KK..KSSSSK..KK.",
    "......KYYK......",
    ".......OO.......",
    "................",
  ],
  "ship-thrust": [
    ".......KK.......",
    "......KhhK......",
    "......KCCK......",
    ".....KCXXCK.....",
    ".KK..KXWXXK..KK.",
    "KhCK.KXXXXK.KhCK",
    "KhCK.KCXXCK.KhCK",
    "KCCKKCCUUCCKKCCK",
    "KCCCCCCCCCCCCCCK",
    "KCCCCCCCCCCCCCCK",
    "KCCKKCCCCCCKKCCK",
    "KSSK.KCCCCK.KSSK",
    ".OO..KSSSSK..OO.",
    "..O...KYYK...O..",
    "......FWWF......",
    ".......OO.......",
  ],
  "enemy0-a": [
    "................",
    "................",
    "................",
    ".....KKKKKK.....",
    "....KhhCCCCK....",
    "...KhhCCCCCCK...",
    "..KhCCWWWWCCCK..",
    "..KCCWWKKWWCCK..",
    "..KCCWWKKWWCCK..",
    "..KCCCWWWWCCCK..",
    "..KCCCCCCCCCCK..",
    "..KSSSSSSSSSSK..",
    "...C..C..C..C...",
    "..C...C..C...C..",
    "................",
    "................",
  ],
  "enemy0-b": [
    "................",
    "................",
    "................",
    ".....KKKKKK.....",
    "....KhhCCCCK....",
    "...KhhCCCCCCK...",
    "..KhCCWWWWCCCK..",
    "..KCCWWWWWWCCK..",
    "..KCCWWKKWWCCK..",
    "..KCCCWKKWCCCK..",
    "..KCCCCCCCCCCK..",
    "..KSSSSSSSSSSK..",
    "...C..C..C..C...",
    "....C.C..C.C....",
    "................",
    "................",
  ],
  "dive0": [
    "................",
    ".C...C....C...C.",
    "..C..C....C..C..",
    "...C..C..C..C...",
    "..FCF.FFFF.FCF..",
    "..FCCFCCCCFCCF..",
    "...FCChhCCCCF...",
    "...FhCCCCCCCF...",
    "..FCCCWWWWCCCF..",
    "..FCCWWWWWWCCF..",
    "..FCCWWKKWWCCF..",
    "...FCCWKKWCCF...",
    "...FCSCWWCSCF...",
    "....FSSCCSSF....",
    ".....FSSSSF.....",
    "......FFFF......",
  ],
  "enemy1-a": [
    "................",
    "................",
    "................",
    "......h..h......",
    "..h..KhhCCK..C..",
    "..hK.KCCCCK.KC..",
    "..ChKCWCCWCKCC..",
    "..CCCCWCCWCCCC..",
    "..CCKCCCCCCKCC..",
    "...SKCCCCCCKS...",
    "....KKCCCCKK....",
    "......KSSK......",
    ".......KK.......",
    "................",
    "................",
    "................",
  ],
  "enemy1-b": [
    "................",
    "................",
    "................",
    "......h..h......",
    ".....KhhCCK.....",
    ".....KCCCCK.....",
    "...KKCWCCWCKK...",
    "..hhCCWCCWCCCC..",
    "..CCKCCCCCCKCC..",
    "..CSKCCCCCCKSC..",
    "..CK.KKCCKK.KC..",
    "..S...KSSK...S..",
    ".......KK.......",
    "................",
    "................",
    "................",
  ],
  "dive1": [
    "................",
    "YY............YY",
    "YCY..........YCY",
    ".YCY........YCY.",
    ".YChY.YYYY.YhCY.",
    "..YCCYKhhKYCCY..",
    ".YYCCCKCCKCCCYY.",
    "...YCCKCCKCCY...",
    "..YCCCKCCKCCCY..",
    "...YCKCCCCKCY...",
    "....YKWCCWKY....",
    "....YKWCCWKY....",
    ".....YKCCKY.....",
    "......YSSY......",
    ".......YY.......",
    "................",
  ],
  "enemy2-a": [
    "................",
    "................",
    "................",
    "...h........h...",
    "..KCh......hCK..",
    "..KCCKKKKKKCCK..",
    "..KChhhhCCCCCK..",
    "...KCCCCCCCCK...",
    "...KCKWWWWKCK...",
    "....KCKWWKCK....",
    "....KCCCCCCK....",
    ".....KCCCCK.....",
    ".....KSCCSK.....",
    "......KSSK......",
    ".......KK.......",
    "................",
  ],
  "enemy2-b": [
    "................",
    "................",
    "................",
    "..h..........h..",
    "..KCh......hCK..",
    "..KCCKKKKKKCCK..",
    "..KChhhhCCCCCK..",
    "...KCCCCCCCCK...",
    "...KCKIIIIKCK...",
    "....KCKIIKCK....",
    "....KCCCCCCK....",
    ".....KCCCCK.....",
    ".....KSCCSK.....",
    "......KSSK......",
    ".......KK.......",
    "................",
  ],
  "dive2": [
    "................",
    "..Y..........Y..",
    "..YY........YY..",
    "..YCY......YCY..",
    "...YCY....YCY...",
    "...YCCYYYYCCY...",
    "...YCChhhhCCY...",
    "....YCCCCCCY....",
    "....YKWWWWKY....",
    "....YCKWWKCY....",
    ".....YCCCCY.....",
    ".....YSCCSY.....",
    "......YCCY......",
    "......YSSY......",
    ".......YY.......",
    "................",
  ],
  "pop-1": [
    "................",
    "................",
    "................",
    ".......CC.......",
    "....C......C....",
    ".....Y.hh.Y.....",
    "......hWWh......",
    "...C.hWWWWh.C...",
    "...C.hWWWWh.C...",
    "......hWWh......",
    ".....Y.hh.Y.....",
    "....C......C....",
    ".......CC.......",
    "................",
    "................",
    "................",
  ],
  "pop-2": [
    "................",
    ".....C..........",
    ".......hhh......",
    "....h......h....",
    "...h........h...",
    "...C........C...",
    "..C..........C..",
    "..............C.",
    ".C............C.",
    "..C..........C..",
    "...C..........C.",
    "...C........C...",
    "....C......C....",
    "......CCC.......",
    "..........C.....",
    "................",
  ],
  "pop-3": [
    "................",
    "................",
    "................",
    "......S...C.....",
    "...C.........S..",
    "................",
    "..S.............",
    ".............C..",
    "..C.............",
    ".............S..",
    "................",
    "...S.........C..",
    ".....C...S......",
    "................",
    "................",
    "................",
  ],
  "boom-1": [
    "................",
    "................",
    "................",
    "................",
    ".......YY.......",
    "......YFFY......",
    "....O.FWWF.Y....",
    ".Ch.YFWWWWFO.hC.",
    ".CC.YFWWWWFY.CC.",
    ".S..OYFWWFYO..S.",
    ".....OYFFYO.....",
    "......O..O......",
    "................",
    "................",
    "................",
    "................",
  ],
  "boom-2": [
    "................",
    "..C...h..O...C..",
    ".......OYO......",
    "...O.OOYYOO.....",
    "....OYYFFYOO.O..",
    "..OOYFFWWFYYO...",
    ".OYYFWWWWWFFYO..",
    "..OYFWWWWWWFYOO.",
    ".OYFFWWWWWFFYO..",
    "..OYYFWWWFFYO...",
    "...OOYFFFYYOO...",
    "..O..OYYYOO..O..",
    ".....O.OO.......",
    ".C..........O.h.",
    "..h....R...C....",
    "................",
  ],
  "boom-3": [
    "................",
    ".C..R...R....h..",
    "..O...RQRR......",
    "....RROOYRQ..R..",
    "..RROYYFYORR....",
    ".QROYFQTFYORQ...",
    "..ROYQTTQYOORR..",
    ".RROQTTTTQYOR...",
    "..ROYQTTQFYOR.Q.",
    ".QROYFQQFYORR...",
    "...RROYYYORR....",
    ".R..QRROORQ..R..",
    ".....Q.RR...O...",
    ".h.......Q...C..",
    "...O...T........",
    "................",
  ],
  "boom-4": [
    "................",
    "................",
    ".....T.....Q....",
    "..Q.............",
    ".......Q..T.....",
    "....T.R.........",
    ".........O..T...",
    "..T..Q.T.Q......",
    "......R.Q...Q...",
    "...Q....T.......",
    ".......Q...R....",
    "..S..T......T...",
    "........Q.......",
    ".....T.....C....",
    "................",
    "................",
  ],
  "shot": [
    "WW",
    "WW",
    "FF",
    "FF",
    "YY",
    "YY",
    "OO",
  ],
  "bullet": [
    ".QQ.",
    ".RR.",
    "QRRQ",
    "RIIR",
    "IWWI",
    "IWWI",
    "RIIR",
    ".RR.",
  ],
  "star-far": [
    "e",
  ],
  "star-near": [
    "m",
  ],
  "star-bright": [
    ".Z.",
    "ZWZ",
    ".Z.",
  ],
} as const;

export type SpriteName = keyof typeof SPRITES;

// The Grids board's legend. C, S and h depend on the body color, so they're
// worked out per color in drawSprite.
const PALETTE: Record<string, string> = {
  K: "#1b1b28", // outline
  W: "#f2f0e6",
  X: "#cfe9ff", // canopy glass
  U: "#a8dcff",
  R: "#e8423a",
  Q: "#b3261e",
  T: "#7a1a14",
  I: "#ff8a80",
  Y: "#f2c233", // gold rim on divers
  F: "#ffe680",
  O: "#ffb347",
  Z: "#cfd6ff",
  m: "#b8c0e0",
  e: "#3a3a58",
};

// Every letter a grid may use (for the checks in scripts/world-check.ts).
export const LETTERS = new Set([".", "C", "S", "h", ...Object.keys(PALETTE)]);

// Body colors, also from the board.
export const BODY = {
  you: "#3fbf6a",
  jev: "#4aa8ff",
  enemy: ["#ffb347", "#e8423a", "#b8c0e0"] as const, // Cyclops (row 1), Bat (row 2), Drone (row 3)
};

function mix(hex: string, toward: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount) + toward * amount);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function colorOf(letter: string, body: string): string | null {
  if (letter === ".") return null;
  if (letter === "C") return body;
  if (letter === "S") return mix(body, 0, 0.2); // body + 20% black
  if (letter === "h") return mix(body, 255, 0.35); // body + 35% white
  return PALETTE[letter] ?? null;
}

// Each sprite is painted once per body color into a small canvas and reused.
const cache = new Map<string, HTMLCanvasElement>();
function painted(name: SpriteName, body: string): HTMLCanvasElement {
  const key = `${name}|${body}`;
  let c = cache.get(key);
  if (c) return c;
  const rows = SPRITES[name];
  c = document.createElement("canvas");
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext("2d")!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colorOf(row[x], body);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}

// Draws a sprite centred on (cx, cy) in playfield pixels, snapped to whole pixels.
export function drawSprite(ctx: CanvasRenderingContext2D, name: SpriteName, cx: number, cy: number, body = "#ffffff") {
  const img = painted(name, body);
  ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(cy - img.height / 2));
}
