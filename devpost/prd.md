---
doc: prd
status: approved
---

# Jevaga: Product Requirements

A Galaga-style shooter in the browser. Jev flies the ship in real time; NVIDIA Nemotron on Nebius writes the plan it follows. You can fly it too. For developers curious about Jev-style "System One" models, and for Matt, who wants to learn how they work under an LLM.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

*(Replaces the Go Frog Go PRD on 2026-09-26; see `scope.md`.)*

## The Core Journey
Source: `scope.md > The Core Loop`.

1. The viewer opens the page. The playfield is on the left: stars, the enemy formation at the top, the ship at the bottom. The panel is on the right, with a Who plays switch (Jev plays / You play) and Start.
2. **Jev plays** (default). They press Start. The formation starts drifting; the ship begins moving on its own.
3. About four times a second the JEV window shows Jev's move (left, right, stay, fire), its confidence, all four probabilities, and how long the answer took.
4. Every few seconds the NEMOTRON window shows a new plan, one or two sentences, with how many seconds ago it was written. Jev's next moves follow it.
5. An enemy breaks formation and dives, firing. Jev dodges or doesn't. Shots that hit enemies score.
6. A bullet or a diver hits the ship. The run ends, a HIT banner shows, the run joins the RUNS list with its score, and after a short pause the next run starts. Runs continue until Stop.
7. **You play**: switch, press Start, and fly with ← → (or A D) and Space to fire. One run per Start.

## Screens and Layout
One screen, as on the design canvas.
- **Left: the playfield**, 9 columns wide. The ship slides between columns along the bottom row. HUD: score, and a tag saying who's flying (YOU / JEV).
- **Right: the panel**, top to bottom:
  - **Who plays** switch.
  - Jev mode: **JEV** window (move, confidence meter, four probability bars, answer time), **NEMOTRON** window (current plan and its age), **RUNS** list.
  - You mode: **YOU** window (last key, key legend), **RUNS** list.
  - **Controls**: Start / Stop. A status chip by the title shows outages.

## Look and Feel
Source: `scope.md > Inspiration & Identity`, `design-handoff.md`.
- The panel is exactly the design-canvas panel: 16-bit RPG windows tinted per player (Jev blue, Nemotron purple, you green), Pixelify Sans and Jersey 20, gold for the chosen move and the best run, the banded navy page. All values in `design-handoff.md`.
- The playfield is 16-bit SNES-era pixel art on a dark starfield: a player ship, two or three enemy types in the formation, a distinct look for a diver, player shots and enemy bullets that read clearly at a glance, a small explosion. Original designs only. Derived by the build from the handoff palette and sprite style (Matt, 2026-09-26: "you derive the sprites"); the frog-game grids in `design-handoff.md` no longer apply.

## Features and Behavior

### The fight
- A formation of enemies (3 rows) drifts left and right across the top.
- Every few seconds an enemy breaks off and dives toward the ship's column, firing one or two bullets on the way down. Divers that miss fly off the bottom and return to the formation.
- The ship sits on the bottom row and slides one column per move. It fires straight up; there's a short reload between shots.
- A shot that reaches an enemy destroys it: 100 points, 200 for a diver. A cleared formation brings a new one.
- [ ] Enemies drift, dive and fire without any input.
- [ ] A shot destroys the enemy it reaches; the score goes up.
- [ ] A bullet or diver touching the ship ends the run.

### Jev flies (System 1)
- About four times a second, Jev reads the screen as text and chooses left, right, stay or fire, with a probability for each.
- The screen keeps moving while Jev thinks; its move is applied the instant the answer lands.
- The plan from Nemotron is Jev's instructions.
- [ ] Every Jev move shows its choice, confidence, four probabilities and answer time.
- [ ] Jev uses all four moves in a normal run, not only fire.

### Nemotron plans (System 2)
- Every few seconds, Nemotron reads the whole fight (formation, divers, bullets, the ship, score) and writes a plan of one or two sentences in the game's own words.
- The plan replaces Jev's instructions immediately.
- [ ] A new plan appears every few seconds during a run, with its age.
- [ ] When a plan says to dodge or move somewhere, Jev's next moves visibly follow it.

### You fly
- ← → or A D slide the ship; Space fires. Same rules and speed as Jev.
- [ ] Keys act instantly.

### Runs
- [ ] Each run is listed with who flew it and its score; the best is marked.

## States and Boundaries
- **Before Start:** formation shown still, ship at the bottom center, empty run list.
- **Jev unavailable:** the game doesn't start, or pauses mid-run, and the chip by the title says so. Nothing pretends to play.
- **Nemotron unavailable or slow:** Jev keeps flying on the last plan (or the starting plan), and the Nemotron window says the plan is stale.
- **Stopped:** the run ends; the run list stays.
- **Reload:** everything resets.

## Product Decisions
- Galaga-style shooter instead of the frog game (Matt, 2026-09-26). Named **Jevaga** by Matt (he weighed "Jeviga" first; Jevaga makes the Galaga link obvious, so the art, name styling and wording must stay clearly original).
- Nemotron is a live strategist, not a between-runs teacher (Matt picked this direction after learning between runs proved too noisy).
- Real time for everyone, carried over: the game never waits for a decision.
- Keyboard play, carried over.
- The design-canvas panel, carried over; new space sprites to be drawn on the canvas.
- Jev through Vercel AI Gateway on the paid tier, about four decisions a second.

**Assumptions, approved with the PRD (Matt: "go build it"):**
- One hit ends a run (no lives yet).
- Plans every ~3 seconds.
- Moves are left, right, stay, fire (no move-and-fire in one decision).

## What We're Building
One screen: the shooter, Jev flying it in real time, Nemotron's live plans, keyboard play, the run list, and the design-canvas look.

## Deferred From the POC
- **Hosted URL and license** for Nebius (after Basics closes Oct 26).
- **Saving scores** between visits.

## Possible Later Enhancements
- Waves that speed up, lives, power-ups.
- You vs Jev side by side on the same wave.
- A short Nemotron recap after each run.
- Sound.

## Non-Goals
- Galaga's name, art or sounds.
- Reading the game from pixels.
- Training or fine-tuning a model.

## Open Questions
- **Folder and repo name**: the project folder is still `GoFrogGo`.
