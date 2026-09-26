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

- [x] **8. A death can be replayed, and a written rule can change how it ends**
  Becomes usable: `pnpm replay-test` rebuilds a real death from the flight recorder, shows it replays to the same hit with Jev's own answers, and shows a hand-written rule turning it into a survival (and the same death without the rule still dying). `pnpm world-check` proves a cloned world plays out identically.
  Why now: The whole learning loop rests on two things nobody has checked yet: that a death can be rebuilt exactly, and that a rule can flip its outcome on replay. Like slice 1, it is a technical slice allowed because it proves the critical risk and leaves runnable evidence before any panel work.
  PRD ref: `prd.md > Jev learns from its deaths (System 2)`
  Spec ref: `spec.md > The fight` (randomness, hits), `spec.md > The flight recorder`, `spec.md > The replay`, `spec.md > Jev flies (System 1)`
  Build: move the random state into `world.rngState`; `world.hitBy`; `DecideInput.rules` and `instructionsFor(rules)` (starting line only, no survival rule); `onAsk` hook in `driveWithJev`; `lib/learn/recorder.ts` (with control moments); `lib/learn/replay.ts` (`replay`, `playback`, the end-of-replay threat check, the shared 4-a-second limiter); `scripts/replay-test.ts` records a live headless Jev run until it dies, then replays it three ways; determinism checks in `world-check.ts`.
  Verify (mechanical): `pnpm world-check` passes, including "a cloned world plays out the same with the same moves"; `pnpm replay-test` on seed 5: every recorded death retraces to the exact step with Jev's own answers and dies again when Jev is asked again, and for at least one of them a hand-written rule makes the replay survive; `tsc` and lint clean.
  Learner check: Run `pnpm replay-test` and read one death: what Jev read before it, what it picked, and whether the rule changed the pick and the outcome.
  Commit: `Record and replay Jev's deaths`

- [x] **9. Jev learns from its deaths**
  Becomes usable: Press Start in Jev mode with an empty rulebook. After each death the COACH window shows Nemotron studying it, what happened and the rule it wrote; the rule is tested on the replay and on every earlier fixed death, and kept or thrown out; the RULEBOOK grows; RUNS shows the rules each run had; Forget rules starts over. `pnpm learn -- 5 12` does the same headless and prints the learning curve.
  Why now: This is the kernel, and it needs slice 8's replay.
  PRD ref: `prd.md > Jev learns from its deaths (System 2)`, `prd.md > The Core Journey`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > The coach (System 2)`, `spec.md > The judge`, `spec.md > Panel and playfield`, `spec.md > Data Model`
  Build: `lib/system2/coach.ts`, `app/api/coach/route.ts`, `lib/learn/judge.ts`; the between-runs steps in `Game.tsx`; COACH window (with its tags), RULEBOOK window with the fresh-rule flash, RUNS rule count, Forget rules; `scripts/learn.ts`; retire `drivePlanner`, `lib/system2/planner.ts`, `app/api/plan`, `scripts/plan-test.ts` and the NEMOTRON plan window; `sim.ts` takes a rulebook file.
  Verify (mechanical): `curl /api/coach` with a saved death returns the three lines; `pnpm learn -- 5 12` from an empty rulebook ends with at least 3 kept rules, every kept rule's replay survived, every fixed death still survives a replay with the final rulebook, and Jev still fires in the control moments; it prints score, kills and rule count per run (read, not gated: one run is mostly luck); in the browser pane the windows update through a few runs with no console errors; after Forget rules the RULEBOOK reads "Empty. Jev starts on reflexes alone." and the next death reports 0 earlier deaths tested; `pnpm build` passes.
  Learner check: Start from an empty rulebook and watch five or six runs. Do the rules read like sensible lessons from the deaths you just saw, and does Jev last longer?
  Commit: `Jev learns a rule from each death`

- [x] **10. The replay plays on the playfield**
  Becomes usable: Between runs the playfield replays the last seconds before the death with the tested rules, tagged REPLAY, ending on "REPLAY · SURVIVED" or "REPLAY · HIT"; then the next run starts.
  Why now: It is the moment the video needs, and it only makes sense once rules are being tested.
  PRD ref: `prd.md > Jev learns from its deaths (System 2)`, `prd.md > Look and Feel`
  Spec ref: `spec.md > The replay` (`playback`), `spec.md > Look and Feel`, `spec.md > Panel and playfield`
  Build: `GameCanvas` draws a playback world when one is given; REPLAY who-tag and the SURVIVED/HIT banner; `Game.tsx` plays it after the judge and before the next run; Stop cancels it.
  Verify (mechanical): in the browser pane a replay follows each death and ends with the banner that matches the judge's result; the playback's final ship position matches the tested replay's (logged); no console errors.
  Learner check: Watch a death, then its replay. Can you see what the rule made Jev do differently?
  Commit: `Show each death's replay on the playfield`

- [x] **11. Each enemy dives its own way, and Jev can tell them apart**
  Becomes usable: Drones rev and plunge down a marked column, Bats zigzag along a dotted line and commit at row 9, Cyclopes loop, park and fire aimed shots after a glow; each dive's path is drawn before it lands; formation volleys follow each kind's habit; Jev reads the enemy's name in every threat.
  Why now: Everything else in the enemy design builds on the dives, and the coach can only write enemy-specific rules once deaths name an enemy.
  PRD ref: `prd.md > The fight`
  Spec ref: `spec.md > Enemies, carriers and waves`, `spec.md > Predicting hits`, `spec.md > Describing the fight to Jev`, `enemy-design.md` sections 2, 4 and 5
  Build: dive plans in `lib/game/enemies.ts`; formation habits; `threatOnPath` as a frozen-launch simulation on a world copy, reporting the kind; describe lines per enemy; path lines, bat commit arrow and cyclops glow on the canvas; world-check cases per kind.
  Verify (mechanical): `pnpm world-check` passes with new cases (each dive follows its plan, prediction matches the real fight on 40 fights, a replay of a death still retraces exactly); `pnpm replay-test` still passes; `pnpm sim -- 5 3` runs with Jev naming enemies; browser pane shows the three dives with their path lines and no console errors.
  Learner check: Play a wave in You mode. Can you tell the three enemies apart by how they attack, and does every attack show itself before it lands?
  Commit: `Each enemy kind dives its own way`

- [x] **12. Every wave flies in, and the Cyclops takes two hits**
  Becomes usable: each wave starts empty; three groups of 7 swoop in single file along paths drawn 1 s ahead, dip to row 9 and climb to their slots; from wave 2 Bats and Cyclopes fire on the way in; dives and volleys wait until the formation is in place. A Cyclops's first hit shuts its eye and the second kills it. Jev reads the fly-in and "hit once, one more shot kills it".
  Why now: It changes the first seconds of every run and every replay, so it goes in before carriers, the saved learning run and the video. Matt, 2026-09-26.
  PRD ref: `prd.md > The fight`
  Spec ref: `spec.md > Enemies, carriers and waves`, `enemy-design.md` sections 2 (Cyclops) and 3
  Build: entry paths and the `enter`/`settle` phases in `lib/game/world.ts`; hold dives and volleys during the fly-in; entry firing from wave 2; `hp` and the eye-shut Cyclops; fly-in path lines and the shut eye in `lib/game/render.ts`; describe lines; world-check cases.
  Verify (mechanical): `pnpm world-check` passes with new cases (every enemy reaches its slot, nothing dives or volleys before the formation is in place, the entry never goes below row 9, wave 1 entry never fires and wave 2 does, a Cyclops needs two hits, prediction still matches the real fight, replays still retrace exactly); `pnpm sim -- 5 3` runs; browser pane shows a fly-in with its path lines and no console errors.
  Learner check: Start a run. Does the fly-in look and feel like Galaga's, and can you tell a Cyclops you've hit once?
  Commit: `Every wave flies in; the Cyclops takes two hits`

- [x] **13. The fight has sound**
  Becomes usable: retro sound effects made in code with the browser's Web Audio API: your shot, enemy pops by kind, the Cyclops's tink when its eye shuts, the ship's explosion, a Drone's rev, a Bat's commit chirp, the Cyclops's rising glow and zap, Bat bullets, a swoop for each fly-in group, a jingle at the start of each wave, a rewind when a death replays, and a chime or buzz for a kept or rejected rule. A SOUND button and the M key mute it, remembered in this browser.
  Why now: Matt, 2026-09-26: "we should also consider adding a sound effects to the game." Before carriers, so the saved learning run and the video have it.
  PRD ref: `prd.md > Sound`
  Spec ref: `spec.md > Sound`
  Build: `lib/game/cues.ts` (pure: turns frame-to-frame changes in the world into cues, no engine changes); `lib/game/sound.ts` (the synth voices and mute); hook the cues into `components/GameCanvas.tsx`, the verdict sounds into `components/Game.tsx`, the button into `components/Panel.tsx`.
  Verify (mechanical): `pnpm world-check` passes with cue cases (a scripted fight yields one shot cue per shot fired, one pop per kill, a tink per first Cyclops hit, one boom at the hit, three swoops per fly-in, a rev per Drone dive, and nothing when the world is only swapped for a replay); every voice renders to a non-silent buffer through an OfflineAudioContext in the browser pane with no console errors; replays still retrace exactly.
  Learner check: Play a wave with sound on. Do the sounds help you read the fight, and is anything annoying enough to change?
  Commit: `Add sound effects`

- [ ] **14. Carriers, weapons and pickups**
  Becomes usable: a carrier of each kind uses its weapon (Wingmen, Fan, Eye Beam); shooting it drops the weapon to your row; gliding onto it gives it to you until the wave ends; Jev reads carriers, pickups and the weapon it holds.
  Why now: Needs the dives from slice 11 and the fly-in from slice 12, and gets sounds for its weapons from slice 13; the beam needs `threatOnPath` to handle a hazard that lasts.
  PRD ref: `prd.md > The fight`
  Spec ref: `spec.md > Enemies, carriers and waves`, `enemy-design.md` section 2 (weapons, carriers and pickups)
  Build: carrier selection, the three weapons both ways, pickup fall/wait/fade, player weapon state, sprites for icons and tokens (Matt's canvas or derived), describe lines.
  Verify (mechanical): world-check cases for each weapon both ways and for pickups; a replay with a weapon in play retraces exactly; browser pane shows a carrier dropping its weapon and the ship using it.
  Learner check: Shoot a carrier, grab its weapon, and use it. Does it feel worth going for early?
  Commit: `Carriers drop weapons you can use`

- [ ] **15. Waves escalate**
  Becomes usable: waves 1 to 6 follow the table in `enemy-design.md` (kinds, divers at once, speed, carriers, escorts, mirrored Drone pairs, fly-in entry), and the swarm rule kicks in when few enemies are left.
  Why now: Needs every kind and weapon in place.
  PRD ref: `prd.md > The fight`
  Spec ref: `spec.md > Enemies, carriers and waves`, `enemy-design.md` section 3
  Build: the wave table, escorts, mirrored pairs, fly-in paths, swarm; describe lines for escorts and the swarm.
  Verify (mechanical): world-check steps through waves 1 to 7 and checks each row of the table; sim reaches wave 3+ with rules from a learning run.
  Learner check: Play to wave 4. Does it get harder in ways you can read?
  Commit: `Waves escalate like Galaga`

- [ ] **16. The Enemy Library**
  Becomes usable: a LIBRARY screen from the panel with a page per enemy (sprites, name, lore, attack, weapon, spot it coming, first seen).
  Why now: The content is settled in `enemy-design.md`; it's quick once the enemies behave as described.
  PRD ref: `prd.md > Enemy Library`
  Spec ref: `spec.md > Enemy Library`
  Build: `components/Library.tsx`, the copy from `enemy-design.md`, sprites drawn from `lib/game/sprites.ts`.
  Verify (mechanical): browser pane opens each page, text matches `enemy-design.md`, no em dashes, no console errors.
  Learner check: Open the library. Do the pages make you want to meet these enemies?
  Commit: `Add the Enemy Library`

- [ ] **17. It fails honestly and can run offline**
  Becomes usable: Outage states verified end to end, including during replays; `SYSTEM1=fake` flies with the SIMULATED badge; README explains setup and how Jev and Nemotron are each used; `.env.example` complete.
  Why now: Makes the live URL safe to leave up through judging.
  PRD ref: `prd.md > States and Boundaries`
  Spec ref: `spec.md > Important Failure Modes`, `spec.md > Where It Runs and How Someone Tries It`
  Build: fake adapted to four moves and to the rulebook; README; `.env.example`.
  Verify (mechanical): wrong gateway key → "Jev unavailable" and no start; Jev failing mid-replay → "couldn't test the rule" and the rule isn't kept; wrong Nebius key → no rule, rulebook unchanged, next run starts; `SYSTEM1=fake` shows SIMULATED; restore keys, normal run.
  Learner check: Set `SYSTEM1=fake`, restart, press Start, check SIMULATED is obvious; set it back.
  Commit: `Handle model failures and add offline mode`

## Hands-on Checkpoints

- [x] Early usable behavior explored: after slice 3 (frog game). Matt's feedback led to real time, keyboard play, the continuous rebuild, the paid gateway tier, and finally the switch to Jevaga.
- [x] Jevaga early check: after slices 6 and 7. Matt tried both modes ("it seems to be working pretty well"), asked for continuous steering (rebuilt), and questioned what the live coach adds, which led to the learning-from-deaths redesign.
- [ ] Learning check: after slice 9, when Jev learns rules from its deaths
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
- Nemotron now learns from Jev's deaths instead of planning live, and Jev starts with no hand-written survival rule. Matt, 2026-09-27, after seeing that the live planner gave the same advice in the same situation and never learned: "we start off with just a dumb… Jev… the LLM then comes in, analyzes what went wrong in that fail state, writes an instruction to recognize that particular state." Rules are proven on a replay of the death and on every earlier fixed death, not judged by the next run's score, which the frog game showed is mostly luck. Scope, PRD and spec revised; slices 8 to 10 added for the recorder and replay, the learning loop, and the on-screen replay; the old slice 8 becomes slice 11.
- Replays follow the live run's own timing instead of a fixed 0.27 s latency. At a fixed latency 0 of 5 real deaths happened again: moving every answer a few milliseconds changes what Jev sees from the first question, and the fight goes another way. The live game now steps its physics in whole 20 ms steps like the replay, and the recorder notes the exact step of each question and answer; on that schedule 5 of 5 deaths retraced exactly and a hand-written rule saved all 5. The live planner's files (planner, plan route, plan test, the NEMOTRON window) were retired in slice 8 instead of 9, because Jev's input changed from a plan to a rulebook and they no longer compiled.
- The slice 8 review found that questions without an answer broke exact replays: a slow answer the hit beat was applied 0.28 s after its question even when the live hit came later, and questions lost to an outage stayed in the recording. Deaths now record the step of the hit; an unanswered question's move never lands before it; a failed question is dropped; and a replay asks nothing between the last recorded question and the hit. `world-check` covers a slow flight with an outage offline, and `replay-test` answers "left" to the unanswered last question to prove it can't matter.
- The coach's first prompt wrote rules tied to one death or wrong about the game, and the one rule it kept made Jev worse. Added `scripts/coach-bench.ts` to score coach variants on the same saved deaths: how often a rule saves its own death, and how many other deaths it also saves. A prompt that explains what hits the ship, plus a hindsight line per moment, brought the coach close to the hand-written rule (each rule saved 5.1 of 7 other deaths on average, the reference 6 of 8). Nemotron's thinking mode did worse and stays off.
- Added a USAGE window and the matching totals in the headless scripts, showing what Jev and Nemotron have used and cost this session, at Matt's request for the demo video.
- An enemy design pass was added before the saved learning run and the video (Matt, 2026-09-26: "they all do the exact same thing... what makes it fun is that all the different enemies have their own different attack patterns"). Researched Galaga and its series, fact-checked, and settled on the "Jevaga enemy design" canvas with an Enemy Library in a playful sci-fi tone; the result is `devpost/enemy-design.md`. Slices 11 to 14 build it; honest failures and offline mode move to slice 15.
- Slice 11: the dive code stayed in `lib/game/world.ts` instead of a new `enemies.ts`, because the dives need the world's constants at load time and a split would be a circular import. Prediction is now a copy of the fight stepped forward with no new launches, so it names what hits ("Drone in 0.6 s", "Cyclops shot in 0.4 s") and matched the real fight on 47 of 47 test fights. One attack at a time for now (the wave table in slice 14 raises it). Dumb Jev now lasts 10 to 35 s on seed 5 and dies mostly to Cyclops shots: half the formation volleys are aimed at the ship. A reflex that moves when anything is under 1 s away survives a median 38 s, so the aimed shots are learnable, and they're what the coach has to teach first.
- A fly-in at the start of every wave and a two-hit Cyclops were added as slice 12, ahead of carriers (Matt, 2026-09-26: "they come in from the top and... formation on like an initial attack", and "stronger ones that took more than one hit"). The earlier plan had the formation already in place on wave 1, the fly-in only from wave 3 and on the cut list, and one-hit Cyclopes. Carriers, waves, the Enemy Library and honest failures move to slices 13 to 16.
- Slice 12: the fly-in takes 7.9 s from wave start to the last enemy in its slot, and the fight starts 1 s later. Building it turned up a scoring bug from slice 11: an enemy was marked dead before its points were counted, so every diving kill paid formation points. Fixed; a diving Cyclops now pays 400.
- Review of slices 11 and 12 (four finders, a skeptic per dimension): three real defects fixed. A Cyclops at an end slot could loop 0.7 columns off the field; its loop now swings to one side, away from the edge. A revving Drone's arrival time ignored the formation's drift during the rev (off by up to 0.2 s), and every "reaching your row" time now counts to when the enemy can hit, matching the "Drone in 0.6 s" numbers. Describing the fight cost 7 to 13 ms per ask during the fly-in; one ask now shares its three predictions and skips the simulation when nothing can reach the ship, which brings it to 0.1 ms in wave 1 and 3 ms in wave 2. Two findings were rejected: the Bat's edge guard is deliberate, and a charging Cyclops with a shut eye is meant to show both.
- Sound effects added as slice 13, before carriers (Matt, 2026-09-26: "we should also consider adding a sound effects to the game"; on where it goes: "Whatever you think"). Synthesized in code, so there are no audio files and no paid generation, and the video can render the same sounds. Carriers, waves, the Enemy Library and honest failures move to slices 14 to 17.
- Slice 13: 17 voices, each checked non-silent through an OfflineAudioContext in the browser pane. Cues are read off the world each animation frame, so a hidden tab (which pauses frames) can miss short sounds; that's fine, since nobody hears a hidden tab. The dev build exposes `jevagaSound` in the console to render or check a voice.

