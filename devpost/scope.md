---
doc: scope
status: approved
---

# Jevaga

A Galaga-style space shooter in the browser. Jev flies the ship in real time on reflexes alone. Every time it dies, NVIDIA Nemotron on Nebius studies the last second before the hit and writes Jev a rule, and the rule is only kept if it provably gets Jev through that exact moment. You can play it yourself too.

*(Replaces "Go Frog Go" on 2026-09-26. The frog game worked, but Jev only ever waited or hopped forward, and learning between runs was too noisy to watch. Matt: "maybe Frogger is just a bad game example for this… Galaga would be better." Its history is in git.)*

*(Revised 2026-09-27. Jevaga first shipped with Nemotron as a live strategist, rewriting Jev's plan every 3 seconds. That helped Jev score, but it gave the same advice every time it saw the same situation and never learned from a death. Matt: "we start off with just a dumb… Jev… that just makes reflexive decisions… the LLM then comes in, analyzes what went wrong in that fail state, writes an instruction to recognize that particular state." This version is built around that.)*

## The Unique Kernel
You can watch Jev get better at the game run after run, because an LLM studies each of its deaths and writes it a rule. The game saved the fight from just before the hit, so it replays that moment with the new rule and asks Jev again. The rule is kept only if Jev now survives the moment it died in, and still survives every earlier death it has learned from. Jev never pauses to think during a run. It flies on reflexes plus the rules it has earned.

## Who It's For
Developers who saw Jev playing games on YouTube and want to see what a "System One" model can do when a reasoning LLM coaches it, in a game where the moves are easy to read. Also Matt, who wants to learn exactly that: "how Jev works in a whole system, like a type 2 LLM controlling Jev."

## The Core Loop
Press Start.
- A formation of enemies drifts across the top. Every few seconds one breaks off and dives at the ship, firing.
- About four times a second, Jev reads the screen (what is falling toward the ship and when, which enemy is diving, what's above the ship) and picks one move: left, right, stay or fire. The first run, it knows nothing but "stay alive and shoot enemies."
- One hit ends the run. The game keeps the last second or so of the fight: what Jev read, what it picked, and what hit it.
- Nemotron reads that and writes one rule in the words Jev reads, or says the death couldn't have been avoided.
- The game replays the moment of the death with the new rule. The playfield shows the replay: this time the ship slips out of the way, or it doesn't. A rule that doesn't hold, or that breaks an earlier fix, is thrown out.
- The next run starts with the rulebook as it now stands. Jev gets past the old death and eventually finds a new one.
- The RUNS list shows the score climbing and how many rules each run had.
- Switch to "You play" and fly the same game with the arrow keys and space.

## Inspiration & Identity
- Galaga and Galaxian: a drifting formation, swooping divers, a ship gliding along the bottom. Original name, sprites and wording only.
- The videos of Jev playing Super Mario and Super Smash Bros. that started this project.
- Regression tests: every failure becomes a test case that every later fix has to pass.
- Look: 16-bit SNES era, from Matt's "Jevaga sprites" design canvas and the RPG-window panel in `design-handoff.md`.

## Why This Matters to the Learner
Matt came to learn Jev ("That's my whole point") and how it works under an LLM. The first version showed an LLM steering Jev in the moment. This one shows an LLM teaching it. A fast model makes every call, and a slower one studies its failures and rewrites its instructions. Matt sees the same pattern in other fields, anywhere a cheap fast model makes the calls and the failures can be replayed. Jev is reached through Vercel AI Gateway on the Strawberry Digital team's paid tier, which holds four decisions a second.

## What "Working" Looks Like
From an empty rulebook on a fixed seed, Jev dies early, then lasts longer run after run as rules pile up. Each rule was proven on the death that produced it. The "oh, that's cool" beat: the ship dies to a diver. The coach writes "If a diver is turning toward you and you are near the edge, glide toward the middle before it locks on." The replay plays on the playfield and the ship slides clear. The next run gets past that diver.

## The POC Boundary
- One screen: the playfield on the left, the panel on the right
- A formation of three enemy kinds, each with its own attack, its own weapon it can drop for you, and waves that escalate (`enemy-design.md`), plus an Enemy Library page for each
- Moves: left, right, stay, fire; one hit ends a run; score and a run list
- Jev flies in real time (about 4 decisions a second) with only its starting line and the rulebook as instructions (the rulebook opens with one fixed line: fire when nothing is arriving and an enemy is above)
- After each death: Nemotron writes one rule (or none), the game replays the death to test it and re-checks every earlier death, and the rule is kept or thrown out
- The replay shows on the playfield between runs
- The rulebook window, the coach window and the run list show what was learned
- You play the same game with the keyboard
- 16-bit look from the design canvas

## Later
- Live plans from Nemotron on top of the rulebook (the first version of Jevaga, kept in git history)
- Saving the rulebook between visits
- Waves that speed up, extra lives, power-ups
- Jev vs you on the same wave, side by side
- Sound

## Explicitly Cut
- The frog road-crossing game: Jev only waited or hopped forward, and learning between runs was too noisy to see (tested on 2026-09-25/26)
- Judging a rule by the next run's score: one run is mostly luck (the same seed and plan scored 600 to 7,200). Rules are judged on replays of the deaths instead.
- Nemotron rewriting Jev's plan every 3 seconds during a run: it gave the same advice in the same situation and learned nothing, and it would blur which change came from which rule. Moved to Later.
- Real Galaga, Nintendo or Crossy Road names or art: third-party IP
- Reading the game from pixels: the game hands Jev its state as text
