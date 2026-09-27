// Sound voices as pure functions: each returns the samples of one sound at
// `rate` samples a second. The same code plays in the browser (as an
// AudioBuffer), renders offline for the video, and can be measured in Node by
// scripts/sound-lab.ts, which is how sounds get judged without ears.

export const SOUND_NAMES = [
  "start",
  "wave",
  "swoop",
  "shot",
  "pop",
  "tink",
  "boom",
  "rev",
  "flutter",
  "commit",
  "loop",
  "glow",
  "zap",
  "drip",
  "rewind",
  "kept",
  "reject",
  "drop",
  "grab",
  "warn",
  "beam",
  "lance",
  "shield",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

// kind: which enemy (0 Cyclops, 1 Bat, 2 Drone) for the sounds that differ by
// kind. variant: 0 to 3, small differences (pitch, timing) so a sound heard
// many times doesn't grate; 0 is the reference take. Voices must be
// deterministic: the same arguments always give the same samples (no Math.random).
export type VoiceOpts = { kind?: 0 | 1 | 2; variant?: number };
export type VoiceFn = (rate: number, opts: VoiceOpts) => Float32Array;
export type VoiceSet = { name: string; description: string; voices: Record<SoundName, VoiceFn> };

// What each sound is for, how often it plays, and how long it may be.
export const SOUND_BRIEF: Record<SoundName, { when: string; often: string; length: string }> = {
  start: { when: "a new run begins (the fight is about to fly in)", often: "once a run", length: "up to 1.5 s" },
  wave: { when: "the next wave starts flying in after the last one is cleared", often: "every 30 to 60 s", length: "up to 1.2 s" },
  swoop: { when: "a fly-in group of 7 enemies of one kind appears at the top and swoops down (kind = which enemy)", often: "3 a wave", length: "0.5 to 0.9 s" },
  shot: { when: "the player's ship fires straight up", often: "up to 3 a second, the most frequent sound", length: "under 0.15 s" },
  pop: { when: "an enemy is destroyed (kind: 0 Cyclops is the big one, 1 Bat, 2 Drone the small spiky one)", often: "about 1 a second in busy moments", length: "0.2 to 0.4 s" },
  tink: { when: "a Cyclops is hit once: its armor holds and its eye shuts; one more shot kills it", often: "a few a wave", length: "under 0.25 s" },
  boom: { when: "the player's ship is destroyed and the run ends", often: "once a run", length: "0.8 to 1.3 s" },
  rev: { when: "a Drone revs in place for exactly 0.8 s before it plunges straight down a column: a warning", often: "every few seconds", length: "exactly 0.8 s" },
  flutter: { when: "a Bat flaps out of the formation and starts zigzagging down", often: "every few seconds", length: "under 0.3 s" },
  commit: { when: "a zigzagging Bat picks its target and dives straight at it: a sharp warning", often: "every few seconds", length: "under 0.2 s" },
  loop: { when: "a Cyclops loops out of the formation to park over the player", often: "every 10 s or so", length: "0.4 to 0.7 s" },
  glow: { when: "a Cyclops's eye charges for exactly 0.8 s before it fires an aimed shot: a warning that should build", often: "about 1 a second in busy moments", length: "exactly 0.8 s" },
  zap: { when: "a Cyclops fires its aimed shot", often: "about 1 a second in busy moments", length: "under 0.2 s" },
  drip: { when: "a Bat drops a bullet straight down", often: "about 1 a second, sometimes 7 in a row during a fly-in", length: "under 0.12 s" },
  rewind: { when: "the game rewinds to replay the ship's last death with a new rule", often: "once after each death", length: "0.3 to 0.6 s" },
  kept: { when: "the replay proved the new rule works and it's kept: a small win", often: "after some deaths", length: "0.4 to 0.8 s" },
  reject: { when: "the replay showed the new rule didn't work and it's thrown out", often: "after some deaths", length: "0.3 to 0.6 s" },
  drop: { when: "a carrier enemy is shot and the weapon it carried flips out and starts falling toward the player's row: an opportunity", often: "a few a wave", length: "0.3 to 0.5 s" },
  grab: { when: "the player glides onto a dropped weapon and takes it (Wingmen, Fan or Eye Beam): a power-up", often: "a few a wave", length: "0.4 to 0.7 s" },
  warn: { when: "a carrier Cyclops's Eye Beam warning line runs down its column for exactly 0.8 s before the beam fires: a strong warning that must build", often: "a few a wave", length: "exactly 0.8 s" },
  beam: { when: "a carrier Cyclops's Eye Beam fills its whole column for 0.5 s: the most dangerous attack in the game", often: "a few a wave", length: "exactly 0.5 s" },
  lance: { when: "the player fires their own Eye Beam: an instant beam up the whole column that hits every enemy in it", often: "up to about 1.4 a second while held", length: "under 0.3 s" },
  shield: { when: "one of the player's two Wingmen takes a bullet or a diver for the ship and is destroyed (the ship survives)", often: "rare", length: "0.2 to 0.4 s" },
};
