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

- [ ] **3. The coach teaches after every run and the frog gets better**
  Becomes usable: When a run ends, the Coach box shows Nemotron thinking, then "What happened" and a new rule; the rule appears in the numbered playbook, and the next run replays the same road with the whole playbook. Runs continue until Stop, with distances listed and the best starred.
  Why now: This is the kernel. It comes as soon as there is a run to learn from, so the most important part gets the most time to tune.
  PRD ref: `prd.md > The Core Journey` (steps 5-7), `prd.md > Coach lessons (System 2)`, `prd.md > Run history`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Coach lessons (System 2)`, `spec.md > Panel`, `spec.md > Data Model`, `spec.md > The Core Journey Through the System`
  Build: `app/api/lesson/route.ts` (15 s timeout, failure path). Wire run end → lesson → playbook append → 1.5 s pause → same seed, beat reset → next run. CoachBox, Playbook (newest flashes) and full RunHistory (timeout marker, best starred, seed shown). Stop keeps playbook and history.
  Verify (mechanical): `curl` `/api/lesson` with a sample death and get both lines; in the browser pane, run at least 4 runs on a seed where "Jump forward" dies in the first two road lanes, and confirm by reading the page that a numbered rule appears after each run and that at least one later run beats run 1's distance.
  Learner check: Press Start and let it run for four or five runs. Watch run 1 die, read the coach's rule, and see whether the next run handles that spot. Does the playbook read like real lessons, and does the distance climb?
  Commit: `Coach writes lessons and runs replay with the playbook`

- [ ] **4. It looks like a 16-bit game**
  Becomes usable: The road, cars, trees and frog are outlined, shaded 16×16 pixel sprites in the style-B palette you picked; the panel uses Press Start 2P headings and names each model ("JEV · via Vercel AI Gateway", "NEMOTRON · Nebius Token Factory"); hits show a splat and new rules flash.
  Why now: The look matters for the video, but it's safest after the behavior works, so styling never hides a logic bug.
  PRD ref: `prd.md > Look and Feel`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Look and Feel`, `spec.md > Game canvas`, `spec.md > Panel`
  Build: `lib/game/sprites.ts` (frog, cars in four colors and two lengths, tree, grass texture) with outline and bottom-row shading; update `render.ts`; fonts via `next/font/google`; palette tokens in `app/globals.css`; panel styling, model labels, splat and flash.
  Verify (mechanical): `pnpm build` passes; screenshot the running game in the browser pane and check it against the palette and sprite rules; the page text contains both model labels; no console errors.
  Learner check: Open the game and compare it with the style-B sample you picked. Does it feel like the same game, and does the frog read clearly as a frog?
  Commit: `Add 16-bit sprites and styled panel`

- [ ] **5. It fails honestly and can run offline**
  Becomes usable: If Jev is down, Start shows "Jev unavailable" and the game doesn't start; mid-run it pauses and retries every 3 seconds; a failed lesson says so and the next run starts with the playbook unchanged. `SYSTEM1=fake` plays with the SIMULATED badge. A README explains setup and how each model is used.
  Why now: The main path is proven, so this makes the demo URL safe to leave running through judging and makes offline work possible, without touching the kernel.
  PRD ref: `prd.md > States and Boundaries`
  Spec ref: `spec.md > Important Failure Modes`, `spec.md > Fast decisions (System 1)`, `spec.md > Where It Runs and How Someone Tries It`
  Build: Error and retry states in the loop and panel; lesson failure path in the UI; SIMULATED badge; README with setup, run steps and a plain account of Jev and Nemotron; `.env.example` complete.
  Verify (mechanical): Run with a deliberately wrong `AI_GATEWAY_API_KEY` and confirm the page shows "Jev unavailable" and does not start; run with a wrong `NEBIUS_API_KEY` and confirm the lesson failure message and that the next run starts; run with `SYSTEM1=fake` and confirm the SIMULATED badge; restore keys and confirm a normal run.
  Learner check: Set `SYSTEM1=fake` in `.env.local`, restart, press Start, and check the SIMULATED badge is obvious. Then set it back to `jev`.
  Commit: `Handle model failures and add offline mode`

## Hands-on Checkpoints

- [ ] Early usable behavior explored: after slice 3, when the frog learns from the coach (the point where feedback can still reshape the kernel and the look)
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
