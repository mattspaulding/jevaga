import type { Bullet, Kind, Pop, Shot, World } from "./world";

// Turns what changed in the fight since the last frame into sound cues. It
// only reads the world, so the engine and its replays stay exactly as they were.

export type Cue =
  | { name: "start" } // a new run
  | { name: "rewind" } // a death's replay starts on the playfield
  | { name: "wave" } // the next wave starts flying in
  | { name: "swoop"; kind: Kind } // a fly-in group appears
  | { name: "shot" } // your gun fires
  | { name: "pop"; kind: Kind } // an enemy destroyed
  | { name: "tink" } // a Cyclops's first hit shuts its eye
  | { name: "boom" } // the ship is hit
  | { name: "rev" } // a Drone starts revving
  | { name: "flutter" } // a Bat leaves the formation
  | { name: "commit" } // a Bat commits at row 9
  | { name: "loop" } // a Cyclops leaves the formation
  | { name: "glow" } // a Cyclops's eye starts to glow
  | { name: "zap" } // a Cyclops fires an aimed shot
  | { name: "drip" }; // a Bat drops a bullet

export function createCueTracker() {
  let world: World | null = null;
  let seen = new WeakSet<Bullet | Shot | Pop>();
  let wave = 0;
  let alive = true;
  let phase = new Map<number, string>();
  let charge = new Map<number, number | null>();
  let hurt = new Map<number, number>();
  let shown = new Set<number>(); // fly-in paths whose first enemy has appeared this wave

  // Takes in a world as it is, without cues for anything already there.
  function take(w: World) {
    world = w;
    seen = new WeakSet();
    for (const o of [...w.bullets, ...w.shots, ...w.pops]) seen.add(o);
    wave = w.wave;
    alive = w.alive;
    phase = new Map(w.enemies.map((e) => [e.id, e.alive && e.diving ? e.diving.phase : "formation"]));
    charge = new Map(w.enemies.map((e) => [e.id, e.charge]));
    hurt = new Map(w.enemies.map((e) => [e.id, e.hurt]));
    shown = new Set(w.enemies.filter((e) => e.diving?.phase === "enter" && e.diving.y > -1).map((e) => e.diving!.path));
  }

  return {
    update(w: World, replaying = false): Cue[] {
      if (w !== world) {
        take(w);
        return replaying ? [{ name: "rewind" }] : w.t < 0.5 ? [{ name: "start" }] : [];
      }
      const cues: Cue[] = [];
      for (const s of w.shots)
        if (!seen.has(s)) {
          seen.add(s);
          cues.push({ name: "shot" });
        }
      for (const p of w.pops)
        if (!seen.has(p)) {
          seen.add(p);
          cues.push({ name: "pop", kind: p.kind });
        }
      for (const b of w.bullets)
        if (!seen.has(b)) {
          seen.add(b);
          cues.push({ name: b.from === 0 ? "zap" : "drip" });
        }
      if (alive && !w.alive) cues.push({ name: "boom" });
      alive = w.alive;
      if (w.wave !== wave) {
        take(w); // a new formation: fresh ids and phases
        return [...cues, { name: "wave" }];
      }
      for (const e of w.enemies) {
        if (!e.alive) continue;
        const now = e.diving ? e.diving.phase : "formation";
        if (now !== phase.get(e.id)) {
          phase.set(e.id, now);
          if (now === "rev") cues.push({ name: "rev" });
          if (now === "flap") cues.push({ name: "flutter" });
          if (now === "commit") cues.push({ name: "commit" });
          if (now === "open") cues.push({ name: "loop" });
        }
        if (e.charge !== null && charge.get(e.id) == null) cues.push({ name: "glow" });
        charge.set(e.id, e.charge);
        if (e.hurt !== hurt.get(e.id)) {
          hurt.set(e.id, e.hurt);
          if (e.hurt >= 0) cues.push({ name: "tink" });
        }
        const d = e.diving;
        if (d?.phase === "enter" && d.y > -1 && !shown.has(d.path)) {
          shown.add(d.path);
          cues.push({ name: "swoop", kind: e.kind });
        }
      }
      return cues;
    },
  };
}
