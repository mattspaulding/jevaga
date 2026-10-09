# Jevaga: To-Do (non-code)

Planning is done and approved (`devpost/scope.md`, `prd.md`, `spec.md`). Deadlines: Build With AI Basics closes **Oct 26, 5 PM ET**; Nebius x NVIDIA closes **Oct 30, 10 AM PT**, and the demo URL must stay live through judging (Dec 1 to 15).

## Waiting on
- [x] **Nebius promo code.** Arrived 2026-09-26 in the strawberrydigitalllc@gmail.com inbox and applied the same day: Token Factory account balance $25.00, no expiry (the email says credits "won't expire" once applied; apply-by date was 2026-12-31).

## Before build step 1
- [x] Create a Nebius Token Factory API key and save it to `.env.local` as `NEBIUS_API_KEY` (done 2026-09-25; Nemotron check passed: 364 ms, thinking off, clean two-line lesson).
- [ ] Run `5-build` in a fresh conversation opened on `Strawberry/Jevaga`.

## Accounts register (Strawberry rule: same day)
- [x] Add **Vercel AI Gateway** to `Strawberry/ACCOUNTS.md`: Strawberry Digital team, `AI_GATEWAY_API_KEY` in `Jevaga/.env.local`, pay per use ($5 gateway credit), Jev at $0.042/M input tokens.
- [x] Add **Nebius Token Factory** to `ACCOUNTS.md`: org Strawberry Digital-2w9, strawberrydigitalllc@gmail.com, billing as Strawberry Digital LLC, `NEBIUS_API_KEY` in `Jevaga/.env.local`, $1 trial plus $25 promo when applied.

## Optional
- [ ] Join the Nebius Builders Program (dev.nebius.com/builders) for another $25 of Token Factory credit.

## Game polish
- [x] **Death just freezes.** Done in slice 14. The ship's explosion plays (`components/GameCanvas.tsx`, `BOOM_MS` in `lib/game/render.ts`), then the screen sits still through the coach's studying/replay pause. Matt (2026-09-26): give the aliens something to do instead of freezing there, an explosion, then the aliens react, a little dance, some kind of celebration, or just flying off.

## Ideas
- [ ] **A Fire TV version for Amazon's Build, Ship, Shape hackathon** (https://amazonappdev2026.devpost.com/). Found in a Devpost sweep on 2026-09-28: of 23 open or upcoming hackathons, it's the only other one Jevaga could enter with a real fit. Submissions close **Fri Oct 23, 12:00 PM PT**, three days before Build With AI. The Fire TV track pays $25,000 / $15,000 / $4,000 plus AWS credits.
  - What it would take: package Jevaga as a Fire TV web app (Fire OS or Vega OS) played with the remote, d-pad to steer and select to fire, and test it on a Fire TV device. Every track is pass/fail on "reasonably applies the required APIs/SDKs", so it has to really run on Fire TV. About a few days of work.
  - Also required: a public repo, a demo video under 3 minutes, a written note on what changed during the entry period, and product feedback on the Fire TV tooling used.
  - Rules check: a project started Sep 25 is inside its entry period (opened Aug 31), and nothing stops Jevaga also being entered in Build With AI and Nebius x NVIDIA. Open to a US individual.
