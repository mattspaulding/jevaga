---
doc: prd
status: approved
---

# Go Frog Go: Product Requirements

A 16-bit pixel-art endless road-crossing game in the browser. A frog is played by a fast decision model (Jev) that starts knowing only "jump forward," and a reasoning LLM (Nemotron) teaches it after every death. Built for developers curious about Jev-style "System One" models, and for Matt, who wants to learn how they work under an LLM.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
Source: `scope.md > The Core Loop`.

1. The viewer opens the page. The game sits on the left, the frog on the starting grass. The right panel shows a playbook with one line, "1. Jump forward," and "Run 1".
2. They press **Start**. The frog begins moving up the road on its own, one hop per beat.
3. Each beat, the right panel shows Jev's pick and confidence, e.g. `forward 0.97`, with a bar.
4. In run 1 the frog follows its only instruction and hops straight into traffic. The run ends and its distance is added to the run history.
5. The coach panel shows "thinking…" while Nemotron reads the moves before the hit and what hit the frog. It writes one short lesson, which appears in the playbook, numbered.
6. The next run starts automatically after a short pause. Jev plays with the whole playbook.
7. Runs continue until the viewer presses **Stop**. Success is visible in two places: the playbook growing, and distances climbing across runs.

## Screens and Layout
- **Who plays** (added during `5-build`): a switch between "Jev plays" and "You play". You play with arrow keys or WASD on the same clock; no key that beat means the frog waits. The coach and playbook are Jev's; your runs are listed as "you".
One screen, split in two (layout B).

- **Left, about half the width: the game.** Top-down view. The road scrolls upward as the frog advances, so it never runs out. Distance counter in the corner.
- **Right: inside its head.** Top to bottom:
  - **Decision:** Jev's current pick, with its confidence as a number and a bar.
  - **Coach:** idle during a run, "thinking…" after a death, then "new lesson."
  - **Playbook:** numbered lessons, starting with "1. Jump forward." Newest at the bottom, briefly highlighted when it arrives.
  - **Runs:** each run's number and distance, best highlighted.
- **Controls:** Start / Stop.

## Look and Feel
Source: `scope.md > Inspiration & Identity`. Matt picked style B and the frog from a live sample.

- 16-bit SNES-era pixel art: rich palette, dark sprite outlines, shaded lower edges, textured two-tone grass.
- Frog player character. Cars in several colors on dark asphalt with yellow dashed lane lines. Trees on grass strips.
- Crossy Road's endless hopping with Frogger's close calls: cars glide smoothly across the screen and the frog hops the instant you press. Original sprites and name only.
- The right panel matches: 16-bit RPG-style windows (a white bevelled frame over a banded fill tinted per model: Jev blue, Nemotron purple, you green), Pixelify Sans text with Jersey 20 numbers, gold for the chosen move and the best run. A tag on the game says who has the frog (YOU / JEV). Settled on the design canvas 2026-09-26; every value is in `design-handoff.md`.

## Features and Behavior

### Endless road
- Lanes are generated ahead of the frog forever: grass strips and runs of road lanes, cars at varied speeds and directions.
- The frog moves on a grid: forward, left, right, back, or wait.
- [ ] Pressing Start sends the frog up the road with no human input.
- [ ] The road keeps generating; there is no finish line.
- [ ] A car touching the frog ends the run.

### Fast decisions (System 1)
Source: `scope.md > The POC Boundary`.
- Each beat, Jev is asked which of the five moves to make, given the nearby lanes, the cars in them, and the playbook.
- It answers with a move and a confidence. Jev makes every move in every run.
- Jev is reached through a swappable adapter; an offline stand-in (labeled SIMULATED) uses the same shape for building without a key.
- [ ] Every hop shows its move and confidence in the Decision panel.
- [ ] With only "jump forward" in the playbook, the frog hops forward into traffic.

### Coach lessons (System 2)
Source: `scope.md > The Unique Kernel`.
- The coach never moves the frog. It only teaches, and only after a death.
- After a hit, Nemotron sees the last several moves and what hit the frog, and writes one lesson of a sentence or less.
- The lesson joins the playbook, and Jev plays every later run with the whole playbook.
- [ ] A new numbered lesson appears after each death.
- [ ] Lessons are specific to what happened ("wait when a car is two tiles away in the next lane"), not generic.
- [ ] The run after a lesson visibly handles the situation that caused the last death.

### Run history
- [ ] Each run's distance is listed; the best run is highlighted.
- [ ] Over a demo of several runs, later distances are clearly higher than run 1.

## States and Boundaries
- **Before Start:** frog on the starting grass, playbook with "1. Jump forward," "Run 1", Start button.
- **Coach thinking:** between runs, after a death. If the coach errors or takes too long, the next run starts without a new lesson and the panel says so.
- **Model unavailable:** if Jev can't be reached, the game doesn't start and the panel says which model is down. Nothing pretends to play.
- **Stalled:** if the frog makes no forward progress for 15 beats, the run ends as a timeout and the coach teaches from it like a death. *(Added during `4-spec`, approved by Matt.)*
- **Stopped:** the current run ends; playbook and history stay on screen.
- **Reload:** everything resets to "jump forward." Nothing is saved between visits.

## Product Decisions
- Named **Go Frog Go** by Matt (2026-09-25). The project lives in `Strawberry/GoFrogGo` and deploys under the Strawberry Digital Vercel team.
- Start from nothing. The playbook begins as "jump forward" so run 1 dies and the coach builds instructions from real deaths. Matt: "then over time after run after run, it gets better and better."
- Coach teaches only after deaths; no mid-run takeover. Matt chose this so the early runs actually fail and the learning is visible. This revised the scope's kernel.
- Layout B, game left and thinking right, so the viewer sees the model's decisions and the playbook next to the frog.
- 16-bit style and the frog. Matt picked both from a live sample.
- Real time for everyone: the world never waits for a decision. If Jev hasn't answered by the next tick, the frog waits that beat, and the panel counts it. Matt: "it has to be real time… That's the whole point of using Jev." An outage (an error, not slowness) pauses the clock instead.
- Built on Jev. Matt chose Jev or nothing, with no fallback model; Jev turned out to be available through Vercel AI Gateway without the waitlist. *(Updated during `4-spec`; the PRD first planned CLM-8B behind a Jev-shaped adapter.)*

**Assumptions to confirm in review:**
- Runs restart automatically until Stop, so a demo video can be one continuous take.
- Nothing persists between page loads.

## What We're Building
One screen with the endless road game, the frog run by Jev starting from "jump forward," a lesson from Nemotron after each death, and the four-part right panel. Enough to record a video where the playbook grows and distance climbs across runs.

## Deferred From the POC
- **Hosted public URL and open-source license.** Nebius needs these by Oct 30; Basics doesn't. Do them after Basics closes Oct 26.
- **Saving the playbook between visits.** Would mean storage; a reload reset is fine for a demo.

## Possible Later Enhancements
- Race Jev against another System One model (such as the open CLM-8B) on the same road, with the same playbook.
- Rivers, logs and trains, so old lessons stop being enough.
- Race: you and Jev on the same road at the same time.
- Sound and music.
- Let the coach step in mid-run once the playbook is mature.

## Non-Goals
- Any Nintendo, Crossy Road or Tetris names or art: third-party IP.
- Reading the game from pixels: the game hands its state to Jev directly.
- Training or fine-tuning a model: the frog improves through the playbook, not weights.
- Raspberry Pi hardware.

## Open Questions
- **How fast Jev answers.** Measured in build step 1; the game waits for each move, so speed changes pacing, not correctness.
- **Whether lessons alone move the distance enough.** Can only be answered by building it. If the playbook stops helping after a few lessons, that's a finding for the video, not a failure.
