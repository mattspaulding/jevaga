---
doc: prd
status: approved
---

# Jevaga: Product Requirements

A Galaga-style shooter in the browser. Jev flies the ship in real time on reflexes. After every death, NVIDIA Nemotron on Nebius writes Jev a rule, and the game keeps the rule only if a replay of that death proves it works. You can fly it too. For developers curious about Jev-style "System One" models, and for Matt, who wants to learn how they work under an LLM.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

*(Replaces the Go Frog Go PRD on 2026-09-26; see `scope.md`. Revised 2026-09-27: the live planner gives way to learning from deaths.)*

## The Core Journey
Source: `scope.md > The Core Loop`.

1. The viewer opens the page. The playfield is on the left: stars, the enemy formation at the top, the ship at the bottom. The panel is on the right, with a Who plays switch (Jev plays / You play), an empty RULEBOOK, and Start.
2. **Jev plays** (default). They press Start. The formation starts drifting and the ship begins moving on its own.
3. About four times a second the JEV window shows Jev's move (left, right, stay, fire), its confidence, all four probabilities, and how long the answer took.
4. A bullet or a diver hits the ship. The run ends, the HIT banner shows, and the run joins RUNS with its score and how many rules it had.
5. The COACH window shows Nemotron studying the death, then what happened in one line and the rule it wrote (or "no rule: this one couldn't be avoided").
6. The playfield replays the last seconds before the death with the new rule, tagged REPLAY. The ship survives or it doesn't. The COACH window reports the result and whether every earlier death still survives.
7. If the rule held, it appears in the RULEBOOK with a brief flash. If not, the COACH window says it was thrown out.
8. The next run starts with the rulebook as it now stands. Runs continue until Stop, and the scores in RUNS climb as rules are added.
9. **You play**: switch, press Start, and fly with ← → (or A D) and Space to fire. One run per Start. Your runs don't teach Jev anything.

## Screens and Layout
One screen, as on the design canvas.
- **Left: the playfield**, 9 columns wide. The ship glides along the bottom row. HUD: score, and a tag saying who's flying (YOU / JEV), or REPLAY during a replay.
- **Right: the panel**, top to bottom:
  - **Who plays** switch.
  - Jev mode: **JEV** window (move, confidence meter, four probability bars, answer time), **COACH** window (studying, the rule, the test result), **RULEBOOK** (numbered rules), **RUNS** list.
  - You mode: **YOU** window (last key, key legend), **RUNS** list.
  - **Controls**: Start / Stop, and Forget rules. A status chip by the title shows outages.

## Look and Feel
Source: `scope.md > Inspiration & Identity`, `design-handoff.md`, the "Jevaga sprites" design canvas.
- The panel follows the design handoff: 16-bit RPG windows tinted per player (Jev blue, the coach purple, you green, neutral for the rulebook and runs), Pixelify Sans and Jersey 20, gold for the chosen move and the best run, the banded navy page. The RULEBOOK uses the handoff's playbook rows and fresh-rule flash, and the COACH window its NEW RULE and RULE CHANGED tags, plus DIDN'T HOLD and NO RULE.
- The playfield uses the sprites and timings from Matt's design canvas. During a replay the HUD tag reads REPLAY and a banner at the end says SURVIVED or HIT.

## Features and Behavior

### The fight
Source: `enemy-design.md`, which has every number.
- A formation of 21 enemies in three kinds drifts left and right across the top: Cyclops (row 1), Bat (row 2), Drone (row 3).
- Each kind attacks its own way, and every attack is drawn on screen before it lands:
  - **Drone (Ploomba):** revs, then falls straight down one marked column. Never turns, never shoots.
  - **Bat (Waffle):** zigzags down along a dotted line, fires two straight bullets, and commits to where you are once, at row 9.
  - **Cyclops (Winkless):** loops, parks mid-screen above you and fires aimed shots after its eye glows, then drops out through its column.
- In formation, Bats drop straight bullets, Cyclopes fire aimed shots after a glow, and Drones stay quiet.
- Every wave starts with a fly-in: three groups of 7 swoop in from the top along paths drawn a second ahead, dip to row 9 as a first attack, and climb to their slots. From wave 2 they fire on the way in. Nothing dives until the formation is in place.
- A Cyclops takes two hits. The first shuts its eye.
- Some enemies are carriers. A carrier uses its kind's weapon on you (Drone: Wingmen, Bat: Fan, Cyclops: Eye Beam). Shoot it and the weapon falls to your row; glide onto it and it's yours until the wave ends. A new weapon replaces the old one.
- Waves escalate: more kinds, more divers at once, faster, escorts and mirrored pairs, and a swarm when few enemies are left.
- The ship glides along the bottom row and fires straight up, with a short reload between shots.
- A shot that reaches an enemy destroys it: 100 points, 200 for a diver. A cleared formation brings a new one.
- [x] Each kind dives its own way, with its path drawn before it lands.
- [x] Every wave flies in along drawn paths before the formation settles.
- [x] A Cyclops takes two hits, and Jev can read that one is hit once.
- [x] A carrier uses its weapon until it's shot, and the dropped weapon can be grabbed and used until the wave ends.
- [ ] Waves 1 to 6 follow the escalation table in `enemy-design.md`.
- [ ] Enemies drift, dive and fire without any input.
- [ ] A shot destroys the enemy it reaches; the score goes up.
- [ ] A bullet or diver touching the ship ends the run.

### Jev flies (System 1)
- About four times a second, Jev reads the screen as text and chooses left, right, stay or fire, with a probability for each.
- The screen keeps moving while Jev thinks; its move is applied the instant the answer lands.
- Jev's instructions are one starting line ("stay alive and shoot enemies") plus the rulebook. Nothing else steers it.
- [ ] Every Jev move shows its choice, confidence, four probabilities and answer time.
- [ ] With an empty rulebook, Jev flies on its starting line alone.

### Jev learns from its deaths (System 2)
- While Jev flies, the game keeps the last few seconds of the fight: enough to rebuild it exactly, plus every question Jev was asked and what it answered.
- When the ship is hit, Nemotron gets the last second or so of that: what Jev read each time it was asked, what it picked, what hit it, and the current rulebook. It writes what happened in one line and either one rule (added, or replacing an old one) or none.
- A rule is written in the words Jev reads, as a situation and what to do about it. It must be general enough for the next time, not tied to this death's exact positions.
- The game tests the rule by rebuilding the fight from before the death and flying it again, asking Jev at each step with the new rulebook. The rule passes if the ship survives past the moment it died.
- The rule also has to pass every earlier death Jev learned from. A rule that fixes this death but breaks an old fix is thrown out.
- A rule may not stop Jev shooting. The game keeps a few calm moments from Jev's runs (nothing arriving, an enemy above, the gun ready), and a new rule has to leave Jev firing in them.
- The replay uses the live run's own timing: every question asked at the same moment, every answer landing when it did. With the old rulebook it retraces the death exactly; if it somehow doesn't (Jev answered a repeated question differently), the death is marked as luck and needs no rule.
- If a rule fails, Nemotron gets one more try with the replay's result. If that fails too, the rulebook stays as it was.
- The rulebook holds at most 8 rules. When it's full, a new rule has to replace one.
- [ ] After each Jev death the COACH window shows what happened and the proposed rule.
- [ ] Every kept rule made Jev survive the replay of the death that produced it, and every earlier death still survives with the new rulebook.
- [ ] A rule that fails its replay is never added to the rulebook.
- [ ] The replay plays on the playfield, tagged REPLAY, ending with SURVIVED or HIT.
- [ ] Forget rules empties the rulebook and the saved deaths.

### Sound
- Retro arcade sound effects for the fight: your shots, enemy pops, the Cyclops's tink and zap, a Drone's rev, a Bat's commit, the ship's explosion, the fly-in swoops and a jingle for each wave, plus a rewind when a death replays and a chime or buzz for a rule kept or thrown out.
- A SOUND button (and the M key) mutes it, remembered in this browser.
- [x] Every sound above plays at its moment, in both modes and during replays, and the mute sticks.

### Enemy Library
- A LIBRARY screen has one page per enemy: its sprites, name, a little lore, how it attacks, its weapon, how to spot it coming, and the wave it first appears. The copy is in `enemy-design.md`.
- [ ] Every enemy in the game has a library page, reachable from the panel.

### You fly
- ← → or A D glide the ship; Space fires. Same rules and speed as Jev.
- [ ] Keys act instantly.

### Runs
- [ ] Each run is listed with who flew it, its score, its kills, and how many rules Jev had; the best is marked.

### Usage
- The panel keeps a running count for the session: how many times Jev has answered (and how many of those were free repeats), how many rules Nemotron has written, the tokens behind each, and what each has cost in dollars, plus the combined total.
- [ ] The USAGE window shows Jev's and Nemotron's answer counts, tokens and cost, and the combined total.

## States and Boundaries
- **Before Start:** formation shown still, ship at the bottom center, empty run list, empty rulebook ("Empty. Jev starts on reflexes alone.").
- **Studying and replaying:** the pause between Jev runs lasts as long as the coach and the replays take: under 10 seconds while few deaths are fixed, 20 to 45 seconds once many are. The COACH window says what's happening ("testing earlier death 3 of 7"). Stop ends it.
- **Jev unavailable:** the game doesn't start, or pauses mid-run, and the chip by the title says so. Nothing pretends to play. A replay that loses Jev partway counts as not tested, never as passed.
- **Nemotron unavailable or slow:** no rule this time; the next run starts with the rulebook unchanged, and the COACH window says so.
- **Stopped:** the run ends; the run list and the rulebook stay.
- **Reload:** everything resets, including the rulebook.

## Product Decisions
- Galaga-style shooter instead of the frog game (Matt, 2026-09-26). Named **Jevaga** by Matt.
- Nemotron teaches from deaths instead of planning live (Matt, 2026-09-27, after seeing that the live planner gave the same advice every time and never learned).
- Rules are proven on replays of the deaths, not judged by the next run's score.
- Jev starts dumb: no hand-written survival rule. The first rules it earns should be the obvious ones.
- Real time for everyone: the game never waits for a decision during a run.
- Keyboard play, carried over. Your runs don't teach Jev.
- The design-canvas look, carried over.
- Jev through Vercel AI Gateway on the paid tier, about four decisions a second.
- Enemies with their own attacks and weapons, Galaga-style but updated, and an Enemy Library with names and playful lore (Matt, 2026-09-26; details in `enemy-design.md`).

**Assumptions, for Matt to confirm with this PRD:**
- The live planner is retired, not kept as a toggle.
- One rule change per death, at most 8 rules.
- One retry when a rule fails its replay.
- The rulebook lives in the page and resets on reload.

## What We're Building
One screen: the shooter, Jev flying it in real time, Nemotron writing a rule after each death, the replay that proves or rejects the rule, the rulebook, keyboard play, the run list, and the design-canvas look.

## Deferred From the POC
- **Hosted URL and license** for Nebius (after Basics closes Oct 26).
- **Saving the rulebook and scores** between visits.

## Possible Later Enhancements
- Live plans from Nemotron on top of the rulebook.
- Waves that speed up, lives, power-ups.
- You vs Jev side by side on the same wave.
- Sound.

## Non-Goals
- Galaga's name, art or sounds.
- Reading the game from pixels.
- Training or fine-tuning a model. Jev learns only through its written instructions.

## Open Questions
- **Folder and repo name**: the project folder is still `GoFrogGo`.
