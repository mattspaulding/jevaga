import { PICKUP_STAYS, type Beam, type Bullet, type Kind, type Pickup, type Pop, type Shot, type World } from "./world";

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
  | { name: "drip" } // a Bat drops a bullet
  | { name: "drop" } // a carrier's weapon starts falling
  | { name: "grab" } // you take a weapon
  | { name: "warn" } // a carrier Cyclops's beam warning line appears
  | { name: "beam" } // its beam fills the column
  | { name: "lance" } // you fire your own Eye Beam
  | { name: "shield" }; // one of your Wingmen takes a hit for you

const wingCount = (w: World) => (w.weapon === "wingmen" ? w.wings.filter(Boolean).length : 0);

export function createCueTracker() {
  let world: World | null = null;
  let seen = new WeakSet<Bullet | Shot | Pop | Beam | Pickup>();
  let firing = new WeakSet<Beam>(); // enemy beams already heard firing
  let floor: Pickup[] = []; // pickups there last frame, to tell a grab from one timing out
  let wings = 0;
  let held: World["weapon"] = null; // the weapon last frame: a swap or a wave's end isn't a wingman lost
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
    for (const o of [...w.bullets, ...w.shots, ...w.pops, ...w.beams, ...w.pickups]) seen.add(o);
    firing = new WeakSet(w.beams.filter((b) => w.t >= b.start));
    floor = [...w.pickups];
    wings = wingCount(w);
    held = w.weapon;
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
          if (s.lead) cues.push({ name: "shot" }); // one sound per volley, not per Fan or Wingman shot
        }
      for (const b of w.beams) {
        if (!seen.has(b)) {
          seen.add(b);
          cues.push({ name: b.from === "ship" ? "lance" : "warn" });
        }
        if (b.from === "enemy" && w.t >= b.start && !firing.has(b)) {
          firing.add(b);
          cues.push({ name: "beam" });
        }
      }
      for (const p of w.pickups)
        if (!seen.has(p)) {
          seen.add(p);
          cues.push({ name: "drop" });
        }
      // A pickup that vanished before its time was up was taken.
      if (floor.some((p) => !w.pickups.includes(p) && (p.landed === null || w.t - p.landed < PICKUP_STAYS - 0.05))) cues.push({ name: "grab" });
      floor = [...w.pickups];
      const nowWings = wingCount(w);
      if (held === "wingmen" && w.weapon === "wingmen" && nowWings < wings) cues.push({ name: "shield" });
      wings = nowWings;
      held = w.weapon;
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
