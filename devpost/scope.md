---
doc: scope
status: approved
---

# Go Frog Go

An endless top-down pixel-art road-crossing game, played by a fast decision model with a slow LLM coaching it.

## The Unique Kernel
You can watch System 2 teach System 1 from nothing. Jev makes every hop. It starts with one instruction, "jump forward," so run 1 walks straight into traffic. After each death, Nemotron writes a lesson from what happened, and Jev plays the next run with the whole playbook. The viewer watches the playbook grow and the distance climb. (Revised during `3-prd`: the coach no longer takes over mid-run.)

## Who It's For
Developers who saw Jev (or models like it) and want to see what a "System One" model is good for once a reasoning LLM is directing it. Also Matt, who wants to learn exactly that.

## The Core Loop
Press play. The chicken (or whatever it ends up being) starts hopping up an endless road.
- The playbook starts with one line: "jump forward."
- Each beat, Jev picks hop forward, left, right, back, or wait, with a confidence score, following the playbook.
- When it gets hit, Nemotron reads the last few moves and writes one short lesson into a playbook on screen. That lesson becomes part of Jev's instructions.
- The next run starts. Distance goes up.

## Inspiration & Identity
- Crossy Road (endless lanes, stepped hopping), with Frogger's close calls. https://www.crossyroad.com/
- Top-down pixel art. Classic arcade nostalgia.
- A video Matt watched of Jev playing Super Mario Bros. and Super Smash Bros., making decisions in real time. That video is why the game idea landed.
- Original name and sprites. Nothing borrowed from Crossy Road or Nintendo.

## Why This Matters to the Learner
Matt came here to learn Jev ("That's my whole point") and how it works with "a type 2 LLM controlling" it. He was waitlisted for Jev and chose Jev or nothing; Jev turned out to be available through Vercel AI Gateway. *(Updated during `4-spec`; scope first planned CLM-8B as a stand-in.)* The game needs to be "actually interesting to look at in the video."

## What "Working" Looks Like
A few runs back to back. Run 1 hops straight into the first car. A lesson appears. Run 2 waits at that same kind of lane and gets farther. The playbook grows, and a later run goes much farther. The "oh, that's cool" beat is watching the frog survive the exact thing that killed it last time, because of a lesson you watched get written.

## The POC Boundary
- One endless level with road lanes and cars at varied speeds
- Top-down pixel-art rendering in the browser
- Jev as System 1, via Vercel AI Gateway, behind a swappable adapter
- Nemotron on Nebius Token Factory as System 2: one lesson after each death, never a mid-run move
- On-screen playbook, confidence readout, distance per run

## Later
- Race Jev against another System One model
- Rivers, logs and trains
- Hosted demo URL, open-source license and polish for the Nebius entry (due Oct 30, after Basics closes Oct 26)
- Human vs. AI mode
- Sound

## Explicitly Cut
- Coach taking over mid-run: it would rescue the frog in early runs and hide the learning-from-nothing story (Matt, during `3-prd`)
- Real Mario, Smash, Crossy Road or Tetris assets or names: third-party IP, which both hackathons' rules forbid
- Raspberry Pi, LEDs and RFID: LEDs alone don't sense anything, and the RFID ideas didn't excite Matt
- The earlier code-scanner idea: Matt wanted something fun to watch
- Reading game state from pixels: the game hands Jev its state directly
