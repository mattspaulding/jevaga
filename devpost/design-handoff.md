---
doc: design-handoff
status: approved
---

# Go Frog Go: Design Handoff for Slice 4

Settled with Matt on the design canvas ("Go Frog Go — Play & Jev mode") on 2026-09-26. This file is the source of truth for the look: every value below was read off the canvas, and the sprite grids were extracted from it pixel for pixel. Build from this, not from a screenshot. If a PNG reference helps, export the boards from the canvas (Share › Export) into `devpost/design/`.

**Decision:** 16-bit SNES-era stays (an N64 low-poly look was considered and dropped: more work than slice 4 has room for, and it blurs the lanes the video needs to read). The panel becomes 16-bit RPG-style windows. The game view is the style-B pixel art already in `spec.md`.

## The surface

One page, 1280 wide on desktop. Game on the left, "inside its head" panel on the right.

- Game: the 144×192 canvas drawn at 4× (576×768), `image-rendering: pixelated`, framed by a 3px `#f2f0e6` border, a 2px `#0c1030` ring outside it and a hard shadow `5px 5px 0 #08080f`.
- Panel: 480px wide, 32px gap from the game, windows stacked with 14px gaps.
- Page background: six hard bands, top to bottom `#202a4c #1c2442 #181f38 #14192e #111424 #0e101a` (base `#10121c`). Not a smooth gradient.

**Who plays** is a switch at the top of the panel. The panel below it swaps: You mode shows the YOU window, RUNS and a one-line "JEV'S PLAYBOOK · N RULES" strip ("Only Jev's runs add rules. Switch to Jev to keep teaching." with a READ IT link); Jev mode shows JEV, NEMOTRON, PLAYBOOK, RUNS. Controls sit at the bottom in both.

**Color means the player, everywhere:** You = frog green, Jev = blue, Nemotron = purple. Gold marks "the one to look at": the chosen move, the best run, the lit key, the menu cursor.

## Palette

Game (unchanged from `spec.md`): grass `#5fbf3f` with texture pixels `#4fa935`; asphalt `#4a4a58`; curb line `#3a3a46`; lane dashes `#f7e27a`; outline `#1b1b28`; frog `#3fbf6a`, belly `#c8f07a`, bottom shade `#2f9a52`, eye white `#f2f0e6`; cars `#e8423a #3b6fe0 #f2c233 #9b4de0`, glass `#cfe9ff`, headlight `#f7e27a`, tail light `#7a1a14`, bottom shade = 20% black over the body color; tree canopy `#2f7d3a`, highlight `#4fa955`, canopy shade `#26642e`, trunk `#8a5a2b`, trunk shade `#6e4822`; splat `#e8423a` with core `#b3261e`.

Panel tokens for `app/globals.css`:

```css
:root {
  --ink: #f2f0e6;        /* text, window frames */
  --muted: #b8c0e0;      /* secondary text */
  --ground: #0c1030;     /* HUD boxes, meter troughs, inner ring */
  --shadow: #08080f;     /* hard drop shadows */
  --gold: #ffe680;       /* chosen move, best run, cursor, lit key */
  --jev: #4aa8ff;        /* meter fill */
  --jev-hi: #a8dcff;     /* Jev heading, JEV label, meter highlight */
  --coach-hi: #e0b0ff;   /* Nemotron heading, fresh-rule band */
  --you-hi: #9df29d;     /* YOU label */
  --hit: #ff8a80;        /* HIT banner text; border #e8423a */
  --warn: #f2c233;       /* outage chip border; chip text is --gold */
  /* window fills: four equal hard bands, top to bottom */
  --win-jev:     linear-gradient(#2e48b0 0 25%, #2640a0 25% 50%, #1e3488 50% 75%, #182a70 75%);
  --win-coach:   linear-gradient(#5a2c8c 0 25%, #4c2478 25% 50%, #3e1c64 50% 75%, #321650 75%);
  --win-you:     linear-gradient(#2e8a4c 0 25%, #27793f 25% 50%, #206834 50% 75%, #1a582b 75%);
  --win-neutral: linear-gradient(#3a3a58 0 25%, #323250 25% 50%, #2a2a46 50% 75%, #24243c 75%);
  --btn:         linear-gradient(#2a2a46 0 50%, #1e1e34 50%);
  --btn-go:      linear-gradient(#2e8a4c 0 50%, #1e6438 50%);
}
```

Muted text on the tinted windows: `#d8c8f0` on purple, `#d8f5d8` / `#c8f7c8` on green, `--muted` elsewhere.

## Type

Two Google Fonts through `next/font/google`:

- **Pixelify Sans** (variable, 400–700): every piece of panel text. Headings 13px/700, letter-spacing 0.06em, uppercase. Body and lessons 17px/400, line-height 1.3. Secondary lines 14–15px. The chosen move 26px/700. Buttons and the switch 15–16px/700, letter-spacing 0.04–0.06em.
- **Jersey 20**: numbers only. Confidence 24px, ms 20px, probability values 18px, playbook numbers 20px, run distances 22px, run numbers ("#3") 20px, the HUD distance 26px.
- Title "GO FROG GO": Pixelify Sans 34px/700, letter-spacing 0.04em, filled with three hard bands of gold (`#fff6b8` 0–38%, `#f2c233` 38–66%, `#d9861b` 66–100%, via `background-clip: text`) and `filter: drop-shadow(3px 3px 0 #08080f)`. Tagline under it, 14px muted: "An endless road. Play it yourself, or hand the frog to Jev and watch Nemotron teach it."
- All panel text carries `text-shadow: 1px 1px 0 #0c1030` (`#08080f` outside windows). Text on a gold or lilac band has no shadow.

## The window (one recipe, four tints)

```css
.win {
  background: var(--win-neutral);           /* or --win-jev / --win-coach / --win-you */
  border: 3px solid var(--ink);
  border-radius: 4px;
  box-shadow: inset 0 0 0 2px var(--ground), 4px 4px 0 var(--shadow);
  padding: 16px 18px;
  display: flex; flex-direction: column; gap: 8px;   /* 10px in the Jev window */
  text-shadow: 1px 1px 0 var(--ground);
}
.win h2 { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; }   /* color = the tint's -hi token */
```

Fixed heights so outages never shift the layout: JEV window `min-height: 210px`, NEMOTRON `min-height: 100px`.

- **JEV · VIA VERCEL AI GATEWAY** (blue): pick line = move in gold 26px, confidence in Jersey 20 24px, "380 MS" right-aligned muted. Confidence meter 14px tall. Five probability rows: label 15px (chosen row gold/700, others ink/500, label column 70px), 9px meter, value in Jersey 20 18px right-aligned in 36px (muted unless chosen). Last line 14px muted: "The road kept moving for 380 ms while Jev thought." Between runs the whole window sits at `opacity: 0.75` and the last line reads "Last pick of run 4. Wait was close."
- **NEMOTRON · NEBIUS TOKEN FACTORY** (purple): idle "Watching. Teaches after each run." (17px, `#d8c8f0`); thinking "thinking…" pulsing in `--coach-hi`; failed "Couldn't write a lesson this time." in gold plus "Playbook unchanged. Run N starts in 1.5 s.". The coach makes one change per run (`lesson.change` is "Added rule N.", "Replaced rule N." or "Removed rule N."): show a tag at the top right, then "What happened: …" 15px `#d8c8f0`, then the change at 17px ink with the rule's text appended when one was added or replaced ("Added rule 4: If a car in lane +1 …"). Tags: NEW RULE and RULE CHANGED are gold fill with `#1b1b28` text; RULE REMOVED, TOOK BACK (rollback: "That made it worse: row 3, down from row 11." / "Took back the new rule. Back to the playbook from run 4.") and ONE MORE RUN (second chance: "Row 4, well short of the best (row 11)." / "Same playbook once more before judging the new rule.") are `--ground` fill with a colored border and text: `#e8423a`/`--hit` for the two take-backs, `--coach-hi` for the second chance. All tags 12px/700, 2px border, 2px hard shadow.
- **PLAYBOOK · N RULES** (neutral): rows are a Jersey 20 number in gold (24px column) plus the rule at 17px. The playbook starts as "Jump forward." and, once the coach has spoken, holds up to 4 learned rules with "Otherwise, jump forward." always last, drawn in `--muted` so the learned rules stand out. Every rule that was not in the previous playbook (an add or a replace) flashes for 1 s as a band: fill `--coach-hi`, text `#1b1b28` 700, number `#4c2478`, 2px ink border, `margin: 0 -8px; padding: 5px 8px`, no text shadow; then settles to a normal row. After a rollback nothing flashes; the coach's TOOK BACK tag carries the news.
- **RUNS** (neutral): "#n" Jersey 20 20px muted (30px column), who-label 14px/700 letter-spacing 0.06em (JEV in `--jev-hi`, YOU in `--you-hi`, 40px column), distance Jersey 20 22px; the best run's distance is gold with a small gold star; a stall adds "TIMEOUT · 9 S WITHOUT PROGRESS" 12px muted; the run in progress shows "in progress" pulsing. Under the list: "seed 4271 · the same road every run" 14px muted. During the pause between Jev's runs: "Run 5 starts in 1.5 s, same road, one rule added." (or "… one rule replaced.", "… one rule removed.", "… same playbook." after a second chance, "… playbook from run 4." after a rollback) pulsing in `--coach-hi`; a second chance pauses twice as long, as the code does.
- **YOU · ARROW KEYS OR WASD** (green): a 3×2 keypad legend (146px wide, 6px gaps, keys 40px tall: `--ground` fill, 2px `--muted` border, 2px hard shadow, pixel arrow in `--muted`; the last-pressed key is gold-filled with a dark arrow), beside it the last hop in gold 26px ("FORWARD") and "last hop · 0.4 s ago" 14px. Line under: "The frog hops the instant you press. Cars keep moving either way. No key means the frog waits."

## Meters

Trough: `background: var(--ground); border: 1px solid var(--ink)`. Fill: `background: var(--jev); box-shadow: inset 0 4px 0 var(--jev-hi)` (inset 3px on the 9px rows). Square ends, no rounding.

## Switch, buttons, chips, HUD

- **Switch:** two tabs with a 10px gap, 44px tall, `padding: 0 16px`, 15px/700. Active tab: two-band fill of its player's color (`#2e48b0`/`#1e3488` for Jev, `#2e8a4c`/`#1e6438` for You), ink border, inset ring, 3px hard shadow, and a blinking gold triangle cursor (8×12, `steps(1)` at 1.1 s) before the label. Inactive: `--btn` fill, `--muted` border and text. Locked during a run: whole switch at `opacity: 0.5`. Labels "JEV PLAYS" / "YOU PLAY". Design note for the code: switching mid-run should end the current run and hand over, rather than staying locked.
- **Buttons:** 46px tall, `padding: 0 22px`, 16px/700, `--btn` fill, 3px ink border, radius 4px, inset ring plus `3px 3px 0 var(--shadow)`. START, when enabled, uses `--btn-go`. Disabled: `opacity: 0.45`, no drop shadow.
- **Status chip** beside the title: `--ground` fill, 2px `--warn` border, gold 12px/700 text, 2px hard shadow: "JEV UNAVAILABLE · RETRYING" mid-run, "JEV UNAVAILABLE" before start. SIMULATED badge in the Jev window: gold fill, dark text, same border and shadow.
- **HUD on the game** (`GameCanvas`): top-left "DISTANCE" 14px/700 with the number in Jersey 20 26px gold, in a `--ground` box with a 2px ink border and 2px hard shadow; top-right a matching who-tag, "YOU" in `--you-hi` or "JEV" in `--jev-hi`. On a hit, a centred banner "HIT · RUN 4 OVER": `--ground` fill, 3px `#e8423a` border, 24px/700 `--hit` text, 4px hard shadow, shown through the coach pause.

## Copy that changed from the current build

Headings are uppercase with middle dots: "JEV · VIA VERCEL AI GATEWAY", "NEMOTRON · NEBIUS TOKEN FACTORY", "PLAYBOOK · 4 RULES", "RUNS", "YOU · ARROW KEYS OR WASD", "JEV'S PLAYBOOK · 4 RULES". Moves are shown uppercase in the pick line ("FORWARD") and lowercase in the probability rows. Before Start, the Jev window says "Press Start. Jev picks every hop: forward, left, right, back or wait, with a confidence you can watch." and, muted, "It starts knowing one thing: jump forward. Run 1 will not go well."; RUNS shows "#1  not started".

## Sprites (extracted from the canvas)

16 rows each; cars are 16 or 32 wide. Legend: `.` transparent · `K` outline `#1b1b28` · `W` `#f2f0e6` · `G` frog `#3fbf6a` · `L` belly `#c8f07a` · `D` `#2f9a52` · `C` the car's body color · `S` 20% black over the body color · `X` glass `#cfe9ff` · `H` headlight `#f7e27a` · `T` tail light `#7a1a14` · `A` canopy `#2f7d3a` · `B` `#4fa955` · `E` `#26642e` · `N` trunk `#8a5a2b` · `M` `#6e4822` · `R` splat `#e8423a` · `Q` `#b3261e` · `g` grass `#5fbf3f` · `t` `#4fa935`.

Drawing rules: cars occupy sprite rows 3–13 of their lane (today's `y + 3 … y + 13`); the head is on the right for `car-r` / `car2-r` and on the left for the `-l` variants; a car crossing the right edge is drawn again 144 px to the left, as now. Colors cycle `(rowIndex + carIndex) % 4` as today. The grass tile repeats every 16 px. A road run gets a 1px `#3a3a46` curb on its top and bottom edge and a 1px dash line (4 on, 4 off, `#f7e27a`) on each boundary between two road lanes. Trees sit on grass rows only, 2–3 per row, mostly at the edges, never on column 4 of row 0; pick them from the row's rng so they replay. On a hit the splat replaces the frog and cars keep drawing over it.

frog (16×16)
```
................
..KKKK....KKKK..
..KWKK....KWKK..
..KWWK....KWWK..
..KKKKKKKKKKKK..
..KGGGGGGGGGGK..
..KGGGGGGGGGGK..
..KGGGGGGGGGGK..
KKKGGLLLLLLGGKKK
KGKGGLLLLLLGGKGK
KGKGGLLLLLLGGKGK
KGKGGLLLLLLGGKGK
KGKGGGGGGGGGGKGK
KKKDDDDDDDDDDKKK
.KGGKKKKKKKKGGK.
.KKKK......KKKK.
```

car-r (16×16, moving right)
```
................
................
................
...KKK....KKK...
.KKKKKKKKKKKKKK.
.KCCCCKKKKKCCCK.
.KTCCCKXXXKCCHK.
.KCCCCKXXXKCCCK.
.KCCCCKXXXKCCCK.
.KCCCCKXXXKCCCK.
.KTCCCKXXXKCCHK.
.KSSSSSSSSSSSSK.
.KKKKKKKKKKKKKK.
...KKK....KKK...
................
................
```

car-l (16×16, moving left)
```
................
................
................
...KKK....KKK...
.KKKKKKKKKKKKKK.
.KCCCKKKKKCCCCK.
.KHCCKXXXKCCCTK.
.KCCCKXXXKCCCCK.
.KCCCKXXXKCCCCK.
.KCCCKXXXKCCCCK.
.KHCCKXXXKCCCTK.
.KSSSSSSSSSSSSK.
.KKKKKKKKKKKKKK.
...KKK....KKK...
................
................
```

car2-r (32×16, length 2, moving right)
```
................................
................................
................................
....KKK..................KKK....
.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.
.KCCCCCCCCCCCCCCCCKKKKKKKCCCCCK.
.KTCCCCCCCCCCCCCCCKXXXXXKCCCCHK.
.KCCCCCCCCCCCCCCCCKXXXXXKCCCCCK.
.KCCCCCCCCCCCCCCCCKXXXXXKCCCCCK.
.KCCCCCCCCCCCCCCCCKXXXXXKCCCCCK.
.KTCCCCCCCCCCCCCCCKXXXXXKCCCCHK.
.KSSSSSSSSSSSSSSSSSSSSSSSSSSSSK.
.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.
....KKK..................KKK....
................................
................................
```

car2-l (32×16, length 2, moving left)
```
................................
................................
................................
....KKK..................KKK....
.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.
.KCCCCCKKKKKKKCCCCCCCCCCCCCCCCK.
.KHCCCCKXXXXXKCCCCCCCCCCCCCCCTK.
.KCCCCCKXXXXXKCCCCCCCCCCCCCCCCK.
.KCCCCCKXXXXXKCCCCCCCCCCCCCCCCK.
.KCCCCCKXXXXXKCCCCCCCCCCCCCCCCK.
.KHCCCCKXXXXXKCCCCCCCCCCCCCCCTK.
.KSSSSSSSSSSSSSSSSSSSSSSSSSSSSK.
.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.
....KKK..................KKK....
................................
................................
```

tree (16×16)
```
....KKKKKKKK....
..KKAAAAAAAAKK..
..KAABBBAAAAAK..
..KAABBBAAAAAK..
..KAAAAAAAAAAK..
..KAAAAAAAAAAK..
..KAAAAAAAAAAK..
..KAAAAAAAAAAK..
..KKEEEEEEEEKK..
....KKKKKKKK....
......KKKK......
......KNNK......
......KNNK......
......KNNK......
......KMMK......
......KKKK......
```

splat (16×16, replaces the frog on a hit)
```
................
....RRR.........
....RRR...RR....
....RRR...RR....
..RRRRRRRRRRRR..
..RRRRRRRRRRRRRR
RRRRRQQQQQQRRRRR
RRRRRQQQQQQRRRRR
RRRRRQQQQQQRRRRR
RRRRRQQQQQQRRR..
..RRRRRRRRRRRR..
..RRRRRRRRRRRRR.
.RRRRRRRRRRRRR..
...RRR...RRRR...
...RRR...RRRR...
.........RRRR...
```

grass tile (16×16, repeats)
```
gggggggggggggggg
gggggggggttggggg
gggggggggggggggg
ggtggggggggggggg
gggggggggggtgggg
gggggggggggggggg
gggggggggggggggg
ggggggggggggtggg
gggggggggggggggg
gggggtgggggggggg
gggggggggggggggg
gggggggggggggggg
ggggggggggggggtg
gggggggttggggggg
gtgggggggggggggg
gggggggggggggggg
```

## What slice 4 touches

- `app/layout.tsx`: load Pixelify Sans and Jersey 20 with `next/font/google`, expose them as `--font-pixel` and `--font-num`.
- `app/globals.css`: the tokens above, the banded page background, `.win` and its tints, meters, switch, buttons, chips, HUD boxes, the fresh-rule band and its 1 s flash.
- `lib/game/sprites.ts`: the grids and legend above, plus a `drawSprite(ctx, grid, x, y, bodyColor)` that maps letters to colors (`S` = body darkened 20%).
- `lib/game/render.ts`: grass tile, curbs, dashes, trees from the row rng, cars via the direction and length variants, frog, splat.
- `components/GameCanvas.tsx`: the DISTANCE box, the who-tag, the HIT banner.
- `components/Panel.tsx`: the windows, uppercase headings, keypad legend in `YouBox`, the "JEV'S PLAYBOOK" strip in You mode, the NEW RULE tag, the between-runs countdown line, run rows, chips.
- `components/Game.tsx`: pass `mode` and the hit state to the HUD; a countdown line during the pause, worded by the coach's verdict (lesson, second chance, rollback).

The canvas was drawn against commit `851cf53`; the coach's rewrite, second-chance and rollback states from `3a9b201` were added to the Panel-states board and to this file afterwards, so both cover the current build.
