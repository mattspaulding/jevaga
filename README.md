# Jevaga

A Galaga-style shooter flown by an AI pilot that learns from its deaths.

Jev picks the ship's move up to four times a second. It starts with one instruction: stay alive and shoot enemies. Every time it dies, NVIDIA Nemotron studies the last second and a half and writes it one rule. The game then replays that exact death with the rule added, and the rule only stays if the ship survives.

## How Jev and Nemotron split the work

**Jev is the fast one.** It's TypeSafe's Jev model, called through Vercel AI Gateway. Up to four times a second the game describes the fight in plain sentences ("where you stop (x 4.0): Bat bullet in 0.4 s") along with what each of the four moves would lead to, and Jev picks left, right, stay or fire. An answer takes about 0.3 seconds, and the fight keeps moving while it thinks. Jev also gets its rulebook with every question.

**Nemotron is the slow one.** It's NVIDIA Nemotron 3.5 Lightning on Nebius Token Factory. It only runs after a death. It reads what Jev saw and picked just before the hit, then writes one rule in the same words Jev reads, or replaces an old one. The rulebook holds at most 8.

**The game decides, not either model.** Before a rule is kept, the game replays the death on the same physics steps with the new rule. The ship has to survive. The last 8 deaths the rulebook already fixed have to still survive. And Jev has to keep firing in calm moments, so a rule can't make it safe by making it useless. If a rule fails, Nemotron hears why and gets one more try.

Every answer from the live run is pinned to the 20 ms physics step it landed on, so a replay asks Jev the same questions at the same moments, and with a new rule the only thing that can change is what Jev picks. Jev doesn't always answer the same question the same way, though. If the replay with the old rulebook survives too, the game calls that death luck and writes no rule.

## Run it

You need Node 22 or newer and pnpm.

```bash
pnpm install
cp .env.example .env.local
```

Put your two keys in `.env.local`: `AI_GATEWAY_API_KEY` for Jev (Vercel AI Gateway; four answers a second needs its paid tier) and `NEBIUS_API_KEY` for Nemotron (Nebius Token Factory). Then:

```bash
pnpm dev
```

Open http://localhost:3000. Add `?seed=1234` to pick the fight; otherwise you get a random one, shown under RUNS. Every run on a seed starts from the same fight.

## Playing

**JEV PLAYS** hands the ship to Jev, run after run, learning between them. The JEV window shows each pick with its confidence. The COACH window shows Nemotron studying the death and the replay deciding. The RULEBOOK shows what Jev has learned so far, and USAGE counts the tokens and the cost.

**YOU PLAY** gives you the ship: arrow keys or A and D to glide, Space to fire (hold it to keep firing). M mutes the sound. You need a keyboard.

**LIBRARY** has a page for each enemy: Ploomba the Drone, Waffle the Bat and Winkless the Cyclops, with how each one attacks and how to spot it coming.

The rulebook and the runs live in the page. Reload it and Jev starts over with nothing.

## When a model is down

In JEV PLAYS, nothing pretends to play. YOU PLAY needs no model at all.

- **Jev can't be reached when you press Start.** The game doesn't start, and the chip by the title says JEV UNAVAILABLE.
- **Jev drops out mid-run.** The fight pauses, the chip says it's retrying, and it picks up again when Jev answers.
- **Jev drops out while the death is being replayed, before Nemotron is asked.** No rule for that death, and the COACH window says why.
- **Jev drops out while a rule is being tested.** The rule isn't kept. The COACH window says it couldn't be tested, and the rulebook stays as it was.
- **Nemotron can't be reached.** No rule for that death. The COACH window says Nemotron didn't answer, and the next run starts with the rulebook unchanged.

## Offline

Set `SYSTEM1=fake` in `.env.local` and restart. A stand-in pilot flies instead of Jev, reading the same descriptions, and every move it makes is labeled SIMULATED. It gets more careful with each of its first three rules, though it doesn't read the rules' words. Nemotron still needs the network, so without it no new rules are written.

## What it costs

Jev costs about $0.00003 an answer. At four answers a second that's under a cent a minute. Nemotron is $0.06 per million input tokens and $0.24 per million output tokens (checked 2026-09-26), a fraction of a cent per death. The same question asked twice, which happens a lot in replays, is answered from an in-memory cache for free.

## Checks and scripts

- `pnpm world-check` runs the game's rules, the enemies, the replays and the failure handling offline. No keys needed.
- `pnpm sim -- <seed> <runs>` flies Jev headless and prints each run.
- `pnpm learn -- <seed> <runs>` runs the whole learning loop headless.
- `pnpm replay-test -- <seed> <deaths>` checks that real deaths replay exactly.
- `pnpm coach-bench -- <deaths.json>` compares Nemotron's rules against a hand-written one.
- `pnpm sound-lab -- juicy` renders the sound effects and draws their spectrograms. The sounds are made in code, and http://localhost:3000/sounds plays them during development.

`sim`, `learn`, `replay-test` and `coach-bench` call the real models and cost a few cents.

## Built for

The Build With AI: Basics and the Nebius x NVIDIA Global AI hackathons on Devpost.

## License

MIT. See [LICENSE](LICENSE).
