---
doc: spec
status: approved
---

# Jeviga: Technical Spec

*(Replaces the Go Frog Go spec on 2026-09-26. The stack, the real-time engine, the Jev and Nemotron connections, keyboard play, outage handling and the design-canvas panel carry over; the game world, what Jev reads, and the coach's job change. The frog-game spec is in git history.)*

## How This Works, In Plain Language
There are three pieces.

1. **The page.** A Next.js page runs the fight on a canvas and draws the panel. A physics timer moves everything every frame: the formation drifts, divers swoop, bullets fall, your shots climb. The ship moves the instant someone decides.
2. **Jev, the fast brain (System 1).** About four times a second the page describes the fight in plain sentences ("column 3: bullet in 0.4 s; column 4: nothing for 2+ s; enemy above column 4, your shot reaches it in 0.8 s") and asks Jev, through our `/api/move` route, which of four moves to make: left, right, stay, fire. Jev's current plan goes along as its instructions. The fight keeps moving while Jev thinks; its move lands when the answer does.
3. **Nemotron, the strategist (System 2).** Every three seconds the page sends the whole fight to `/api/plan`. NVIDIA Nemotron 3.5 Lightning on Nebius Token Factory reads it and writes a plan of one or two sentences ("The diver on the left is the threat: slide right and stay clear, then fire at it when it's above you"). That plan becomes Jev's instructions from the next question on.

API keys live only on the server routes. Runs live in the page's memory and reset on reload.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

1. Page opens (optionally `?seed=1234`) → `components/Game.tsx` builds the world from the seed; the canvas draws the formation and the ship.
2. Start (Jev mode) → a health-check question to Jev (three tries); then `startRun` begins the physics timer, `driveWithJev` begins asking Jev, and `drivePlanner` begins asking Nemotron every 3 s.
3. Each Jev question → `describeFight()` + `describeMoves()` → `POST /api/move` → Jev via the gateway → `{ move, probabilities, confidence }` → the ship moves or fires the moment it lands → the JEV window updates.
4. Each plan → `describeFight()` plus score, wave and the last few moves → `POST /api/plan` → Nemotron → `{ plan }` → the NEMOTRON window updates, and the next Jev question carries the new plan.
5. A bullet or diver touches the ship → the run ends → HIT banner, the run joins RUNS, and after 1.5 s a new run starts (same seed).
6. You mode → keys call `run.act(move)` directly; no models are called.

## Stack
Unchanged: Next.js 16 (App Router), TypeScript, pnpm, HTML canvas with sprites defined in code, plain `fetch` to both model APIs, Vercel for deployment, Pixelify Sans and Jersey 20 via `next/font/google`.

## Where It Runs and How Someone Tries It
Unchanged: `pnpm dev`, open http://localhost:3000 (`?seed=N` optional), keys in `.env.local` (`AI_GATEWAY_API_KEY` on the Strawberry Digital team's paid gateway tier, `NEBIUS_API_KEY`). The demo video is narrated and under 3 minutes; the deployed URL on the Strawberry Digital team stays up through Nebius judging (Dec 1–15); the repo is public with MIT or Apache-2.0.

## Look and Feel
- **Panel:** exactly `design-handoff.md`: RPG windows (Jev blue, Nemotron purple, you green, neutral), Pixelify Sans and Jersey 20, gold for the chosen move and best run, banded navy page, meters, switch, buttons, chips, HUD tags, HIT banner.
- **Playfield:** 9 columns × 14 rows of 16 px, drawn at 4×, `image-rendering: pixelated`, same frame as the handoff. Dark starfield background. Sprites (ship, 2–3 enemy types, diver, shot, enemy bullet, explosion) as character grids in `lib/game/sprites.ts` with outline and bottom-row shading, in the handoff's style. Derived by the build from the handoff palette and style (Matt's call).

## Components

### The fight
`lib/game/world.ts`. PRD ref: `prd.md > The fight`.
- **Field:** 9 columns (x, 0–9) × 14 rows (y, 0 at the top). Time `t` in seconds. Seeded random from `lib/game/rng.ts`.
- **Ship:** bottom row (y = 13), whole-column position; `left`/`right` move one column instantly (the canvas animates the slide), `stay` does nothing, `fire` launches a shot if the gun is ready. Reload 0.35 s, at most 3 shots on screen. Shots climb 12 rows/s.
- **Formation:** 3 rows × 7 enemies (rows 1–3, columns 1–7), drifting side to side by up to one column (`sin(0.6 t)`).
- **Formation fire:** every 1.2 s a random formation enemy drops a bullet.
- **Dives:** every 3 s (10% faster each new wave, floor 1.5 s) one formation enemy dives: down at 3.5 rows/s, steering toward the ship's column at up to 2 columns/s, firing at rows 5 and 8. A diver that passes the bottom returns to its slot.
- **Bullets:** fall straight down their column at 7 rows/s.
- **Hits:** a shot destroys an enemy within half a column and half a row (100 points, diver 200). A bullet in the ship's column within half a row of it, or a diver within 0.6 of it, ends the run. Checked every 20 ms physics step.
- **Waves:** a cleared formation brings a new one.
- **Prediction:** `threatAt(world, col, horizon = 2.5)` simulates forward with the ship held in `col` and returns when it would first be hit, or null. `shotTime(world, col)` returns when a shot fired now from `col` would reach the lowest enemy above it.

### Describing the fight to Jev
`lib/describe.ts`. PRD ref: `prd.md > Jev flies (System 1)`.
- Prose, facts only, never a verdict. Times in seconds from the moment of asking.
- `describeFight(world)`: your column; gun ready or reloading; for your column and the ones beside it, when something reaches your row ("bullet in 0.4 s", "diver in 1.1 s", "nothing for 2.5+ s"); each diver's column, height and direction; the lowest enemy above your column and when a shot would reach it; how many enemies are left and where the formation is drifting.
- `describeMoves(world)`: left / right / stay give the threat timing for the column you'd end up in; fire says whether the gun is ready and what the shot would reach.
- The same words go to Nemotron, so plans line up with what Jev reads.

### Jev flies (System 1)
`lib/system1/*`, `app/api/move/route.ts`. PRD ref: `prd.md > Jev flies (System 1)`.
- Carried over: the swappable interface, Jev through the gateway's TypeSafe route, the offline fake (SIMULATED), the exact-repeat cache, response validation. Moves become `left | right | stay | fire`.
- Instructions: "Fly the ship in a space shooter. Stay alive first, then score. Your coach's plan: <plan>".
- `driveWithJev` (carried over): at most 4 questions a second; the move applies when the answer lands; errors or 2.5 s without an answer pause the fight and retry every 3 s.

### Nemotron plans (System 2)
`lib/system2/planner.ts`, `app/api/plan/route.ts`. PRD ref: `prd.md > Nemotron plans (System 2)`.
- Every 3 s during a Jev run: Nemotron 3.5 Lightning on Token Factory, thinking off, `max_tokens` 200, 8 s timeout.
- Input: `describeFight()`, score, wave, seconds survived, the last 8 moves Jev made, the current plan.
- Output format: `Plan: <one or two sentences, 40 words or fewer>`, using the game's words (columns, "diver", "bullet in 0.4 s", left/right/stay/fire). Parsed tolerantly; `</think>` stripped.
- The first run starts with a fixed plan: "Dodge anything about to reach your column; otherwise line up under an enemy and fire."
- If a plan call fails or is late, Jev keeps the last plan and the window marks it stale. The fight never waits for Nemotron.

### Panel and playfield
`components/*`, `lib/game/render.ts`, `lib/game/sprites.ts`. PRD ref: `prd.md > Screens and Layout`, `prd.md > Look and Feel`.
- Windows per `design-handoff.md`: Who plays switch; JEV (move, confidence, four probability bars, ms); NEMOTRON (plan, "3 s ago", stale marker); YOU (last key, legend); RUNS (who, score, best in gold); Controls; outage chip.
- Canvas: starfield, formation, divers, bullets, shots, ship slide animation, explosion on hit, HUD score and YOU/JEV tag.

## Data Model
All in page memory.
```ts
type Move = "left" | "right" | "stay" | "fire";
type Enemy = { id: number; slot: { col: number; row: number }; kind: 0 | 1 | 2; alive: boolean;
               diving: null | { x: number; y: number; fired: number } };
type Bullet = { col: number; y: number };       // enemy bullet, falls
type Shot = { col: number; y: number };         // player shot, climbs
type World = { seed: number; t: number; ship: { col: number; reloadUntil: number }; enemies: Enemy[];
               bullets: Bullet[]; shots: Shot[]; score: number; wave: number; nextDive: number;
               nextVolley: number; alive: boolean; rng: () => number };
type Run = { n: number; who: "jev" | "you"; score: number; seconds: number };
```

## File Structure
```
app/
  page.tsx                 # client-only Game
  api/move/route.ts        # POST → Jev (System 1)
  api/plan/route.ts        # POST → Nemotron plan (System 2)   [replaces api/lesson]
components/
  Game.tsx                 # runs, modes, keyboard, plan loop
  GameCanvas.tsx           # draws every frame, slide + explosion animation
  Panel.tsx                # windows per design-handoff.md
lib/
  game/world.ts            # the shooter: formation, dives, bullets, shots, hits, prediction
  game/rng.ts              # seeded random
  game/loop.ts             # startRun (physics timer), driveWithJev, drivePlanner
  game/render.ts           # playfield drawing
  game/sprites.ts          # ship, enemies, diver, shot, bullet, explosion
  describe.ts              # fight → prose for Jev and Nemotron
  system1/{types,jev,fake,cache,index}.ts
  system2/planner.ts       # Nemotron plan writer            [replaces nemotron.ts lessons]
scripts/
  world-check.ts           # shooter rules
  plan-test.ts             # does a plan change Jev's move?   [replaces lesson-test]
  sim.ts                   # headless runs with real models
```
Retired: `app/api/lesson`, `lib/game/coachMemory.ts`, the frog world, road descriptions and the lesson test (in git history).

## External Services and Dependencies
Unchanged: Jev at `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone` (paid tier, ~250 ms median, ~4/s tested clean), Nemotron at `POST https://api.tokenfactory.nebius.com/v1/chat/completions` (`nvidia/Nemotron-3_5-Lightning`, `chat_template_kwargs.enable_thinking: false`). Cost: Jev ~$0.00002 per decision; a plan ~$0.0002. A 60-second run is ~240 Jev calls and ~20 plans, about 1 cent.

## Important Failure Modes
- **Jev unavailable** → the fight doesn't start, or pauses mid-run with the chip (carried over).
- **Nemotron unavailable or slow** → Jev flies on the last plan; the window says "stale".
- **Jev spams fire or never moves** → caught by the plan test and by watching probabilities; the plan and descriptions are tuned before the look is built.

## What Was Simplified and Why
- **Column-aligned ship and bullets.** The ship moves a whole column per move and bullets fall straight down their column, so "column 4: bullet in 0.4 s" is exact. Divers move freely.
- **One hit ends a run.** No lives yet.
- **Plans every 3 s, not on events.** Simple and steady; event-triggered plans are a later option.
- **Same seed per session.** The formation and dive order repeat, so runs are comparable.

## Decisions and Open Issues
**Matt's decisions:** switch to a Galaga-style shooter (2026-09-26); name Jeviga; Nemotron as a live strategist; real time and keyboard play carried over; design-canvas panel carried over.

**Useful unknown, carried from the frog game:** how does a written plan change Jev's move? Answered for rules in the frog game (one rule moved "wait" from 0.19 to 0.93). For Jeviga, build step 1 checks the same thing for plans with `scripts/plan-test.ts`: in a frozen fight where a bullet reaches your column in 0.3 s with an enemy above, does "dodge first" make Jev move and "keep firing" make it fire?

**Open:** whether to rename the `GoFrogGo` folder and repo to `Jeviga`.
