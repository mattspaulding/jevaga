---
doc: enemy-design
status: approved
---

# Jevaga: Enemy Design

Settled with Matt on the "Jevaga enemy design" canvas (https://claude.ai/artifact/QcbN9RXx5i766tBbkaBYNs) on 2026-09-26. This file is the source of truth for how the enemies behave, what they carry, how waves escalate, and the Enemy Library copy. The research behind section 1 was fact-checked against its sources.

**Matt's decisions (2026-09-26):**
- Each enemy kind has its own attack pattern and its own weapon. Patterns get more intricate and harder as the waves go on, updated with ideas from modern shooters.
- A carrier uses its weapon against you until it's shot; then the weapon falls to your row and you can grab it. It lasts until the end of the wave.
- A second weapon replaces the one you hold.
- ~~The Cyclops takes one hit for now.~~ Changed later the same day: the Cyclops takes two hits, like Boss Galaga ("I remember there being like stronger ones that took more than one hit").
- Every wave starts with the enemies flying in from the top, from wave 1, and the fly-in is its first attack: "they come in from the top and... formation on like an initial attack. And if you survive the attack, then they go up and they kind of float up at the top." Built before carriers, because it changes the opening of every run and every replay.
- No challenge wave for now. The Shards (fourth kind) come after the three main kinds feel right.
- An Enemy Library gives each enemy a page with a name, a little lore and its attack pattern, in a playful, slightly silly sci-fi tone.

Numbers below use the game's real constants from `lib/game/world.ts`: 9 columns (x 0 to 8), ship on row 13, ship glides 5 columns/s, enemy bullets fall 7 rows/s, Jev is asked every 0.25 s and answers in about 0.27 s.

One number drives most of the timings here. After a threat appears, Jev can wait up to 0.25 s to be asked, then takes 0.27 s to answer and 0.2 s to glide one column clear. That is 0.72 s. **Any warning shorter than 0.8 s is unfair to Jev**, however it looks to a human, so 0.8 s is the floor for every telegraph in this doc.

## 1. Galaga's enemies, briefly

| Enemy | Game | What it does | Source |
|---|---|---|---|
| Bee (Zako) | Galaga, 1981 | Bottom two rows, 20 of them. Peels off (often from the left), flies a big smooth loop, dives, and can loop back around for a second pass. Weaves side to side while diving. 50 pts in formation, 100 diving. | Wikipedia; arcade-history.com; retrogamedeconstructionzone.com (medium confidence on the path) |
| Butterfly (Goei) | Galaga, 1981 | Middle two rows, 16 of them. Peels off (often from the right), flutters down, shoots straight down, and steers late in the dive toward the player, so it's harder to snipe than a Bee. Escorts the Boss. 80 / 160 pts. | Wikipedia; arcade-history.com; retrogamedeconstructionzone.com |
| Boss Galaga | Galaga, 1981 | Top row, 4 of them. Two hits (green, then purple). Alternates looped dives with capture runs: loops once, slides to mid-screen, fires a tractor beam. Killing that Boss mid-dive frees a captured ship, which joins you as a Dual Fighter: two ships side by side, a wider shot and a bigger target. (Wikipedia notes the 1981 hardware draws the paired shots as one sprite, so it is not literally double fire.) Worth 400 alone, 800 or 1,600 with one or two escorts. | Wikipedia; galaga.com; arcade-history.com |
| Transforms: Scorpion, Stingray, Galaxian Flagship | Galaga, 1981 | From stage 4, once per stage a Bee morphs mid-flight into three bonus enemies. High value (1,000 / 2,000 / 3,000 for the set); sources disagree on whether they fire. | Wikipedia; fandom wikis via search (medium) |
| Challenging Stage | Galaga, 1981 | Stage 3 and every 4th after. 40 enemies fly set paths and never fire. Bonus per full group, 10,000 for all 40. | arcade-history.com; Wikipedia |
| Flagship + escorts | Galaxian, 1979 | Flagship (2 hits) dives with two red escorts in a loose triangle, sweeping and firing, then arcs back. | Wikipedia |
| Queen Gaplus with blaster heads | Gaplus, 1984 | The boss carries one of six attachments (capture beam, speed, homing, slow, curved beam, screen clear). Kill it to get the effect. The closest thing in the series to our carrier idea. | namco / ugsf fandom (medium) |
| Splitters and mergers | Galaga '88 | Some enemies split into four on death. Two Goei merge into one big, tougher enemy as the wave thins. | StrategyWiki via search (medium) |
| Colored Boss variants | Galaga Arrangement, 1995 | The Boss's color decides what you win by rescuing your ship from it: yellow gives Fast Shot, red gives Ricochet Shot. | galaxian.fandom.com (medium) |
| Neon path lines, black hole enemy | Galaga Legions DX, 2011 | Each wave's flight paths are drawn as glowing lines just before it launches. Killing a black-hole enemy turns nearby enemies into allies. | Wikipedia |

Two things carry straight over. Galaga already gives each type its own dive shape (loop vs. late steer vs. beam run), and Gaplus and Arrangement already tie a specific enemy to a specific weapon you win by killing it.

## 2. Jevaga's enemies

Each kind gets one dive, one formation habit and one weapon. Kept apart on purpose:

- **Drone**: a body. Never shoots. Falls straight and fast down a column you can see.
- **Bat**: bullets. Zigzags, then commits to your column once, at a fixed row.
- **Cyclops**: aim. Parks above you and shoots at where you are.

Against a Drone you step aside. Against a Bat you keep moving through row 9. Against a Cyclops you leave its column.

### Drone (row 3, silver, spiky) = Galaga's Bee

**Dive, "Plunge".**
1. Revs in its slot for 0.8 s: spikes spin, and a thin silver line is drawn down the column it will fall.
2. That column is the ship's column at the moment it starts revving, rounded to a whole column. Fixed from then on.
3. Slides along row 3 to that column at 4 columns/s.
4. Falls straight down at 4.5 rows/s (10 rows, about 2.2 s). It never turns.
5. If it misses, it leaves the bottom, re-enters at row 0 in the same column and flies back to its slot. From wave 4 it falls down the same column a second time before going home (the Bee's loop-back).

**In formation.** Silent. Drones never fire. They are the most frequent divers.

**Weapon: Wingmen.**
- *Carrier using it:* when a carrier Drone plunges, two mini-drones detach and fall beside it in the columns either side. A wall three columns wide. You have to be two columns clear of its column. The idea comes from Galaxian's flagship triangle and Boss Galaga's escorts.
- *After you grab it:* the two mini-drones fly beside your ship at x-1 and x+1 and fire straight up whenever you fire. Each one is destroyed by the first bullet or diver that touches it, and that hit doesn't kill you. Galaga's Dual Fighter plus Galaga Legions' satellites. Near the edges a wingman sits outside the field and does nothing.

**Telegraph.** The 0.8 s rev and the silver column line. A carrier's line is three columns wide.

### Bat (row 2, red, wings) = Galaga's Butterfly

**Dive, "Flutter".**
1. Flaps in its slot for 0.3 s.
2. Drops at 3 rows/s, zigzagging: 2.5 columns/s sideways, flipping direction every 0.5 s (legs of about 1.25 columns). Its first leg heads toward the ship's side. The whole zigzag to row 9 is fixed at launch and drawn as a dotted red line.
3. At row 9 (today's `DIVE_LOCK_ROW`) it reads the ship's x **once** and flies a straight line to that point on row 13 at 4 rows/s (1 s). This is the Butterfly's late steer, cut down to a single decision you can see coming.
4. Fires one straight-down bullet at rows 5 and 8 (today's `DIVE_FIRE_ROWS`).
5. Exits the bottom, re-enters the top, returns to its slot.

**In formation.** Bats drop the ordinary straight bullets that today come from any enemy.

**Weapon: Fan.**
- *Carrier using it:* every bullet it fires becomes three: one straight down, two drifting outward at 2 columns/s while falling at 7 rows/s. Applies to its formation volleys and to both dive shots.
- *After you grab it:* each shot is three, one straight up and two angling out one column per three rows. By the time it reaches the formation the spread covers 5 columns. One fan counts as one of your 3 shots on screen. Galaga '88's red capsule does something similar, upgrading you to triple shot.

**Telegraph.** The dotted zigzag line, drawn at launch. At row 9 a short red arrow snaps from the Bat to the point it has committed to.

### Cyclops (row 1, orange, one eye) = Boss Galaga

**Dive, "Hover".**
1. Its eye opens for 0.3 s. At launch it picks a hover point: the ship's column at that moment, row 6. An orange line shows the path.
2. Flies one small loop (0.8 s), then slides to the hover point at 3 cells/s. This is the Boss's "loop once, slide to mid-screen".
3. Hovers 1.6 s and fires two aimed shots, 0.8 s apart. Before each shot the eye glows for 0.8 s. The shot flies at 6 cells/s straight toward where the ship was when it fired, and never turns after that.
4. Drops straight down from row 6 at 4.5 rows/s, exits, returns to its slot.

**In formation.** When the formation volley picks a Cyclops, it fires one aimed shot instead of a straight bullet, after the same 0.8 s eye glow.

**Weapon: Eye Beam.**
- *Carrier using it:* at the hover point it skips the aimed shots. A thin orange warning line runs from its eye down to row 13 for 0.8 s, then a beam fills that column for 0.5 s. The column is known from launch, so a player who reads the path line has about 3 s. This is the tractor-beam run, except it kills instead of capturing.
- *After you grab it:* fire sends a beam up your whole column instantly. It hits everything in that column, formation included (up to 3 enemies). Reload goes from 0.35 s to 0.7 s.

**Two hits.** Like Boss Galaga (green, then purple), the first hit shuts its eye and the second kills. A Cyclops with its eye shut still fires; the shut eye only says it's one shot from dying. Worth 150 in formation and 400 diving, so the second shot pays. Jev reads "a Cyclops 9 rows up, hit once, one more shot kills it".

### Carriers and pickups (all three kinds)

- At wave start the seed picks the carriers (see section 3). A carrier has its weapon icon glowing under it: an eye, a fan, a pair of wings.
- The carrier makes the wave's 2nd dive. Kill it before then and it never uses the weapon.
- Kill a carrier and the icon flips out and falls straight down from where it died at 4 rows/s. It lands on row 13 in the nearest whole column, sits 4 s, blinks through the last 1 s and disappears. Bullets pass through it.
- You glide onto it to take it. It lasts to the end of the wave.

## 3. The fly-in

Galaga never starts with the formation in place. Its enemies fly in single file from the top and the sides on looping paths, and take their slots as they arrive. You can shoot them on the way. They hold fire during the entry on stage 1 and fire from stage 2, each stage uses one of three fixed entry patterns, and nobody dives until every survivor is in formation (Namco Wiki; Shoot Em Up wiki).

Here the fly-in is the wave's first attack:
- The 21 enemies come in as three groups of 7, one kind to a group, single file, about 0.18 s apart. Groups start 1.2 s apart.
- Each group's path is drawn 1 s before its first enemy appears (Galaga Legions), in its kind's color.
- The path comes in from a top corner or the top middle, swoops down to its lowest point at row 9, loops back up, and each enemy then climbs to its own slot. Row 9 keeps the pass above the ship's row: it's a pass you shoot at and dodge shots from, never one that rams you.
- Three entry patterns, cycling by wave, change which kind comes from which side.
- Wave 1: nobody fires on the way in. From wave 2, each entering Bat drops one straight bullet as it passes row 5 on the way down, and every other entering Cyclops glows its eye for 0.8 s and fires one aimed shot. Drones never fire.
- Nothing dives and the formation doesn't volley until every survivor has reached its slot, plus 1 s.
- Shooting an enemy on its way in is worth what it's worth in formation.

## 4. Escalation by wave

Dive interval is today's `diveEvery(wave)`. "Speed" is a multiplier on every dive speed above.

| Wave | Who dives | At once | Dive every | Speed | Carriers | Entry | New this wave |
|---|---|---|---|---|---|---|---|
| 1 | Drone, Bat | 1 | 3.0 s | 1.0x | 1 Bat | Fly-in, nobody fires | Plunge, Flutter, Fan |
| 2 | All three | 1 | 2.7 s | 1.0x | 1 Drone | Fly-in, Bats and Cyclopes fire on the way in | Hover, aimed shots, Wingmen |
| 3 | All three | 1, plus escorts | 2.4 s | 1.05x | 1 Cyclops | Fly-in | Eye Beam. Cyclops dives escorted by 2 Bats in a triangle (they follow its path 1 column out and 1 row behind, then each does its own row 9 commit). Escorted Cyclops kill = double points |
| 4 | All three | 2 | 2.2 s | 1.1x | 1 Bat, 1 Drone | Fly-in | Mirrored Drone pairs: two Drones rev together, one takes your column c, the other takes 8-c (c+2 if you're in the middle). Drones' second pass |
| 5 | Nobody dives at you | n/a | n/a | 1.1x | none | 3 groups of 7 fly across on drawn lines | **Challenge wave** (Galaga's Challenging Stage, as a breather). No firing. Clear a whole group for a bonus, all 21 for a big one. If cut, wave 5 plays like wave 4 with 3 carriers |
| 6 | All three | 2 | 1.8 s | 1.15x | 1 of each | Fly-in | **Transform**: once per wave, a Drone mid-plunge splits at row 5 into 3 Shards (4th kind, see below) |

**After wave 6:**
- Dive interval keeps following `diveEvery` down to its 1.5 s floor.
- Speed goes up 0.05x a wave and stops at 1.4x.
- 3 at once from wave 9.
- Carriers: one of each kind every wave.
- Challenge wave every 4th wave (9, 13, 17), if kept.
- Warnings never drop below 0.8 s.
- The Bat's commit row stays at row 9. At row 10 the last leg would take 0.75 s, which leaves Jev 0.03 s to spare.

**Swarm rule (Galaga's depleted formation).** When 4 or fewer enemies are left (3 in wave 1), nobody goes back to a slot. A survivor that misses wraps to row 0 and launches its dive again 0.5 s later, same pattern, new target column. "At once" goes up by one. Carriers still holding a weapon keep using it.

**A 4th kind: the Shard.** Galaga's transforms (a Bee turns into three bonus enemies from stage 4) and Galaga '88's splitters both point here. From wave 6, one Drone per wave splits at row 5 into three Shards. They fall straight down columns c-1, c and c+1 at 3 rows/s and never fire. 500 points each, 1,500 more for all three. Mostly a scoring chance, and the splitting Drone's column line already tells you where they'll fall. **Sprite needed:** one small Shard (a third of a Drone, silver-blue), two frames of spin. No dive pose. If a 4th kind feels like too much, cut it. Nothing else depends on it.

## 5. Modern touches

1. **Path lines before a dive (Galaga Legions DX).** Legions draws each wave's flight paths in neon an instant before launch. Here every fly-in path is drawn 1 s before its group appears, and every dive's path is drawn when it launches: silver column for a Drone, dotted zigzag for a Bat, loop and hover point for a Cyclops. The same geometry goes into Jev's text, so the line and the sentence can't disagree.
2. **Warning line before a beam (Cuphead, and danmaku convention).** Every Cuphead boss attack has a tell before it fires. Danmaku games show a thin line for about a beat before a laser. The Eye Beam gets 0.8 s of line, set by Jev's reaction time, not by feel.
3. **Weapon token that blinks out (Nex Machina).** Nex Machina's secondary weapon token cycles visibly and fades if you don't grab it in time. Ours doesn't cycle (one kind, one weapon) but keeps the fade: 4 s on the floor, blinking the last second. Grabbing it is a risk you can see the clock on.
4. **Satellites that fire with you (Galaga Legions).** The Blowneedle's two satellites fire whenever the main gun does. Wingmen are that, with a Dual Fighter twist: each one absorbs one hit.
5. **Color by kind (Ikaruga).** Ikaruga makes dense screens readable by giving everything one of two colors. Here every bullet, line and beam takes its enemy's color: orange for Cyclops, red for Bat, silver for Drone. A glance tells you who fired.
6. **Mirrored pairs (Galaxian, Galaga Legions).** Galaxians dive alone, in pairs, or three at a time. Legions' satellites can be mirrored. Wave 4's Drone pairs mirror around the middle column, so two threats read as one shape.

## 6. What Jev reads

Most important change: today `threatOnPath` reports `by: "bullet" | "diver"`. It should report the kind: "Drone in 0.6 s", "Bat bullet in 0.4 s", "Cyclops beam in 0.9 s". Without the name the coach can't write a rule about a specific enemy, which is the whole reason for this change.

New sentences, one per behavior:

| Behavior | Line Jev reads | Prediction hazard |
|---|---|---|
| Drone revving | "A Drone is revving and will fall down x 3 in 0.6 s, arriving in 2.8 s." | None. The column is fixed when the rev starts. |
| Drone plunging | "Drone falling straight down x 3, never turns, reaches you in 1.1 s." | None. |
| Drone second pass | "The Drone that missed at x 3 comes down x 3 again in 1.9 s." | Small: the forward sim has to follow the wrap, not only what's on screen. |
| Carrier Drone | "Carrier Drone with Wingmen falling down x 2 to 4, reaches you in 1.4 s." | None. |
| Bat zigzag | "A Bat zigzagging down from your left, 5 rows up. At row 9 in 0.7 s it turns toward wherever you are then." | **Flag.** Where it ends depends on where the ship is at row 9. The sim can't give one arrival time for "a little left" until then. Report a time per spot as if Jev stays there, and call it "if you're there at row 9". |
| Bat committed | "Bat committed to x 5, reaches the bottom in 0.6 s." | None after the commit. |
| Fan bullets | "Fan from a Bat: bullets reach x 3, 4 and 5 in 0.5 s." | Small: diagonal bullets cross columns. The existing per-spot check already sweeps the path. |
| Cyclops hovering | "Cyclops parked at x 4, 7 rows up, eye glowing: shoots at where you are in 0.5 s." | **Flag.** The aim depends on the ship at the moment it fires. Say "at where you are then", and once it fires, report the shot like any bullet. |
| Aimed shot in flight | "Cyclops shot flying toward x 4.2, reaches your row in 0.8 s." | None once fired. |
| Eye Beam warning | "Cyclops beam warning on x 6: beam fills x 6 in 0.6 s, for 0.5 s." | **Flag.** A beam lasts a while, not just a moment. `threatOnPath` needs a column hazard with a start and an end. |
| Escorted Cyclops | "Cyclops with 2 Bat escorts, over x 3 to 5." | Follows from the above. |
| Pickup on floor | "Fan weapon on the floor at x 6, gone in 2.5 s. Nothing arrives there for 1.8 s." | None. It's an opportunity, and the line pairs it with the threat check so Jev doesn't glide into a bullet for it. |
| Holding a weapon | "Your weapon: Eye Beam, reload 0.7 s." / "Wingmen: left gone, right ready." | **Flag** for Wingmen: a hit on a wingman isn't a death. The threat check has to know which hits the wingmen take. |
| Fly-in | "Arriving: 7 Bats swooping in from the top left, lowest at row 9 near x 3.0, dropping bullets as they pass row 5. Nothing dives until the formation is in place." | None. Every path is fixed when the wave starts. |
| Cyclops hit once | "a Cyclops 9 rows up, hit once, one more shot kills it" | None. |
| Carrier in formation | "Carrier: the Bat at x 5, row 2, holding Fan, dives second." | None. |
| Swarm | "Swarm: 3 left, none return to formation." | Small: more simultaneous dives. |

## 7. What the coach might learn

These are the kind of rules Nemotron could write once deaths name an enemy:

1. "When a Cyclops beam warning is on your column, glide one column either way right away. Don't fire first."
2. "Drones never turn. If a Drone's line is on your column, step one column aside and fire up as it passes. Don't chase it."
3. "Don't stand still under a zigzagging Bat. Be gliding when it reaches row 9 so it commits to a spot you're leaving."
4. "If a carrier is above you and the gun is ready, shoot it before anything else in the formation."
5. "Only glide to a dropped weapon if nothing reaches that spot for at least 1 s."
6. "If a Cyclops above you is hit once, fire again before moving on to another target."

## 8. Sprites and effects needed

**Sprites**
- Drone: rev frame (spikes spun).
- Mini-drone, about half a Drone. The same sprite is used for enemy escorts and for your Wingmen.
- Ship with Wingmen attached, or the mini-drone drawn beside the ship.
- Cyclops: eye-glow frame and eye-shut frame (drawn in code until designed).
- Carrier icons, 3: eye, fan, wings. Small, sitting under the carrier.
- Pickup tokens: the same 3 icons, larger, with a flip-out frame and a blink state.
- Shard (4th kind), 2 frames. Optional.

**Effects**
- Path lines: silver column (Drone), dotted red zigzag (Bat), orange loop to hover point (Cyclops), and each fly-in group's path in its kind's color. Carrier Drone's line 3 columns wide.
- Bat commit arrow at row 9.
- Eye Beam: thin warning line, then a full-column beam, in orange for the enemy and a different color for yours.
- Bullets tinted by kind: orange aimed shot, red straight and fan bullets.
- Player fan shots (3 angled), player beam.
- Wingman destroyed pop.
- Challenge wave group-cleared banner. Optional.


## Build order, and what to cut

- **Session 1 (built):** the three dives, path lines, kind-named threats in `describe.ts`, formation habits (Bat straight, Cyclops aimed, Drone silent). This alone gives the coach enemy-specific deaths.
- **Session 2:** the fly-in every wave, and the two-hit Cyclops.
- **Session 3:** carriers, the three weapons both ways, pickups, the beam as a column hazard in `threatOnPath`.
- **Session 4:** the wave table, escorts, mirrored pairs, the swarm rule.

If it's too much, cut in this order: challenge wave, Shards, Wingmen absorbing hits (they just fire). Even after all of those cuts, you still have three enemies that play differently, each with its own weapon.

## The Enemy Library

The Fleet runs like a mid-size company, with Fleet Command as management. Each enemy's joke comes from what it does in the game, so the lore teaches the behavior.

### Drone

**Name:** Ploomba (runner-up: Deadbolt)

**Lore:** Ploomba's job description is one word long, and the word is "down." It picks the column you're standing in and falls straight down it. No turning, no gun. Its last performance review said "shows no growth." Ploomba had it framed.

**How it attacks:** It locks onto the column you're in when it starts revving, then slides over and falls straight down that column without turning or firing. One column to either side is safe. From wave 4, a Drone that misses comes back down the same column once more before it goes home.

**Its weapon (Wingmen):** When a carrier Ploomba dives, two mini-drones fall in the columns on either side of it, so you need to be two columns clear. Grab it and two mini-drones ride beside your ship and fire straight up with you, and each one soaks up the first bullet or diver that touches it.

**Spot it coming:** Its spikes spin for 0.8 seconds while a thin silver line marks the column it will fall down. A carrier's line is three columns wide.

**First seen:** Wave 1. Carriers with Wingmen from wave 2.

---

### Bat

**Name:** Waffle (runner-up: Ditherwing)

**Lore:** Waffle schedules its indecision. Every swerve of its zigzag is booked before it leaves the formation, right up to row 9, where Fleet Command makes it pick a spot, and it always picks yours. Its bullets are the only straight thing about it.

**How it attacks:** It zigzags down out of the formation, switching direction every half second, and fires one straight bullet down at row 5 and another at row 8. At row 9 it checks where you are, once, and flies straight at that spot. Keep moving as it reaches row 9 and it commits to a place you've already left.

**Its weapon (Fan):** A carrier Waffle turns every bullet it fires into three, one straight down and two drifting outward, both in formation and on the dive. Grab it and each of your shots splits the same way, spreading across 5 columns by the time it reaches the formation and still counting as one shot on screen.

**Spot it coming:** A dotted red line shows its whole zigzag the moment it launches, and a short red arrow snaps out at row 9 to the spot it has picked.

**First seen:** Wave 1, carrying the first Fan of the game.

---

### Cyclops

**Name:** Winkless (runner-up: Gawkeye)

**Lore:** Winkless got into management because it never blinks in meetings. It does one lap of the room and then parks above you to stare. Its eye lights up before every shot, which the rest of the Fleet considers oversharing. Hit it once and it finally blinks, and it takes a second shot to end the meeting. When the meeting's over it leaves through the floor.

**How it attacks:** When it launches it picks the column you're in, and after one small loop it parks halfway down that column. It fires twice, each time at where you are at the moment it fires, and the shot flies straight without turning. Then it drops straight down that column on its way out, so leave the column before it does. It takes two hits. After the first its eye stays shut, but it keeps shooting.

**Its weapon (Eye Beam):** A carrier Winkless skips the aimed shots. A thin orange warning line runs down its column for 0.8 seconds, then a beam fills that column for half a second. Grab it and your shot becomes an instant beam up your whole column that hits everything in it, up to 3 enemies, but your reload doubles from 0.35 to 0.7 seconds.

**Spot it coming:** The orange path line drawn at launch shows which column it will park over, which gives you about 3 seconds before a beam. Its eye glows for 0.8 seconds before every shot.

**First seen:** Wave 2. Carriers with Eye Beam from wave 3.

---

### Shard

**Name:** Severance (runner-up: Driftlet)

**Lore:** Severance is what's left of a Ploomba after the wave 6 budget cuts: three silver-blue bits and no exit interview. Nobody handed them a gun on the way out, so they just fall. You get 500 points apiece and a bonus for collecting the whole department.

**How it attacks:** Once per wave, a Drone splits at row 5 of its dive into three Shards: one keeps its column and one drops on each side. They fall straight down at 3 rows a second, slower than a Drone, and never fire. Hit all three for 1,500 bonus points on top of the 500 each.

**Its weapon:** None. Severance isn't on the payroll, so nothing drops when you hit one.

**Spot it coming:** The splitting Drone's silver line marks the middle lane, and the other two Shards fall one column to either side of it.

**First seen:** Wave 6. This is the optional fourth kind; the design doc lists it second in its cut order, after the challenge wave.
