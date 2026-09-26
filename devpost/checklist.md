---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast (chosen 2026-09-25)

## Slices

- [x] **1. A script proves Jev follows a lesson, using the game's own world and wording**
  Becomes usable: `pnpm lesson-test` builds real game situations with the actual world and describe code, asks real Jev with and without a lesson, asks real Nemotron for a lesson, and prints a pass/fail table. The Next.js project exists and builds.
  Why now: The whole idea rests on a written rule changing Jev's move. A one-off curl showed it once; this makes it repeatable, run on the same `world.ts`, `describe.ts`, `jev.ts` and `nemotron.ts` the game will use, so any wording change later can be re-checked in seconds. It is the one allowed "technical" slice: it proves the critical risk and leaves runnable evidence. Project bootstrapping rides along.
  PRD ref: `prd.md > Fast decisions (System 1)`, `prd.md > Coach lessons (System 2)`
  Spec ref: `spec.md > Game world`, `spec.md > Describing the road to Jev`, `spec.md > Fast decisions (System 1)`, `spec.md > Coach lessons (System 2)`, `spec.md > Decisions and Open Issues`, `spec.md > File Structure`
  Build: Scaffold Next.js (App Router, TypeScript, pnpm) in place, merging `.gitignore` (add `node_modules`, `.next`, `.vercel`); add `.env.example`. Write `lib/game/rng.ts` and `lib/game/world.ts` (grid, cars with head and wrap, `step` with swept collision, edge rules, lane generation with the Σ(len+speed) ≤ 5 cap and the BFS solvability check). Write `lib/describe.ts` (time-based prose, all five move descriptions, lane 0 first). Write `lib/system1/types.ts`, `jev.ts`, `fake.ts`, `index.ts` and `lib/system2/nemotron.ts` with the request shapes and parsing rules in the spec. Write `scripts/world-check.ts` (collision, wrap, edges, solvability over 200 seeds) and `scripts/lesson-test.ts` (fatal and control cases, three playbook placements, three repeats each, plus one Nemotron call; tighten the lesson prompt toward the game's exact phrases).
  Verify (mechanical): `pnpm build` succeeds; `pnpm world-check` prints all assertions passing and every one of 200 seeds solvable; `pnpm lesson-test` shows forward winning both cases with "Jump forward." only, wait winning the fatal case and forward the control with the lesson in instructions (majority of repeats), and a Nemotron reply with `finish_reason: stop`, both lines, and a rule using "lane +1" and "this beat" or "in N beats".
  Learner check: Run `pnpm lesson-test` yourself and read the table: does Jev's choice flip only in the fatal case once the rule is added, and does Nemotron's rule sound like something the frog could follow?
  Commit: `Add world, describe, model clients and lesson test`

- [x] **2. Press Start and watch Jev play the frog until it dies**
  Becomes usable: Open localhost:3000, press Start, and Jev moves the frog up a scrolling endless road one beat at a time, with its move and five probability bars shown each beat, until a car hits it or it stalls. The run's distance is shown.
  Why now: The first thing you can actually watch. It wires the browser, the beat loop and `/api/move` to real Jev, and shows early whether pacing and the view feel right before the coach is added.
  PRD ref: `prd.md > The Core Journey` (steps 1-4), `prd.md > Endless road`, `prd.md > Fast decisions (System 1)`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Beat loop`, `spec.md > Game canvas`, `spec.md > Panel`, `spec.md > Fast decisions (System 1)`, `spec.md > The Core Journey Through the System`
  Build: `app/api/move/route.ts` (validates input and Jev's answer, logs `error_type`). `lib/game/loop.ts` (one request in flight, 350 ms minimum beat, hit and 15-beat stall endings, last-6-beats buffer). `app/page.tsx` split layout owning Session state, `?seed=` handling. `components/GameCanvas.tsx` and `lib/game/render.ts` with plain colored blocks and a camera that follows the frog. `components/Panel.tsx` with DecisionBox, RunHistory (distance only) and Start/Stop. Start's first move call doubles as the health check.
  Verify (mechanical): Start the dev server; `curl` `/api/move` with a sample state and get a valid move; load the page in the browser pane, press Start, and confirm by reading the page that beats advance, the Decision box updates with five probabilities, and the run ends with a distance recorded. No console errors.
  Learner check: Open http://localhost:3000, press Start, and watch one run. Does the frog go straight into traffic on "Jump forward"? Does the pace feel watchable, and is it clear what Jev is choosing each beat?
  Commit: `Jev plays the frog on an endless road`

- [x] **3. The coach teaches after every run and the frog gets better**
  Becomes usable: When a run ends, the Coach box shows Nemotron thinking, then "What happened" and a new rule; the rule appears in the numbered playbook, and the next run replays the same road with the whole playbook. Runs continue until Stop, with distances listed and the best starred.
  Why now: This is the kernel. It comes as soon as there is a run to learn from, so the most important part gets the most time to tune.
  PRD ref: `prd.md > The Core Journey` (steps 5-7), `prd.md > Coach lessons (System 2)`, `prd.md > Run history`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Coach lessons (System 2)`, `spec.md > Panel`, `spec.md > Data Model`, `spec.md > The Core Journey Through the System`
  Build: `app/api/lesson/route.ts` (15 s timeout, failure path). Wire run end → lesson → playbook append → 1.5 s pause → same seed, beat reset → next run. CoachBox, Playbook (newest flashes) and full RunHistory (timeout marker, best starred, seed shown). Stop keeps playbook and history.
  Verify (mechanical): `curl` `/api/lesson` with a sample death and get both lines; in the browser pane, run at least 4 runs on a seed where "Jump forward" dies in the first two road lanes, and confirm by reading the page that a numbered rule appears after each run and that at least one later run beats run 1's distance.
  Learner check: Press Start and let it run for four or five runs. Watch run 1 die, read the coach's rule, and see whether the next run handles that spot. Does the playbook read like real lessons, and does the distance climb?
  Commit: `Coach writes lessons and runs replay with the playbook`

- [x] **4. You can fly Jevaga with the keyboard**
  Becomes usable: Open localhost:3000, switch to You play, press Start: the formation drifts, divers swoop and fire, bullets fall, and you slide with ← → (or A D) and fire with Space. Shots destroy enemies and score; one hit ends the run and it joins RUNS.
  Why now: The game has to exist and feel right before any model flies it. It replaces the frog world and exercises the physics timer, prediction and keyboard path the later slices reuse.
  PRD ref: `prd.md > The fight`, `prd.md > You fly`, `prd.md > Runs`
  Spec ref: `spec.md > The fight`, `spec.md > Panel and playfield`, `spec.md > Data Model`
  Build: Rewrite `lib/game/world.ts` as the shooter (ship, formation drift, dives, formation fire, bullets, shots, hits, waves, `threatAt`, `shotTime`); adapt `startRun` in `lib/game/loop.ts` (`act(move)` instead of `hop`); plain-shape `render.ts`; You mode in `Game.tsx` (← → A D, Space); RUNS shows score. Rewrite `scripts/world-check.ts` for the shooter.
  Verify (mechanical): `pnpm world-check` passes (drift, dive steering, bullets per column, shot kills, ship hit, reload, prediction agrees with simulation); `pnpm build` and lint pass; in the browser pane a keyboard run moves, fires, scores and ends on a hit; no console errors.
  Learner check: Switch to You play and fly a few runs. Is it fun, and is the pace right?
  Commit: `Jevaga: the shooter, flown with the keyboard`

- [x] **5. Jev flies Jevaga, and a plan changes its moves**
  Becomes usable: Jev mode flies the ship in real time with the JEV window showing each move (left, right, stay, fire), confidence, four probabilities and answer time. `pnpm plan-test` shows whether a written plan changes Jev's choice in frozen fights.
  Why now: The risk: does Jev read the fight well enough to dodge and aim, and does a plan steer it? Checked before the strategist is built.
  PRD ref: `prd.md > Jev flies (System 1)`
  Spec ref: `spec.md > Describing the fight to Jev`, `spec.md > Jev flies (System 1)`
  Build: `lib/describe.ts` (`describeFight`, `describeMoves`); moves become `left | right | stay | fire` across `system1/*` and `/api/move`; instructions carry a plan; `driveWithJev` acts on answers; `scripts/plan-test.ts` (bullet-incoming vs safe fights; "dodge first" vs "keep firing"); update `scripts/sim.ts`.
  Verify (mechanical): `pnpm plan-test`: with a dodge plan Jev moves out of an incoming bullet's column, with a fire plan it fires when safe; in the browser pane Jev uses at least three different moves in a run and scores; no console errors.
  Learner check: Watch Jev fly a few runs. Does it dodge, and does it look like it's deciding?
  Commit: `Jev flies Jevaga`

- [x] **6. Nemotron plans live and Jev follows**
  Becomes usable: During a Jev run the NEMOTRON window shows a new plan every ~3 s with its age; Jev's instructions change with it; runs repeat until Stop.
  Why now: This is the kernel. It needs Jev flying first.
  PRD ref: `prd.md > Nemotron plans (System 2)`, `prd.md > The Core Journey`
  Spec ref: `spec.md > Nemotron plans (System 2)`
  Build: `lib/system2/planner.ts`, `app/api/plan/route.ts`, `drivePlanner` in `loop.ts`, NEMOTRON window with stale marker; retire `app/api/lesson`, `lib/game/coachMemory.ts`, the lesson coach and `scripts/lesson-test.ts`.
  Verify (mechanical): `curl /api/plan` returns a plan in the game's words; in the browser pane plans refresh every ~3 s during a run and Jev's instructions change; Nemotron failure leaves Jev flying on a stale plan.
  Learner check: Watch a run with the Nemotron window. Can you see Jev's moves change after a new plan?
  Commit: `Nemotron plans live for Jev`

- [x] **7. It looks like a 16-bit game**
  Becomes usable: The design-canvas panel from `design-handoff.md` (RPG windows, Pixelify Sans, Jersey 20, gold highlights, HUD tag, HIT banner) and derived space sprites: ship, three enemy types, diver, shots, bullets, explosion, starfield.
  Why now: After the behavior works, so styling never hides a logic bug.
  PRD ref: `prd.md > Look and Feel`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Look and Feel`, `spec.md > Panel and playfield`
  Build: `lib/game/sprites.ts` with outline and bottom-row shading in the handoff palette; `render.ts`; fonts and tokens per the handoff; panel restyle.
  Verify (mechanical): `pnpm build` passes; screenshot checked against `design-handoff.md`; both model labels in page text; no console errors.
  Learner check: Does it look like the design canvas, and do ship, enemies and bullets read at a glance?
  Commit: `Jevaga: 16-bit sprites and styled panel`

- [ ] **8. It fails honestly and can run offline**
  Becomes usable: Outage states verified end to end; `SYSTEM1=fake` flies with the SIMULATED badge; README explains setup and how Jev and Nemotron are each used; `.env.example` complete.
  Why now: Makes the live URL safe to leave up through judging.
  PRD ref: `prd.md > States and Boundaries`
  Spec ref: `spec.md > Important Failure Modes`, `spec.md > Where It Runs and How Someone Tries It`
  Build: fake adapted to four moves; README; `.env.example`.
  Verify (mechanical): wrong gateway key → "Jev unavailable" and no start; wrong Nebius key → Jev flies on a stale plan; `SYSTEM1=fake` shows SIMULATED; restore keys, normal run.
  Learner check: Set `SYSTEM1=fake`, restart, press Start, check SIMULATED is obvious; set it back.
  Commit: `Handle model failures and add offline mode`

## Hands-on Checkpoints

- [x] Early usable behavior explored: after slice 3 (frog game). Matt's feedback led to real time, keyboard play, the continuous rebuild, the paid gateway tier, and finally the switch to Jevaga.
- [ ] Jevaga early check: after slice 6, when Nemotron's plans steer Jev
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence:
Route and stops:
Edit outcome:
Reflection:
Activity mode:

## Revisions
- Lesson prompt examples can be copied verbatim — in the slice 1 lesson test Nemotron returned the first example rule word for word (it happened to fit that death). Slice 3 must confirm lessons describe the actual death, and drop or vary the examples if they get parroted.
- Session state lives in `components/Game.tsx`, loaded client-only from `app/page.tsx` — Next 16's lint rule forbids setting state in an effect, and the game needs the URL seed and a random seed on first render, which only exist in the browser.
- Mid-run Jev retry moved from slice 5 into slice 3 — Jev through the gateway returned 503s every few minutes during slice 3 testing, which froze runs and blocked verification. The first move also gets three quick tries before "Jev unavailable".
- The coach gets hindsight from the replay (all five options at the fatal beat, which moves would have survived, the earlier beat if the frog was trapped), and rules whose move wouldn't have saved the frog are sent back — without it, Nemotron wrote rules like "go back into the car" that took seed 13 from 22 back down to 2 for four straight runs.
- Repeat detection compares a rule's lanes, timing and move instead of word overlap — word overlap called "lane -1 … wait" a repeat of "lane +1 … wait" and blocked correct rules.
- Added `scripts/sim.ts` (headless runs with real models) — tuning through the browser was too slow; runs sequentially because parallel sims hit Jev's 429 rate limit.
- Jev now reads the whole visible board (every lane on screen, three columns of timing) — Matt's call at the slice 3 checkpoint, after seeing Jev only had the lanes right around the frog.
- Jev outages show as a chip beside the title instead of replacing the Jev box — Matt: the box swap shifted the whole screen.
- Minimum beat raised to 500 ms and Jev's answers reused for exact repeats — Matt hit a 429; our own test runs were competing for the same rate limit.
- The game runs on a real-time clock and you can play it with the keyboard — Matt at the slice 3 checkpoint: make it playable first, and real time "or else… it could easily just be solved by a solver. That's the whole point of using Jev." Reverses the spec's turn-based simplification; a late Jev answer now means the frog waits that beat. Human play moved up from Later.
- Rebuilt as a continuous game: cars glide, the frog hops the instant a key is pressed or Jev's answer lands, and Jev reads times in seconds — Matt: key presses felt slow and cars should move smoothly, not by grid. Replaces the 600 ms beat clock; road generation still uses beats as a conservative crossability check.
- Look settled on the design canvas (2026-09-26): SNES-era stays, an N64 low-poly look was considered and dropped; the panel becomes 16-bit RPG windows with Pixelify Sans and Jersey 20 in place of Press Start 2P. Sprites, palette and every panel value live in `devpost/design-handoff.md`, extracted from the canvas so slice 4 builds from it instead of re-inventing them.
- Jev's "unavailable" was AI Gateway's free-tier rate limit (~25-30 requests a minute, surfacing as 503s), not TypeSafe downtime — measured 29/40 at 1/s and 4/30 at 2/s on the free tier, then 120/120 up to 4/s after Matt bought gateway credit for the Strawberry Digital team. Jev is asked up to 4 times a second again.
- The coach edits the playbook instead of appending to it: one add/replace/remove per run, at most 4 rules above a fixed "Otherwise, jump forward." — Matt picked option 1 after the playbook grew to 10 contradictory rules. Asking Nemotron to rewrite the whole list failed (it rewrote every rule and invented its own vocabulary), so the code applies a single edit. Seed 13 then climbed 2 → 7 → 16 → 32 → 32 before later edits regressed it.
- Switched from the frog game to Jevaga, a Galaga-style shooter, with Nemotron as a live strategist instead of a between-runs teacher — Matt, 2026-09-26: Jev only ever waited or hopped forward, which wasn't interesting to watch, and learning between runs was too noisy (the same playbook scored 7 to 32). Slices 1–3 stay as history; slices 4–8 are rewritten for the shooter. Scope, PRD and spec rewritten and approved ("Jevaga, you derive the sprites, go build it").
- Slice 4 also brought in the fight descriptions for Jev and the four-move/plan interface from slice 5, and retired the frog coach (lesson route, coach memory, lesson test, simulator) from slice 6: the old files no longer compiled against the shooter, and keeping the project building mattered more than slice boundaries. Slice 5 adds the plan test and a new simulator; slice 6 adds the live planner.
- The plan test's third check measures how far a plan shifts Jev rather than requiring a plan to override survival — with "ignore bullets and keep firing", Jev's chance of firing under a bullet rose from 0.04 to 0.24 but it still dodged, because its fixed instructions put staying alive first. That's the behavior the game wants.
- Nemotron's plans are strategy (which columns to work, what to shoot first, what to avoid), never step-by-step orders, and Jev's instructions state the survival rule outright — with step-by-step plans ("stay in column 4 and fire"), live planning halved Jev's score (~925 vs ~1,950 fixed) because the orders were stale within a second and Jev stopped dodging. With strategic plans, seed 5 over 4 runs each: fixed plan ~1,150 (8–14 s), live plans ~3,125 (17–51 s, two runs cleared wave 1).
- The ship now glides continuously instead of stepping between columns, after Matt said held keys still "snap to a grid". Jev's scores fell from about 3,100 to 900 until its moves matched their descriptions: each glide lasts a quarter-second, threats are checked along the path, divers stop turning 4 rows above the ship, and Nemotron's plans avoid the word "stay". Six live runs on seed 5 now average 4,500.
- Slice 7 took its sprites from Matt's "Jevaga sprites" design canvas instead of deriving them. The canvas's Grids board is copied into `lib/game/sprites.ts` by script, and its In motion board sets the frame timings. The panel follows `design-handoff.md` with three changes. The green window and the green START/YOU PLAY fills are darker, so white and green text pass 4.5:1 contrast. Ligatures are off, because Pixelify Sans turned "fi" into a glyph that reads as "A". The mode switch uses pressed buttons instead of radios, so the arrow keys keep flying the ship.
