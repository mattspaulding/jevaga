// Does a written plan change Jev's move? Frozen fights, real Jev, the game's own descriptions.
// Run: pnpm plan-test   (reads keys from .env.local)
import { describeFight, describeMoves } from "../lib/describe";
import { newWorld, SHIP_ROW, threatAt, type Move, type World } from "../lib/game/world";
import { jev } from "../lib/system1/jev";
import { STARTING_PLAN, type Decision } from "../lib/system1/types";

const FIRE_PLAN = "Ignore incoming bullets and keep firing straight up.";
const REPEATS = 3;

// Ship in column 4 under an enemy; nothing launched yet.
function fight(bulletInColumn4: boolean): World {
  const w = newWorld(1);
  w.nextDive = w.nextVolley = 1e9;
  w.ship.col = 4;
  if (bulletInColumn4) w.bullets.push({ col: 4, y: SHIP_ROW - 2.1 }); // reaches the ship in about 0.3 s
  return w;
}
const DANGER = fight(true);
const SAFE = fight(false);

let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};

async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}
async function ask(world: World, plan: string): Promise<Decision[]> {
  const out: Decision[] = [];
  for (let i = 0; i < REPEATS; i++)
    out.push(await withRetry(() => jev.decide({ state: describeFight(world), moves: describeMoves(world), plan })));
  return out;
}
const fmt = (ds: Decision[]) => {
  const p = ds[0].probabilities;
  return `${ds.map((d) => d.move).join("/").padEnd(18)} left ${p.left.toFixed(2)} right ${p.right.toFixed(2)} stay ${p.stay.toFixed(2)} fire ${p.fire.toFixed(2)}`;
};
const mostly = (ds: Decision[], ok: (m: Move) => boolean) => ds.filter((d) => ok(d.move)).length * 2 > ds.length;

async function main() {
  check("game rules agree: the bullet reaches column 4 in about 0.3 s", (threatAt(DANGER, 4)?.at ?? 9) < 0.4);
  check("game rules agree: columns 3 and 5 are clear", !threatAt(DANGER, 3) && !threatAt(DANGER, 5));
  console.log("\nWhat Jev reads in the danger fight:\n" + describeFight(DANGER));
  console.log(describeMoves(DANGER));

  const dodgeDanger = await ask(DANGER, STARTING_PLAN);
  const dodgeSafe = await ask(SAFE, STARTING_PLAN);
  const fireDanger = await ask(DANGER, FIRE_PLAN);
  console.log(`\ndodge plan, bullet coming   ${fmt(dodgeDanger)}`);
  console.log(`dodge plan, nothing coming  ${fmt(dodgeSafe)}`);
  console.log(`fire plan,  bullet coming   ${fmt(fireDanger)}\n`);

  check("with the dodge plan Jev slides out of the bullet's column", mostly(dodgeDanger, (m) => m === "left" || m === "right"));
  check("with the dodge plan and nothing coming, Jev fires", mostly(dodgeSafe, (m) => m === "fire"));
  // Jev's fixed instructions say "stay alive first", so a plan shifts its choice rather than overriding survival.
  const fireShift = fireDanger[0].probabilities.fire - dodgeDanger[0].probabilities.fire;
  check(`the fire plan raises Jev's chance of firing under a bullet (+${fireShift.toFixed(2)})`, fireShift >= 0.1);

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error("ERROR", e.message);
  process.exit(1);
});
