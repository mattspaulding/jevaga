---
doc: scope
status: approved
---

# Jevaga

A Galaga-style space shooter in the browser, played in real time by Jev while NVIDIA Nemotron on Nebius calls the strategy. You can play it yourself too.

*(Replaces "Go Frog Go" on 2026-09-26. The frog game worked, but Jev only ever waited or hopped forward, and learning between runs was too noisy to watch. Matt: "maybe Frogger is just a bad game example for this… Galaga would be better." Its history is in git.)*

## The Unique Kernel
You can watch System 2 steer System 1 in the middle of a fight. Nemotron reads the whole screen every few seconds and writes a short plan ("the diver on the left is the threat: slide right, then fire at it"). Jev makes every single move in real time, several a second, following that plan. The road never waits for either of them: a slow answer means the ship sat still.

## Who It's For
Developers who saw Jev playing games on YouTube and want to see what a "System One" model does under a reasoning LLM, in a game where the moves are easy to read. Also Matt, who wants to learn exactly that: "how Jev works in a whole system, like a type 2 LLM controlling Jev."

## The Core Loop
Press Start.
- A formation of enemies drifts across the top. Every few seconds one breaks off and dives at the ship, firing.
- About four times a second, Jev reads the screen (which bullets are falling toward which columns and when, which enemy is diving, what's above the ship) and picks one move: left, right, stay or fire.
- Every few seconds Nemotron reads the whole fight and rewrites Jev's plan. The panel shows the plan changing.
- One hit ends the run. Score is enemies destroyed; the run list shows how each run went.
- Switch to "You play" and fly the same game with the arrow keys and space.

## Inspiration & Identity
- Galaga and Galaxian: a drifting formation, swooping divers, a ship sliding along the bottom. Original name, sprites and wording only.
- The videos of Jev playing Super Mario and Super Smash Bros. that started this project.
- Look: 16-bit SNES era. The panel is the 16-bit RPG-window design already settled on the design canvas (`design-handoff.md`); the ship, enemies and bullets need new sprites in the same style.

## Why This Matters to the Learner
Matt came to learn Jev ("That's my whole point") and how it works under an LLM. Jev is reached through Vercel AI Gateway on the Strawberry Digital team's paid tier, which holds four decisions a second. The game has to be "actually interesting to look at in the video", which the frog game wasn't.

## What "Working" Looks Like
Jev plays a full run in real time: the ship dodges falling bullets, slides under enemies and shoots them, and the panel shows each move with its probabilities. Every few seconds the Nemotron window shows a new plan, and you can see Jev's moves change with it (for example, it stops firing and hugs the right edge when the plan says to dodge a diver). The "oh, that's cool" beat: a diver comes in, the plan changes, and Jev slips out of its line of fire.

## The POC Boundary
- One screen: the playfield on the left, the panel on the right (design canvas layout)
- A formation of enemies, divers that swoop and fire, enemy bullets, the player's ship and shots
- Moves: left, right, stay, fire; one hit ends a run; score and a run list
- Jev plays in real time (about 4 decisions a second), asked about the screen as it is and acting when its answer lands
- Nemotron on Nebius Token Factory writes a short plan every few seconds that becomes Jev's instructions
- You play the same game with the keyboard
- 16-bit look: design-canvas panel, new space sprites

## Later
- Waves that speed up, extra lives, power-ups
- Jev vs you on the same wave, side by side
- A post-run recap from Nemotron
- Sound

## Explicitly Cut
- The frog road-crossing game: Jev only waited or hopped forward, and learning between runs was too noisy to see (tested on 2026-09-25/26; 2 → 16 → 32 with one lesson, then no steady progress)
- Learning a playbook between runs (rules, rollback): replaced by live planning
- Real Galaga, Nintendo or Crossy Road names or art: third-party IP
- Reading the game from pixels: the game hands Jev its state as text
