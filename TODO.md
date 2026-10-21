# Jevaga: To-Do (non-code)

Planning is done and approved (`devpost/scope.md`, `prd.md`, `spec.md`). Deadlines: Build With AI Basics closes **Oct 26, 5 PM ET**; Nebius x NVIDIA closes **Oct 30, 10 AM PT**, and the demo URL must stay live through judging (Dec 1 to 15).

## Ship
- [x] Public repo github.com/mattspaulding/jevaga under MIT (2026-10-21).
- [x] Vercel project `jevaga` on the Strawberry Digital team, live at https://jevaga.vercel.app (2026-10-21). The team-scoped `*.vercel.app` aliases sit behind Vercel login; `jevaga.vercel.app` is public.
- [x] `AI_GATEWAY_API_KEY` and `NEBIUS_API_KEY` set in the Vercel project for Production and Preview (2026-10-21). A full Jev run on the live site went through to a coach verdict for $0.0054.
- [x] Firewall rate limits per IP, answering 429: `/api/move` 600 a minute, `/api/coach` 30 a minute (2026-10-21, checked: the 31st coach request in a minute got 429). Vercel bills $0.50 per million allowed requests through them. The Vercel connector's firewall API returns 404 for this project, so rule changes go through the dashboard.
- [ ] Pushes to GitHub don't start a Vercel deploy: the Vercel GitHub App probably lacks access to this repo. Add `jevaga` under Repository access at github.com/settings/installations, or redeploy from the Vercel side.
- [ ] Check that auto top-up is off on the AI Gateway credit and on Nebius, so the prepaid balance is the most anyone can burn. Check both balances around Dec 1.
- [ ] Re-read both rules pages by hand. WebFetch got a 403 from Devpost on 2026-10-21, so the notes in `hackathons/` are from 2026-09-25.
- [ ] Demo video, Devpost write-ups, and the 6-ship final review.

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
- [x] **Dropped 2026-10-21: the Oct 19 cutoff passed with no deploy or video.** **A Fire TV version for Amazon's Build, Ship, Shape hackathon** (going for it, Matt 2026-10-09, under family entertainment: "AI-enhanced viewing... that's stretching what that means." The track doesn't require AI; the game is the product and Jev is the twist. Cutoff: start it only once the play-through, the Vercel deploy and the video are done, by Oct 19; otherwise drop it) (https://amazonappdev2026.devpost.com/). Found in a Devpost sweep on 2026-09-28: of 23 open or upcoming hackathons, it's the only other one Jevaga could enter with a real fit. Submissions close **Fri Oct 23, 12:00 PM PT**, three days before Build With AI. The Fire TV track pays $25,000 / $15,000 / $4,000 plus AWS credits.
  - What it would take: package Jevaga as a Fire TV web app (Fire OS or Vega OS) played with the remote, d-pad to steer and select to fire, and test it on a Fire TV device. Every track is pass/fail on "reasonably applies the required APIs/SDKs", so it has to really run on Fire TV. About a few days of work.
  - Also required: a public repo, a demo video under 3 minutes, a written note on what changed during the entry period, and product feedback on the Fire TV tooling used.
  - Rules check: a project started Sep 25 is inside its entry period (opened Aug 31), and nothing stops Jevaga also being entered in Build With AI and Nebius x NVIDIA. Open to a US individual.
  - Read on the official page 2026-10-09: there's no game category. The Fire TV track takes "React Native, web technologies, or Android", and "Fire TV is the exception: any framework works, as long as your demo video shows the project running on an actual Fire TV device or the Fire TV/Vega simulator." So a web game in a Vega OS WebView qualifies, and the simulator is enough for the video. Its priority categories are AI-enhanced viewing, sports, fitness, family entertainment, multi-modal UX and computer vision; Jevaga fits AI-enhanced viewing (watch an AI learn to play) and family entertainment. Judging: pass/fail on fitting the theme and using the platform, then Tech Implementation, Design (an interaction model that suits the TV), Potential Impact and Quality of the Idea, equally weighted. A friction log on Amazon's tools can add up to 10%.
  - The route: Vega OS. Amazon's Vega SDK (Mac only, with a simulator) and its WebView template pointed at the deployed Vercel site, plus a TV mode in the game (remote controls, d-pad focus, a couch-readable layout). About 3 to 4 days, after the Vercel deploy.
