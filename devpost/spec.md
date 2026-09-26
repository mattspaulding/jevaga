---
doc: spec
status: approved
---

# Go Frog Go: Technical Spec

## How This Works, In Plain Language
There are three pieces.

1. **The page.** A Next.js page draws the road, the cars and the frog on a canvas, and draws the right-hand panel. It also runs the clock. The world moves in beats: on each beat the frog makes one move, then every car advances. The page waits for the frog's move before advancing the beat, so a slow answer makes the game pause for a moment instead of breaking it.
2. **Jev, the fast brain (System 1).** Each beat, the page describes the situation in plain sentences ("You are on road lane 0, column 4. In your lane, a car reaches your column in 3 beats. In lane +1, a car reaches column 4 this beat.") and sends it to our own server route, `/api/move`. That route asks Jev one `Choice` question: which of five moves? The playbook goes along as Jev's instructions. Jev answers with a move, a probability for each of the five moves, and a confidence. Jev is reached through Vercel AI Gateway, which carries it with no waitlist.
3. **Nemotron, the coach (System 2).** When the frog is hit, or stands still too long, the page sends the last few beats to `/api/lesson`. That route asks NVIDIA Nemotron 3.5 Lightning, hosted on Nebius Token Factory, what went wrong and for one short rule in the same words the page uses to describe the road. The rule is added to the playbook, and the next run starts on the same road.

API keys live only on the server routes. The playbook and run history live in the page's memory and reset on reload.

Why this shape: two hosted APIs and one Next.js app, all in the stack Matt already uses. No GPU, no database, no accounts.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

1. Viewer opens the page (optionally with `?seed=1234`) → `app/page.tsx` renders `GameCanvas` and `Panel`. The playbook in memory is `["Jump forward."]`, run 1. The road is generated from the seed.
2. Viewer presses **Start** → the first `/api/move` call doubles as a health check. If it fails, the Decision box says "Jev unavailable" and the game doesn't start (`prd.md > States and Boundaries`). If it succeeds, the beat loop in `lib/game/loop.ts` begins.
3. Each beat → `lib/describe.ts` turns the world into state sentences plus five move descriptions → `POST /api/move` → `lib/system1/jev.ts` calls Jev through the gateway → the route returns `{ move, probabilities, confidence, source }` → the Decision panel updates → `lib/game/world.ts` applies the move, then advances the cars.
4. A car's body covers the frog's cell → the run ends with cause `hit`. Or the furthest row hasn't grown in 15 beats → the run ends with cause `stalled`. Distance is appended to the run history.
5. The page sends the last 6 beats (state sentences, moves, confidences) and the cause to `POST /api/lesson` → `lib/system2/nemotron.ts` calls Token Factory → it returns a one-sentence "what happened" and a one-sentence rule. The Coach box shows "Nemotron · Nebius Token Factory: thinking…", then what happened, then the rule. The rule is appended to the playbook.
6. After a 1.5-second pause, run N+1 starts on the **same road** (same seed, beat reset to 0), so the viewer watches the frog meet the situation that ended the last run.
7. **Stop** ends the current run. Playbook and history stay until reload.

## Stack
- **Next.js (App Router), TypeScript, current stable release.** Matt's usual stack. Docs: https://nextjs.org/docs
- **HTML canvas** for the game, drawn with plain 2D context calls and pixel-art sprites defined in code. No game engine: the world is a grid and a few sprites, and an engine would add more to learn than it saves.
- **Plain `fetch`** for both model APIs. No SDKs. The TypeSafe JS SDK (`@typesafe-ai/sdk`) exists, but the raw request is short, and plain fetch removes one dependency and one thing that can drift.
- **pnpm** (already installed).
- **`next/font/google`** for Press Start 2P (headings) and a readable body font.
- **Vercel** for deployment.

## Where It Runs and How Someone Tries It
- **Locally:** `pnpm install`, copy `.env.example` to `.env.local` and fill in the keys, `pnpm dev`, open http://localhost:3000, press Start.
- **Keys needed** (Matt creates these himself and pastes them into `.env.local`; they never go in the repo or the chat):
  - `AI_GATEWAY_API_KEY`: from the **Strawberry Digital** Vercel team (Pro), AI Gateway → API Keys. The team's card is verified, which unlocks $5 of gateway credit.
  - `NEBIUS_API_KEY`: from the Nebius Token Factory console. Hackathon credits apply here.
- **Other settings in `.env.local`:**
  - `SYSTEM1=jev`, or `fake` for offline work (the panel then says SIMULATED).
  - `JEV_MODEL=typesafe-ai/jev`
  - `LESSON_MODEL=nvidia/Nemotron-3_5-Lightning`
- **Seed:** `?seed=N` in the URL picks the road; without it, a random seed is chosen and shown in the panel. Before recording, pick a seed where "Jump forward" dies in the first or second road lane.
- **Demo video (both hackathons):** a screen recording of the local app with **narration** (Nebius requires audio), under 3 minutes, public on YouTube. The narration names when Jev is deciding and when Nemotron on Nebius Token Factory is teaching. It shows run 1 dying on "Jump forward" and later runs going farther.
- **Deployed URL:** a Vercel project under the **Strawberry Digital** team (Matt's choice), with the same env vars set in the project dashboard. Basics doesn't require it. Nebius requires a working URL that stays free and usable until judging ends; the rules put judging at Dec 1–15, 2026. With Jev and Nemotron both pay-per-call, keeping it live costs close to nothing.
- **Repo:** public GitHub, with an MIT or Apache-2.0 LICENSE (Nebius accepts Apache 2.0, MIT or MPL 2.0) and a README with setup steps and a plain account of how Jev and Nemotron are each used. `devpost/scope.md`, `prd.md` and `spec.md` are committed (Basics requires them); `learner-profile.md` stays gitignored.

## Look and Feel
From `prd.md > Look and Feel`.
- **Palette** (the style-B sample Matt picked): grass `#5fbf3f` with texture pixels `#4fa935`; asphalt `#4a4a58`; lane dashes `#f7e27a`; outline `#1b1b28`; frog greens `#3fbf6a` and `#c8f07a`; cars `#e8423a`, `#3b6fe0`, `#f2c233`, `#9b4de0`; trees `#2f7d3a` and `#8a5a2b`.
- **Sprites:** 16×16 pixel sprites defined as character grids in `lib/game/sprites.ts`, drawn with a 1-pixel dark outline and the bottom rows shaded 20% darker, as in the sample. Canvas scaled up with `image-rendering: pixelated`.
- **Type:** Press Start 2P for panel headings and numbers; a plain sans for lesson text so it stays readable.
- **Panel:** dark background `#1b1b28`, with the palette as accents: Jev blue for the Decision box, Nemotron purple for the Coach box. Each box names its model ("JEV · via Vercel AI Gateway", "NEMOTRON · Nebius Token Factory"), so the video shows which model is doing what.
- **Density and energy:** arcade. Numbers change every beat, and a new lesson flashes when it lands.

## Components

### Game world
**Rebuilt during `5-build` as a continuous world** (Matt: key presses felt slow and the cars should glide, not step). Time is in seconds; each car has a real position that moves every frame at 1.7 or 3.3 columns per second and wraps; the frog hops instantly and is hit whenever a car overlaps its square (hitbox inset 0.15 of a square each side). A physics timer advances the world in 20 ms steps; the canvas draws every animation frame. Stall = no forward progress for 9 s. Road generation and the solvability check still reason in 0.6 s beats, a conservative stand-in: a road crossable hopping only on beats is crossable hopping any time. The notes below describe the original beat model where they differ.
`lib/game/world.ts`, `lib/game/rng.ts`. PRD ref: `prd.md > Endless road`.
- **Grid:** 9 columns. Rows are numbered from 0 (the starting grass) upward.
- **Generation:** each row comes from `rng(seed, rowIndex)`, so it depends only on the seed and its index. Grass strips are 1–2 rows; road runs are 1–3 lanes. Each road lane has a direction (−1 or +1), a speed (1 or 2 columns per beat), and 1–3 cars of length 1 or 2, with **sum of (length + speed) over the lane's cars ≤ 5**, so at least 4 cells are clear each beat. Rows are kept generated up to `frog.row + 3 + screen height`.
- **Solvability check:** car positions repeat every 9 beats (9 columns; speeds 1 and 2 are both coprime with 9). When a road run is generated, a breadth-first search over `(row, col, beat mod 9)` confirms that at least one path crosses it from the grass below; if none does, the run is regenerated from the next rng value. About 20 lines.
- **Cars:** `col` is the car's head (its front cell in the direction of travel); the body extends behind it. Cars wrap around modulo 9, so a length-2 car at column 8 moving right also covers column 7, and after moving 1 covers 0 and 8. Car positions are computed from their beat-0 positions and `beat`, so resetting `beat` to 0 replays the road exactly.
- **`step(world, move)`**: the frog moves first. Then each car advances by its speed. **Collision:** the frog is hit if its cell after its move is in the set of cells the car covers at the start of the beat, or any cell its body passes through while advancing (`length + speed` cells). A car can't skip over the frog, and the frog can't hop onto a car.
- **Edges:** a sideways move at the grid edge becomes `wait`; `back` from row 0 becomes `wait`.
- **Distance** is the furthest row reached this run. Going back doesn't reduce it.

### Beat loop
**Superseded by the continuous rebuild:** `startRun` runs the physics timer and exposes `hop()`; keys call it directly. `driveWithJev` asks Jev about the board as it is, hops the moment the answer lands (the board has moved on by then), and asks again, at most about 4 times a second. No answer within 2.5 s, or an error, pauses the world and retries every 3 s. The panel shows how long the road kept moving while Jev thought.

*Earlier revision:* **Revised during `5-build` to real time.** `playRun(world, controller, hooks)` ticks every `BEAT_MS` (600 ms). Right after each tick it describes the board and calls `controller.prepare()`; at the next tick it calls `controller.take()`. `jevController` sends the question at prepare time and uses Jev's answer only if it arrived before the tick; a late answer is thrown away and the frog waits (the panel counts "too slow"). An error returns "pause": the clock holds, the chip shows, and the question is re-sent every 3 s. `keyboardController` returns the last key pressed during the beat, or wait. The notes below describe the original turn-based loop.
`lib/game/loop.ts`. PRD ref: `prd.md > The Core Journey`.
- `await getMove()` → `step()` → render → wait until at least 500 ms have passed since the last beat → repeat. The minimum keeps the video watchable and keeps calls under Jev's rate limit (raised from 350 ms at the slice 3 checkpoint). One move request in flight at a time.
- **Jev outages** (added in build): the first move gets three tries a second apart; after that a failure means "Jev unavailable" and the game doesn't start. Mid-run failures pause the loop, show "Jev unavailable, retrying…", and retry every 3 seconds until Jev answers or Stop.
- **Run ends** on `hit`, or `stalled` when the furthest row hasn't grown in 15 beats. A stall is sent to the coach like a death, so it can teach the frog when to go. The run history marks it as a timeout.
- Keeps `currentRunBeats`, the last 6 `BeatLog`s, for the lesson request.

### Describing the road to Jev
`lib/describe.ts`. PRD ref: `prd.md > Fast decisions (System 1)`.
- **Seconds (continuous rebuild).** Facts read "car now, gone at 0.3 s", "car from 0.4 to 0.9 s" or "clear for 3+ s", measured from the moment Jev is asked.
- *Beat model, superseded:* **Time, not distance.** Every car fact is phrased as when it covers a given column: "reaches column 4 this beat", "reaches column 4 in 2 beats", "is moving away". "This beat" means moving there now gets you hit. Time is measured along the car's direction of travel, with wrap-around taken into account, so it's unambiguous.
- `describeState(world)` returns prose, not JSON, covering **every lane on screen** (Matt's call at the slice 3 checkpoint: "give it the whole visible board"): lane 0 first, then every lane ahead to the top of the screen, then the lanes behind. Each road lane gives its direction and speed, where every car is, and when a car reaches the frog's column and the columns either side of it. At row 0 the lane behind is "the edge; you can't go back". About 1,100 characters a beat.
- `describeMoves(world)` returns five neutral move descriptions giving facts about the destination cell, never a verdict:
  - `forward`: "Step into lane +1, column 4. A car there reaches column 4 this beat."
  - `wait`: "Stay in lane 0, column 4. In your lane, a car reaches column 4 in 3 beats."
  - `left` / `right`: the same facts for columns 3 and 5 in lane 0.
  - `back`: the same for lane −1.
- The same vocabulary ("lane +1", "column", "reaches … this beat / in N beats", "moving away") is given to Nemotron, so lessons line up with what Jev reads.

### Fast decisions (System 1)
`lib/system1/types.ts`, `lib/system1/jev.ts`, `lib/system1/fake.ts`, `lib/system1/index.ts`, `app/api/move/route.ts`. PRD ref: `prd.md > Fast decisions (System 1)`.
- `types.ts` defines the swappable interface: `decide({ state, moves, playbook }) → { move, probabilities, confidence, source }`.
- `jev.ts` calls `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone` with `Authorization: Bearer AI_GATEWAY_API_KEY`:
  ```json
  { "model": "typesafe-ai/jev",
    "state": "<describeState>",
    "questions": { "move": { "type": "choice",
      "instructions": "Pick the frog's next move in a road-crossing game. Follow the playbook.\nPlaybook:\n1. Jump forward.\n2. ...",
      "criteria": { "forward": "...", "left": "...", "right": "...", "back": "...", "wait": "..." } } } }
  ```
  The answer is read from `answers.move.choice`, `.probabilities` (a map over all five moves) and `.confidence`. On an error response, the route logs `error_type` from the body.
- `fake.ts` returns the same shape from simple code. It picks `forward` unless the playbook contains a rule with the word "wait" and the forward description says "this beat". `source: "simulated"` makes the panel show SIMULATED. It's for offline work only; never recorded or submitted.
- `index.ts` chooses the implementation from `SYSTEM1`. Jev is wrapped in `cache.ts`, which reuses Jev's answer for an exact repeat of state, moves and playbook (replays of a road, Stop/Start, visitors on the same seed). It saves the call, not the decision.
- The route validates the response. A missing answer, or a move outside the five, is an error; the route never guesses.

### Coach lessons (System 2)
`lib/system2/nemotron.ts`, `app/api/lesson/route.ts`. PRD ref: `prd.md > Coach lessons (System 2)`.
- `POST https://api.tokenfactory.nebius.com/v1/chat/completions`, `Authorization: Bearer NEBIUS_API_KEY`, model `LESSON_MODEL`, `max_tokens: 400`, `temperature: 0.3`, and `"chat_template_kwargs": {"enable_thinking": false}` at the top level of the body. Nemotron 3.5 Lightning thinks by default, and its thinking shares the `max_tokens` budget; `reasoning_effort` isn't a documented switch for it.
- The system prompt explains the vocabulary and the collision rule and asks for exactly two lines:
  `What happened: <one sentence>`
  `Rule: <one rule, 20 words or fewer, in the game's vocabulary, that would have prevented this and doesn't repeat an existing rule>`
  The user message holds the current playbook, the last 6 beats and the cause (`hit` or `stalled`).
- **Hindsight from the replay** (added in build): each beat log also carries all five move descriptions and the moves that would have survived that beat and the next. The coach is shown the five options at the fatal beat and which moves would have kept the frog alive; if the frog was already trapped, it is pointed at the latest earlier beat where a safe move existed. A rule whose move would not have saved the frog, or that repeats an existing rule (same lanes, timing and move), is sent back once; a second miss counts as a failed lesson. "Back" is only offered when it was the only way out. The coach still only writes words; Jev has to follow them.
- Plain-text reply; no JSON mode, since none of the Nemotron models on Token Factory is tagged for it. **Parsing:** if `finish_reason` is `"length"` and the content is empty, the lesson failed. Otherwise strip everything up to and including a last `</think>` if present, ignore any `reasoning`/`reasoning_content` fields, and read the `What happened:` and `Rule:` lines. The rule is capped at 140 characters.

### Panel
`components/Panel.tsx` and its parts: `DecisionBox`, `CoachBox`, `Playbook`, `RunHistory`, `Controls`. PRD ref: `prd.md > Screens and Layout`, `prd.md > Run history`, `prd.md > States and Boundaries`.
- **Decision** ("JEV · via Vercel AI Gateway"): the move, a confidence bar, and five small bars for the probabilities. SIMULATED badge when `source` is `"simulated"`. Fixed height; keeps the last move shown during an outage.
- **Status chip** next to the GO FROG GO title: "Jev unavailable · retrying" or "Jev unavailable", so outages never shift the layout (Matt's request).
- **Coach** ("NEMOTRON · Nebius Token Factory"): idle; "thinking…"; then "What happened: …" and the new rule; or "couldn't write a lesson this time."
- **Playbook:** numbered, newest flashes for 1 second.
- **Runs:** number and distance per run, a timeout marker on stalls, best one starred. The seed is shown under the list.

### Game canvas
`components/GameCanvas.tsx`, `lib/game/render.ts`, `lib/game/sprites.ts`. PRD ref: `prd.md > Look and Feel`, `prd.md > Endless road`.
- The camera follows the frog upward. Distance counter in the corner. A hit shows a short splat.

## Data Model
All of it lives in the page's memory (React state, plus refs in the loop). Nothing is saved, and a reload starts over (`prd.md > States and Boundaries`).

```ts
type Move = "forward" | "left" | "right" | "back" | "wait";
type Car = { head: number; len: 1 | 2 };                       // head column at beat 0
type Lane = { kind: "grass" } | { kind: "road"; dir: -1 | 1; speed: 1 | 2; cars: Car[] };
type World = { seed: number; rows: Lane[]; frog: { row: number; col: number }; beat: number; furthest: number; sinceProgress: number; alive: boolean };
type Decision = { move: Move; probabilities: Record<Move, number>; confidence: number; source: "jev" | "simulated" };
type BeatLog = { state: string; move: Move; confidence: number };
type RunEnd = { cause: "hit" | "stalled"; distance: number };
type Lesson = { whatHappened: string; rule: string };
type Session = { seed: number; playbook: string[]; runs: (RunEnd & { n: number })[]; currentRunBeats: BeatLog[] };
```
The playbook starts as `["Jump forward."]`. The seed comes from `?seed=` or is chosen once per page load, and is reused for every run in that session.

## File Structure
```
./
├── app/
│   ├── layout.tsx            # fonts, page shell
│   ├── page.tsx              # split layout: GameCanvas left, Panel right; owns Session state
│   ├── globals.css           # palette tokens, pixelated canvas
│   └── api/
│       ├── move/route.ts     # POST: state + moves + playbook → Decision (System 1)
│       └── lesson/route.ts   # POST: last beats + cause → Lesson (System 2)
├── components/
│   ├── GameCanvas.tsx        # canvas element + render calls
│   └── Panel.tsx             # DecisionBox, CoachBox, Playbook, RunHistory, Controls
├── lib/
│   ├── game/
│   │   ├── world.ts          # grid, lane generation, solvability check, step(), collision
│   │   ├── rng.ts            # seeded random generator: rng(seed, rowIndex)
│   │   ├── loop.ts           # beat loop, run end (hit / stalled), last-6-beats buffer
│   │   ├── render.ts         # draws lanes, cars, frog, splat
│   │   └── sprites.ts        # 16×16 pixel sprites as character grids
│   ├── describe.ts           # world → state prose + five move descriptions (time-based)
│   ├── system1/
│   │   ├── types.ts          # the swappable System 1 interface
│   │   ├── jev.ts            # Jev via Vercel AI Gateway
│   │   ├── fake.ts           # offline stand-in, labeled SIMULATED
│   │   └── index.ts          # picks one from SYSTEM1
│   └── system2/
│       └── nemotron.ts       # lesson writer via Nebius Token Factory
├── scripts/
│   ├── lesson-test.ts        # build step 1: does a lesson change Jev's move?
│   ├── world-check.ts        # game-rule assertions
│   └── sim.ts                # headless runs with real Jev and Nemotron: pnpm sim -- <seed> <runs>
├── .env.example              # names of every env var, no values
├── README.md                 # what it is, setup, how to run, how each model is used
├── LICENSE                   # MIT or Apache-2.0
└── devpost/                  # planning docs (learner-profile.md gitignored)
```

## External Services and Dependencies

### Jev via Vercel AI Gateway
- `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`, `Authorization: Bearer $AI_GATEWAY_API_KEY`, `"model": "typesafe-ai/jev"`. Vercel documents this TypeSafe-compatible route: https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe. Choice format: https://docs.typesafe.ai/primitives/choice (option descriptions affect accuracy, which is why the move descriptions carry the facts).
- $0.042 per million input tokens; output is free. A beat is about 300 tokens, so 1,000 beats cost about $0.013. Covered by the $5 gateway credit.
- Limit: 32,000 tokens for the state plus the longest question (gateway model listing, https://ai-gateway.vercel.sh/v1/models).
- **Watch:** the gateway's single provider for Jev showed about 53% uptime over the 24 hours to 2026-09-25 (100% in the last hour).

### Nemotron via Nebius Token Factory
- `POST https://api.tokenfactory.nebius.com/v1/chat/completions`, `Authorization: Bearer $NEBIUS_API_KEY`, OpenAI-compatible, plus `chat_template_kwargs` as above.
- Model `nvidia/Nemotron-3_5-Lightning`: $0.06 in / $0.24 out per million tokens, about 314 tokens/s listed, hosted in eu-north1. About $0.0001 per lesson.
- Example baseline rate limit in the docs: 60 requests/minute. Lessons are one per run, far below that.
- Docs: https://docs.tokenfactory.nebius.com/ ; catalog: https://tokenfactory.nebius.com/api/public/models_info

## Important Failure Modes
- **Jev unreachable or erroring** → before Start, the game doesn't start and the Decision box says "Jev unavailable". Mid-run, the beat loop pauses, the box says "Jev unavailable, retrying", and it retries every 3 seconds. The fake never takes over silently.
- **Lesson call fails, times out after 15 s, runs out of tokens, or returns nothing usable** → the Coach box says "couldn't write a lesson this time", and the next run starts with the playbook unchanged.
- **The frog stops dying and stops moving** (a lesson makes it wait forever) → the 15-beat stall rule ends the run and asks the coach for a rule about when to go.
- **Jev ignores lessons, or dodges cars without any** → caught in build step 1, before the game is built around it.

## What Was Simplified and Why
- ~~Beats instead of real time.~~ **Reversed during `5-build`:** the game runs on a real-time clock (Matt's call). The road is still beat-based and replays exactly; what changed is that nobody waits for the player.
- **Same road every run within a session.** The frog meets the situation that ended its last run, so the video shows cause and effect. A reload, or a different `?seed=`, gives a new road. *(Agent recommendation, approved by Matt.)*
- **Generator limits plus a solvability check,** instead of hand-designed levels. Every road can be crossed, so distance can keep growing.
- **Memory only, no storage.** Matches the PRD's reload reset.
- **Plain fetch, no SDKs.** One less dependency for two short requests.
- **No GPU and no CLM.** Jev through the gateway replaces both.

## Decisions and Open Issues

**Matt's decisions**
- Next.js on Vercel ("I usually do Next.js on Vercel"), under the Strawberry Digital team, not the personal Hobby account.
- Jev, not CLM on a rented GPU: "I'll plan on getting the api access." Then no fallback model and no cutoff date: "If it doesn't come by then, I'm just going to give up." Jev turned out to be available now through Vercel AI Gateway. **This reverses the scope and PRD's CLM-first plan; both are updated to match.**
- A fake Jev for building offline; it is never shown as real.
- The coach only teaches after a run ends and never moves the frog (from the PRD).

**Derived by the agent; Matt approved them with the spec**
- Nemotron 3.5 Lightning for lessons: same price as Nano, about 5x faster.
- Beat-based world, a 350 ms minimum beat, and the same seed per session.
- The 15-beat stall rule. The PRD only ended runs on a hit, but a frog that learns to wait could otherwise wait forever.
- The coach shows a one-sentence "what happened" along with the rule, so Nemotron's reasoning is visible, not just the result. It still acts only after a run ends.
- Prose state with time-based car facts and neutral per-move descriptions.

**The useful unknown: how does a lesson change the frog's next move?**
Matt asked this. The explanation: Jev reads the state, the instructions (which carry the playbook) and each move's description, and scores each move. A lesson written in the same words as the descriptions shifts which move scores highest. Evidence from CLM (Jev's open lookalike) says instructions alone steer weakly: its official game demo put verdicts into the move descriptions and still matched the best move only 66% of the time. Jev may behave differently, and nobody has published how well it follows written rules.
**Build step 1 investigates this** with `scripts/lesson-test.ts`, before any game code, using `describe.ts` on hand-built worlds:
- **Fatal case:** frog on grass, column 4. In lane +1, a speed-2 car moving toward column 4 whose body reaches column 4 this beat.
- **Control case:** the same lane, but the car reaches column 4 in 2 beats.
- **Measure:**
  1. With the playbook `["Jump forward."]`: does `forward` win in both cases? (It should, so run 1 dies. If Jev already avoids the fatal case with no lesson, the frog won't die early, and the descriptions are too revealing. The fix then is to give distance instead of time.)
  2. With the lesson "If a car in lane +1 reaches your column this beat, wait." in the instructions: does `wait` win the fatal case, and does `forward` still win the control?
  3. With the same lesson instead added to the `wait` description: does that shift it more?
  4. One real `/api/lesson` call on a sample death: log `finish_reason`, `usage.completion_tokens`, and whether the content is clean (thinking is off).
- **Evidence needed:** (1) forward wins without the lesson; (2) or (3) flips the fatal case to `wait` without flipping the control; (4) returns both lines. If none of the lesson placements works, stop and decide with Matt before building further.

**Early result, 2026-09-25 (real Jev, one call per case, before build):**

| Playbook | Fatal case | Control case |
|---|---|---|
| "Jump forward." only | forward 0.71, wait 0.19 | forward 0.88 |
| + lesson in instructions | **wait 0.93**, forward 0.04 | forward 0.79 |
| + lesson in wait description | wait 0.87, forward 0.12 | forward 0.82 |

The lesson flips the fatal case and leaves the control alone, and the instructions slot is the stronger placement. So the playbook goes in `instructions`. Round trips were 220–620 ms from Matt's Mac. Measure 4 also passed: Nemotron 3.5 Lightning answered in 364 ms with `finish_reason: stop`, 0 reasoning tokens and both lines. Its rule ("Wait on grass until lane +1 cars pass column 4.") drifted from the game's exact wording, so the build should tighten the prompt toward phrases like "reaches your column this beat". Build step 1 still runs the full script (more situations, several repeats, and the Nemotron call) before the game is built.

**Open issues**
- Jev's uptime through the gateway was patchy on 2026-09-25; watch it during builds.
- Vercel function region: pick the one with the lowest measured round trip to both APIs during step 1 (Nemotron Lightning is in eu-north1).
