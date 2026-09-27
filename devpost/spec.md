---
doc: spec
status: approved
---

# Jevaga: Technical Spec

*(Replaces the Go Frog Go spec on 2026-09-26. Revised 2026-09-27: Nemotron stops planning live and learns from Jev's deaths instead, with every rule proven on a replay. The fight, what Jev reads, keyboard play, outage handling and the look carry over. The live planner is in git history.)*

## How This Works, In Plain Language
There are four pieces.

1. **The page.** A Next.js page runs the fight on a canvas and draws the panel. A physics timer moves everything every frame. The ship moves the instant someone decides.
2. **Jev, the fast brain (System 1).** About four times a second the page describes the fight in plain sentences ("where you stop (x 4.0): bullet in 0.4 s; a little left (x 2.8): nothing for 2.5+ s") and asks Jev, through `/api/move`, which of four moves to make. Its instructions are one starting line plus the rulebook. The fight keeps moving while Jev thinks.
3. **The flight recorder and the replay.** While Jev flies, the page keeps copies of the fight from the last few seconds and every question Jev was asked. After a death it can rebuild the fight from 1.5 s before the hit and fly it again in simulated time, asking Jev at the same moments as in the live run and applying each answer on the same 20 ms physics step. The world is deterministic, so the same fight with the same answers gives the same outcome to the step, and a new rule changes nothing but what Jev picks.
4. **Nemotron, the coach (System 2).** After each death the page sends the last second or so of what Jev read and picked to `/api/coach`. NVIDIA Nemotron 3.5 Lightning on Nebius Token Factory writes what happened and one rule. The page replays the death with the rule, and every earlier death Jev learned from, and keeps the rule only if the ship survives all of them.

API keys live only on the server routes. Runs, the rulebook and saved deaths live in the page's memory and reset on reload.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

1. Page opens (optionally `?seed=1234`) → `components/Game.tsx` builds the world from the seed; the canvas draws the formation and the ship. The rulebook is empty.
2. Start (Jev mode) → a health-check question to Jev (three tries); then `startRun` begins the physics timer and `driveWithJev` begins asking Jev. Each question is logged by the recorder with a copy of the world.
3. Each Jev question → `describeFight()` + `describeMoves()` + `instructionsFor(rules)` → `POST /api/move` → Jev via the gateway → `{ move, probabilities, confidence }` → the ship moves or fires the moment it lands → the JEV window updates.
4. A bullet or diver touches the ship → the run ends → HIT banner, the run joins RUNS → the recorder builds a `Death`.
5. Reproduce: `replay(death, rules)` with the rulebook Jev had. Jev is asked the same questions, the exact-repeat cache gives the same answers, and the death happens again. If it doesn't (the cache lost them and Jev answered differently), the death is marked luck; no rule, go to 9.
6. Coach: `POST /api/coach` with the death as prose and the rulebook → `{ happened, change, rule }`.
7. Test: `replay(death, newRules)` must survive; then every saved death marked fixed must still survive with `newRules`. On failure, one more coach call with the replay's result, then test again.
8. Show: the canvas plays the replay of this death with the rules that were tested (REPLAY tag, SURVIVED or HIT). The COACH window shows the verdict; a kept rule lands in the RULEBOOK with a flash. The death is saved as fixed, luck or unsolved.
9. The next run starts (same seed) with the current rulebook.
10. You mode → keys steer the ship directly; no models are called and nothing is recorded.

## Stack
Unchanged: Next.js 16 (App Router), TypeScript, pnpm, HTML canvas with sprites defined in code, plain `fetch` to both model APIs, Vercel for deployment, Pixelify Sans and Jersey 20 via `next/font/google`.

## Where It Runs and How Someone Tries It
Unchanged: `pnpm dev`, open http://localhost:3000 (`?seed=N` optional), keys in `.env.local` (`AI_GATEWAY_API_KEY` on the Strawberry Digital team's paid gateway tier, `NEBIUS_API_KEY`). The demo video is narrated and under 3 minutes; the deployed URL on the Strawberry Digital team stays up through Nebius judging (Dec 1–15); the repo is public with MIT or Apache-2.0.

## Look and Feel
- **Panel:** `design-handoff.md`: RPG windows (Jev blue, the coach purple, you green, neutral for RULEBOOK and RUNS), Pixelify Sans and Jersey 20, gold for the chosen move and best run, banded navy page, meters, switch, buttons, chips, HUD tags, HIT banner. The RULEBOOK uses the handoff's playbook rows and its 1 s fresh-rule band; the COACH window uses its NEW RULE and RULE CHANGED tags (gold), plus DIDN'T HOLD (red border) and LUCK / NO RULE (`--coach-hi` border). Greens are 20% darker than the handoff for contrast (slice 7).
- **Playfield:** 9 columns × 14 rows of 16 px, drawn at 4×, `image-rendering: pixelated`. Starfield in three depths on `#0b0d1c`. Sprites come from Matt's "Jevaga sprites" design canvas (https://claude.ai/artifact/Rubi3VRwQKMfUmArD9pLdL): its Grids board is copied into `lib/game/sprites.ts` as character grids with the board's legend. The ship is green when you fly and blue when Jev flies. The enemies are the Cyclops (row 1, orange), the Bat (row 2, red) and the Drone (row 3, silver), each with two flap frames and a gold-rimmed dive pose. Timings follow the canvas's "In motion" board: flaps 330 ms, thrust flicker 80 ms, an enemy's pop 3 × 80 ms, the ship's boom 4 × 150 ms. During a replay the who-tag reads REPLAY, and the replay ends on a centred banner, "REPLAY · SURVIVED" (gold border) or "REPLAY · HIT" (red border), in the HIT banner's style.

## Components

### The fight
`lib/game/world.ts`. PRD ref: `prd.md > The fight`.
- **Field:** positions x 0–8 (columns) × y 0–13 (rows, 0 at the top), continuous. Time `t` in seconds.
- **Physics steps:** always whole 20 ms steps (`stepN`), live and in replays; the live timer carries the leftover time to the next frame. `world.steps` counts them, so a question or an answer can be pinned to an exact step.
- **Randomness:** mulberry32 whose state is a number in the world (`world.rngState`), not a closure, so `structuredClone(world)` copies the fight exactly, including every future dive and volley. Replaces the closure in `lib/game/rng.ts`.
- **Ship:** bottom row (y = 13), continuous x, glides at 5 columns/s. The keyboard glides while an arrow is held and stops on release. Jev's `left`/`right` glide 0.25 s and stop, so a move goes where its description says; `stay` stops; `fire` stops and launches a shot if the gun is ready. Reload 0.35 s, at most 3 shots on screen. Shots climb 12 rows/s.
- **Formation:** 3 rows × 7 enemies (rows 1–3, columns 1–7), drifting side to side by up to one column (`sin(0.6 t)`).
- **Formation fire:** every 1.2 s a random formation enemy drops a bullet.
- **Dives:** every 3 s (10% faster each new wave, floor 1.5 s) one formation enemy dives: down at 3.5 rows/s, turning toward the ship at up to 2 columns/s until it is 4 rows above the ship, then falling straight, firing at rows 5 and 8. A diver that passes the bottom returns to its slot.
- **Bullets:** fall straight down at 7 rows/s.
- **Hits:** a shot destroys an enemy within half a column and half a row (100 points, diver 200); the kill is kept briefly in `world.pops` so the canvas can draw it bursting. A bullet within 0.45 columns and half a row of the ship, or a diver within 0.6 of it, ends the run, and `world.hitBy` records what it was and where. Checked every 20 ms physics step.
- **Waves:** a cleared formation brings a new one.
- **Prediction:** `threatAt(world, x)` simulates forward with the ship parked at `x`; `threatOnPath(world, path)` does the same for a moving ship, and `movePath(world, move)` is where a Jev move would take it. Both return when the ship would first be hit, or null. `targetAbove(world, x)` gives the lowest enemy above `x` and how long a shot takes to reach it.

### Enemies, carriers and waves
`lib/game/world.ts`. PRD ref: `prd.md > The fight`. The behavior and every number are in `enemy-design.md`; this section is how it's built.
- **Dive plans.** When an enemy launches, the world fixes its whole plan from the seed and the ship's position at that moment: a Drone's column and rev timer, a Bat's zigzag legs to row 9, a Cyclops's hover point. A plan is plain data on the enemy, so a world copy still replays exactly. The only later decisions are the ones the design names (the Bat's commit at row 9, the Cyclops's aim when it fires), and each reads the ship at a fixed moment.
- **Telegraphs.** Every plan exposes the path it will fly (`pathOf(enemy)`) so the canvas can draw it and the description can say it. No warning is shorter than 0.8 s.
- **Fly-in.** At wave start every enemy gets an entry dive (phase `enter`) with a start time, a path id and its place in the single file. Paths are fixed waypoint curves sampled once at load, so an entering enemy's position is a pure function of time. After the path it flies to its slot (`settle`). While anyone is entering or settling, no dives launch and no volleys fire. The path is drawn from 1 s before the group starts.
- **Hit points.** Enemies carry `hp` (Cyclops 2, others 1). A hit that doesn't kill consumes the shot and shuts the Cyclops's eye.
- **Formation habits.** The volley picks an enemy; a Bat drops a straight bullet, a Cyclops glows 0.8 s then fires an aimed shot, a Drone is never picked.
- **Carriers and weapons.** Carriers are picked from the seed at wave start (the carriers column of the wave table). After the wave's first dive, each carrier is sent once, in turn; after that anyone can dive. A carrier's attacks use its weapon: a Bat's bullets come in fans of three, a Drone brings mini-drones (`world.minis`) down the columns beside it, a Cyclops parks and fires an Eye Beam (`world.beams`: a warning from `warn`, deadly from `start` to `end`) instead of aimed shots. A killed carrier drops a pickup (`world.pickups`) that falls to row 13, waits 4 s and blinks out; gliding onto it sets `world.weapon` until the wave ends. Your Fan adds two angled shots to each volley (only the lead shot counts toward three on screen), your Eye Beam hits everything in your column at once, and your Wingmen (`world.wings`) fire with you and each absorb one hit. All of it is plain data in the world, so prediction and replays cover it with no special cases.
- **Waves.** A table indexed by wave sets which kinds dive, how many at once, speed, carriers, escorts and entry.

### Predicting hits
`lib/game/world.ts`. PRD ref: `prd.md > Jev flies (System 1)`.
- `threatOnPath(world, path)` becomes a simulation: copy the world, move the ship along `path` each step, and step the copy forward until something touches the ship, up to 2.5 s. Nothing new launches in the copy (no new dives or volleys), so Jev is told only about what's already on screen or already committed. Every enemy behavior is predicted exactly by the same code that runs it, including a Bat's commit and a Cyclops's aim toward where the ship will be.
- It reports what hit and which kind (`"Drone"`, `"Bat bullet"`, `"Cyclops beam"`, …) so the description and the coach can name enemies.

### Describing the fight to Jev
`lib/describe.ts`. PRD ref: `prd.md > Jev flies (System 1)`. Unchanged from slice 6.
- Prose, facts only, never a verdict. Times in seconds from the moment of asking.
- `describeFight(world)`: where the ship is and, if it is gliding, where it stops; gun ready or reloading; for where it stops and one glide either side, when something reaches the ship counting the way there; each diver's position, height and whether it is still turning; the lowest enemy above the ship; how many enemies are left and where the formation is drifting.
- `describeMoves(world)`: left / right say where the glide ends, what it runs into on the way or there, and what is above the landing spot; stay and fire say what reaches the ship where it stops, and fire says whether the gun is ready and what the shot would reach.
- The coach reads the same words, so its rules can use them.

### Jev flies (System 1)
`lib/system1/*`, `app/api/move/route.ts`. PRD ref: `prd.md > Jev flies (System 1)`.
- Carried over: the swappable interface, Jev through the gateway's TypeSafe route, the offline fake (SIMULATED), the exact-repeat cache, response validation, `driveWithJev` (at most 4 questions a second; the move applies when the answer lands; errors or 2.5 s without an answer pause the fight and retry every 3 s).
- `DecideInput` becomes `{ state, moves, rules: string[] }`; the cache key uses the rules.
- Instructions (`instructionsFor(rules)` in `lib/system1/types.ts`): "Pick the ship's next move in a space shooter. Stay alive and shoot enemies." With rules, add a blank line, "Rules you've learned. Follow each one when its situation comes up:", and the rules numbered 1 to n. No hand-written survival rule: Jev starts dumb.
- `driveWithJev` gains an `onAsk(input, world)` hook, called just before each question, and an `onAskFailed()` hook for a question that got no answer, and passes each answer to `onDecision` as now. The recorder uses all three.

### The flight recorder
`lib/learn/recorder.ts`. PRD ref: `prd.md > Jev learns from its deaths (System 2)`.
- Control moments: the recorder also keeps up to 5 calm moments from Jev runs, spread over time: nothing arriving within 2.5 s where the ship stops, an enemy above, the gun ready. They are the check that a rule leaves Jev shooting.
- `onAsk`: push `{ t, world: structuredClone(world), state, moves, rules, ask: world.steps }`; `onDecision` (called right after the answer is applied) fills in `{ pick, probabilities, confidence }` and the step it landed on. `onAskFailed` (an error or timeout paused the fight) drops that question: it never moved the ship. Entries older than 4 s are dropped, so memory stays small.
- On a hit, `toDeath(runNumber)` returns a `Death`: `start` is the recorded world from the latest entry at or before `t_hit − REPLAY_LEAD` (1.5 s), or the first entry if the run was shorter; `asked` is every answered entry from `start` on; `schedule` is every entry's ask step and answer step (none for a question the hit beat); plus `t_hit`, the step the hit landed on (`hitStep`), `hitBy`, and the rules Jev had.
- Only Jev runs are recorded.

### The replay
`lib/learn/replay.ts`. PRD ref: `prd.md > Jev learns from its deaths (System 2)`.
- `replay(death, rules, decide)`: clone `death.start` and fly it in simulated time, as fast as Jev answers. Follow `death.schedule`: ask Jev on each recorded ask step and apply its answer on the recorded answer step. A question the hit beat (no answer step) has its answer applied no earlier than the step after the hit. If the recorded questions run out before the hit (an outage), the replay asks nothing until the hit step, as live. Past the hit (the ship lived longer this time), ask as soon as the previous answer is applied and apply each answer 14 steps (0.28 s, about the median) later. Stop at a hit, or once the flight is past `t_hit + SURVIVE_PAST` (1.0 s) and nothing is about to hit the ship: `threatOnPath(world, movePath(world, "stay"))` is null or more than 0.5 s away. A rule that only postpones the same death keeps being flown until it lands, up to `t_hit + 2.5 s`, and then counts as a hit.
- Returns `{ outcome: "survived" | "hit" | "untested", hitAt?, moves: { t, move }[], asked: number }`. A Jev error or timeout makes the result `untested`, never `survived`.
- `playback(death, moves)` rebuilds the same flight for the canvas from the recorded moves with no model calls, so what the viewer sees is exactly what was tested.
- Replays of the same death with the same rules ask the same questions, so the exact-repeat cache answers the repeats and a regression check costs nothing for deaths that didn't change.
- Recorded timing is the point. Slice 8 first replayed at a fixed 0.28 s latency, and 0 of 5 deaths happened again: shifting every answer by a few milliseconds changes what Jev sees from the first question on, and the fight goes another way. On the recorded schedule, 5 of 5 deaths retraced to the exact step with Jev's own answers and died again when Jev was asked again.

### The coach (System 2)
`lib/system2/coach.ts`, `app/api/coach/route.ts`. PRD ref: `prd.md > Jev learns from its deaths (System 2)`.
- Nemotron 3.5 Lightning on Token Factory, thinking off, `max_tokens` 300, `temperature` 0.3, 15 s timeout. Thinking on was measured with `scripts/coach-bench.ts` and was worse (see Decisions and Open Issues); `COACH_THINKING=on` still switches it on for experiments.
- Input, as prose: for each question in `death.asked`, oldest first, how long before the hit it was asked, what Jev read (`state`), its four options (`moves`), and what it picked with its probability, plus a hindsight line (which options had nothing arriving for at least 1 s, and what was arriving on the one it picked, read from the options' own text); then what hit the ship and from where; then the rulebook, numbered, or "The rulebook is empty." On a retry, add the rule that failed and what happened in its replay ("Jev picked left at 0.6 s before the hit and a bullet hit it at x 3.1").
- Output, exactly three lines:
  ```
  What happened: <one sentence>
  Change: add | replace <n> | none
  Rule: <one sentence, 30 words or fewer; blank when Change is none>
  ```
- The prompt first explains what hits the ship (stopping, staying or firing where something arrives; an option reading "bullet in 0.3 s" gets hit in 0.3 s), then asks for a rule written as a situation and what to do about it, never one that stops Jev firing when nothing is arriving, naming left or right only when tied to what the description shows on that side, using the words in the description ("bullet in", "diver", "turning toward you", "falling straight", "edge", "glide", "stop"). No positions that only fit this death, no timing finer than the description gives, and "none" when nothing Jev read could have saved it. Parsed tolerantly; `</think>` stripped. "Replace n" beyond the end of a rulebook with room is read as add. A reply that replaces a rule that doesn't exist in a full book, adds when the book is full (8 rules), or echoes the reply template counts as a failed attempt.

### The judge
`lib/learn/judge.ts`. PRD ref: `prd.md > Jev learns from its deaths (System 2)`.
- A recorded death starts as `new`. `afterDeath(death, book)`, where `book` holds `rules`, `deaths` (each saved death with its status: `fixed`, `luck` or `unsolved`) and `controls`:
  1. Reproduce with `death.rules`. Survived → status `luck`, done. Untested → no rule this time, and the death is not saved.
  2. Coach → candidate rules (at most one add, replace or none).
  3. Replay this death with the candidate. Then replay the 8 most recent `fixed` deaths with it, one at a time. Then ask the control moments with it: Jev must fire in at least as many of them as it does with the current rules.
  4. All passed → keep the candidate; this death becomes `fixed`. Otherwise one retry of 2 and 3 with the replay's result. Still failing → rules unchanged, this death is `unsolved`. A coach call that fails (a timeout or a garbled reply) gets one extra call without using up a test; Token Factory occasionally took 12 to 15 s instead of about 1 s in testing.
- Returns every step's result for the panel and for `scripts/learn.ts`.
- Every replay question goes through one shared limiter at 4 a second, the rate the gateway held clean in testing. A 429 is retried with backoff twice before a replay counts as untested.
- Time and cost: a replay is about 10 questions, about 2.5 s and $0.0002. With 8 fixed deaths a test is about 90 questions, about 25 s and $0.002, and a retry doubles it. A coach call is 1 to 3 s and about $0.0005. The COACH window shows progress while it runs.
- The judge tests survival and the control moments only. Score and kills are watched across runs in RUNS and in `scripts/learn.ts`, not used to accept a rule.

### Sound
`lib/game/cues.ts`, `lib/game/sound.ts`. PRD ref: `prd.md > Sound`.
- **Cues, not engine events.** The engine stays untouched, so replays stay exact. Each animation frame, `createCueTracker().update(world, replaying)` compares the world with what it saw last frame (the reload time, new shots, bullets and pops by identity, each enemy's phase, charge and hurt time, the wave, whether the ship is alive) and returns the cues since then. A different world object (a new run or a replay) is taken in silently, apart from one "start" or "rewind" cue.
- **Voices.** Each sound is a pure function that returns its samples (`lib/game/voices/`, format in `types.ts`), so it plays in the browser, renders for the video and can be measured by `scripts/sound-lab.ts`. The game plays the `juicy` set, picked by ear on the development page `/sounds`: every take is rendered into an AudioBuffer in small batches after the first click, and four variants rotate per sound. One master gain; at most 12 voices at once.
- **Mute and unlock.** The AudioContext is created or resumed on the first click or key press (browsers require it). Muted state lives in localStorage (wrapped in try/catch) and defaults to on.

### Enemy Library
`components/Library.tsx`, opened from the panel. PRD ref: `prd.md > Enemy Library`.
- One page per enemy, from `enemy-design.md > The Enemy Library`: sprites (formation and dive pose, drawn from `lib/game/sprites.ts`), name, lore, how it attacks, its weapon, spot it coming, first seen.

### Panel and playfield
`components/*`, `lib/game/render.ts`, `lib/game/sprites.ts`. PRD ref: `prd.md > Screens and Layout`, `prd.md > Look and Feel`.
- Windows per `design-handoff.md`: Who plays switch; JEV (move, confidence, four probability bars, ms); COACH (watching, studying, testing, then the verdict: tag, "What happened: …", the rule, "Replay: survived. Earlier deaths: 3 of 3 still survive." or what failed); RULEBOOK (numbered rules, fresh rule flashes, "Empty. Jev starts on reflexes alone."); YOU (last key, legend); RUNS (who, score, kills, seconds, rules Jev had, best in gold, the run in progress); USAGE (session totals for Jev and Nemotron, tokens and cost); Controls with Start, Stop and Forget rules; outage chip.
- Canvas: three-depth starfield, flapping formation, dive poses, bullets, shots, thrust flicker, a pop per kill, the boom on a hit; HUD score box, YOU/JEV/REPLAY tag, the "HIT · RUN N OVER" banner, and during the pause the replay playback with its SURVIVED/HIT banner.

### Usage and cost
`lib/usage.ts`, `lib/system1/{types,jev,cache,fake}.ts`, `lib/system2/coach.ts`, `components/{Game,Panel}.tsx`. PRD ref: `prd.md > Usage`.
- Every `Decision` from Jev carries `usage: { inputTokens, outputTokens, costUsd, cached? }`. `costUsd` comes straight from the gateway's own `provider_metadata.gateway.cost` on that call; it is never computed. A cache hit returns `{ inputTokens: 0, outputTokens: 0, costUsd: 0, cached: true }`, since it made no call.
- Every `Coaching` from Nemotron carries `usage: { inputTokens, outputTokens, costUsd }`. Token Factory reports tokens only, so the cost is looked up from two constants in `lib/usage.ts`: $0.06 per 1M input tokens and $0.24 per 1M output tokens for `nvidia/Nemotron-3_5-Lightning`, from the Token Factory model endpoints page, checked 2026-09-26.
- The page counts every answer `getMove` resolves (live flying, the health check, and the judge's replays and calm-moment checks through `replayMove`) and every reply `getCoaching` resolves, into a session total held in a ref. A 500 ms ticker copies it into state, so the panel updates without re-rendering on every one of Jev's four-a-second answers. The total resets only on reload.
- `scripts/learn.ts`, `scripts/sim.ts` and `scripts/coach-bench.ts` keep the same total headless and print it when they finish: Jev's answers, cached answers, tokens and cost; Nemotron's calls, tokens and cost; the combined cost. `learn.ts` also prints the cost per run.

## Data Model
All in page memory.
```ts
type Move = "left" | "right" | "stay" | "fire";
type Enemy = { id: number; slot: { col: number; row: number }; kind: 0 | 1 | 2; alive: boolean;
               diving: null | { x: number; y: number; fired: number } };
type Bullet = { x: number; y: number };         // enemy bullet, falls
type Shot = { x: number; y: number };           // player shot, climbs
type Pop = { x: number; y: number; kind: 0 | 1 | 2; t: number }; // a kill, for the canvas
type World = { seed: number; rngState: number; t: number; steps: number;
               ship: { x: number; vx: number; glideUntil: number; reloadUntil: number };
               enemies: Enemy[]; bullets: Bullet[]; shots: Shot[]; pops: Pop[]; score: number; kills: number;
               wave: number; nextDive: number; nextVolley: number; alive: boolean;
               hitBy: null | { by: "bullet" | "diver"; x: number; y: number } };
type Asked = { t: number; state: string; moves: Record<Move, string>; pick: Move;
               probabilities: Record<Move, number>; confidence: number };
type Beat = { ask: number; answer: number | null };   // physics steps; null: the hit came first
type Death = { run: number; tHit: number; hitStep: number; hitBy: NonNullable<World["hitBy"]>; start: World;
               asked: Asked[]; schedule: Beat[]; rules: string[]; status: "fixed" | "luck" | "unsolved" | "new" };
type Control = { state: string; moves: Record<Move, string> };   // a calm moment where fire was right
type Book = { rules: string[]; deaths: Death[]; controls: Control[] };   // at most 8 rules, 5 controls
type Run = { n: number; who: "jev" | "you"; score: number; kills: number; seconds: number; rules: number };
```

## File Structure
```
app/
  page.tsx                 # client-only Game
  api/move/route.ts        # POST → Jev (System 1)
  api/coach/route.ts       # POST → Nemotron rule after a death (System 2)   [replaces api/plan]
components/
  Game.tsx                 # runs, modes, keyboard, the between-runs learning steps
  GameCanvas.tsx           # draws every frame; live fight or replay playback
  Panel.tsx                # windows per design-handoff.md
lib/
  game/world.ts            # the shooter: formation, dives, bullets, shots, hits, prediction
  game/rng.ts              # mulberry32 on a number stored in the world
  game/loop.ts             # startRun (physics timer), driveWithJev
  game/render.ts           # playfield drawing
  game/sprites.ts          # grids from the design canvas
  describe.ts              # fight → prose for Jev and the coach
  learn/recorder.ts        # the last few seconds of questions and worlds
  learn/replay.ts          # replay a death in simulated time; playback for the canvas
  learn/judge.ts           # reproduce, coach, test, keep or throw out
  system1/{types,jev,fake,cache,index}.ts
  system2/coach.ts         # Nemotron rule writer   [replaces planner.ts]
  usage.ts                 # token/cost accounting shared by the page and the scripts
scripts/
  world-check.ts           # shooter rules, cloning, determinism
  replay-test.ts           # a death replays exactly; a rule flips it   [replaces plan-test]
  coach-bench.ts           # coach variants scored on the same saved deaths
  learn.ts                 # headless learning runs with real models    [replaces sim live mode]
  sim.ts                   # headless runs with a fixed rulebook
```
Retired: `app/api/plan`, `lib/system2/planner.ts`, `scripts/plan-test.ts`, `drivePlanner` and the NEMOTRON plan window (in git history).

## External Services and Dependencies
Unchanged: Jev at `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone` (paid tier, ~250 ms median, ~4/s tested clean), Nemotron at `POST https://api.tokenfactory.nebius.com/v1/chat/completions` (`nvidia/Nemotron-3_5-Lightning`, `chat_template_kwargs.enable_thinking: false`). Cost: Jev ~$0.00002 per decision. A 60-second run is ~240 Jev calls; the learning steps after a death add up to ~100 more and one or two coach calls. Twenty runs of learning cost a few cents.

## Important Failure Modes
- **Jev unavailable** → the fight doesn't start, or pauses mid-run with the chip (carried over). During a replay → `untested`; the rule isn't kept and the COACH window says it couldn't be tested.
- **Nemotron unavailable or slow** → no rule for that death; the next run starts with the rulebook unchanged and the COACH window says so.
- **A replay doesn't match the live run** → only if Jev answers a repeated question differently (the cache was emptied, for example by a server restart). The reproduce step catches it and marks the death `luck`.
- **Rules pile up or contradict** → at most 8; the coach must replace to add more, and every change has to keep the recent fixed deaths fixed.
- **A rule makes Jev safe but useless** (stops firing, hugs an edge) → the control moments catch "stops firing"; an edge-hugging rule shows up as falling kills in RUNS. The judge does not score whole runs, because one run is mostly luck.
- **Too many questions at once** → one shared 4-a-second limiter for replays; replays run one at a time.
- **Jev answers differently to the same question** → the exact-repeat cache makes replays within a session consistent.

## What Was Simplified and Why
- **Replays keep the live run's timing** and use a fixed 0.28 s only past the end of the recording. A rule is judged on the exact delays that killed Jev.
- **Replays start 1.5 s before the hit and end once the ship is at least 1 s past it with nothing about to land.** Long enough to hold the decision that mattered in most deaths seen so far. Widened in the build if deaths often come back `unsolved`.
- **One rule change per death, one retry.** Keeps the story readable and the pause short.
- **Regression replays capped at the 8 most recent fixed deaths.** Keeps the pause under about 45 s with a retry.
- **One hit ends a run.** No lives yet.
- **Same seed per session.** The formation and dive order repeat, so runs are comparable.
- **Rulebook in memory.** Reload starts over; saving it is deferred.

## Decisions and Open Issues
**Matt's decisions:** switch to a Galaga-style shooter (2026-09-26); name Jevaga; real time and keyboard play carried over; design-canvas look; Nemotron learns from deaths instead of planning live, and Jev starts dumb (2026-09-27).

**Measured so far (real models, seed 5):** a written instruction moves Jev hard ("work the right side" → right at 0.90 on the identical moment; "work the left side" → left at 0.92). Step-by-step orders hurt; strategy helped (live plans ~3,125 vs a generic fixed plan ~1,150 on the grid ship; live plans ~4,500 on the gliding ship). Death logs showed recurring patterns (overshooting glides, jittering under a homing diver, the word "stay" pulling Jev to stop), each fixed by a change to what Jev reads or is told.

**Measured in slice 8 (real Jev, seed 5, 5 deaths):** with no rules at all, Jev scored 600 to 7,400 and lasted 4 to 74 s. On the recorded schedule every death retraced to the exact step and died again when Jev was asked again; the hand-written rule "Never pick a move whose description shows a bullet or diver arriving within 0.6 s." turned 5 of 5 into survivals, and Jev still fired in 5 of 5 calm moments with it.

**Measured in slice 9 (coach bench, 8 real deaths of a Jev with no rules, seed 5):** the hand-written reference rule saves 6 of 8. The first coach prompt wrote rules tied to one death ("glide right", "5 rows up") or wrong about the game ("stay to let the bullet pass"); in a 10-run learning loop it kept one rule and Jev got worse. With the prompt explaining what hits the ship and a hindsight line per moment, thinking off: 7 rules from 8 deaths, 5 saved the death they were written for, and each saved 5.1 of the other 7 on average, in about 1 s per rule. Thinking on: 3 rules, none usable (it echoed the reply template), about 16 s per rule.

**Open, answered in the build:**
- Is 1.5 s of lead enough? Counted from `unsolved` deaths.
- **Folder and repo name:** the project folder is still `GoFrogGo`.
