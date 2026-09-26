// Does a written plan change Jev's move? Frozen fights, real Jev, the game's own descriptions.
// Run: pnpm plan-test   (reads keys from .env.local)
import { describeFight, describeMoves } from "../lib/describe";
import { newWorld, SHIP_ROW, threatAt, type Move, type World } from "../lib/game/world";
import { jev } from "../lib/system1/jev";
import { STARTING_PLAN, type Decision } from "../lib/system1/types";

const RIGHT_PLAN = "Work the right side, x 6 to 8, and shoot the formation from there.";
const LEFT_PLAN = "Work the left side, x 0 to 2, and shoot the formation from there.";
const REPEATS = 3;

// Ship in column 4 under an enemy; nothing launched yet.
function fight(bulletInColumn4: boolean): World {
  const w = newWorld(1);
  w.nextDive = w.nextVolley = 1e9;
  w.ship.x = 4;
  if (bulletInColumn4) w.bullets.push({ x: 4, y: SHIP_ROW - 2.1 }); // reaches the ship in about 0.3 s
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
  check("game rules agree: a quarter-second glide either way is clear", !threatAt(DANGER, 2.75) && !threatAt(DANGER, 5.25));
  console.log("\nWhat Jev reads in the danger fight:\n" + describeFight(DANGER));
  console.log(describeMoves(DANGER));

  const dodgeDanger = await ask(DANGER, STARTING_PLAN);
  const dodgeSafe = await ask(SAFE, STARTING_PLAN);
  const goRight = await ask(SAFE, RIGHT_PLAN);
  const goLeft = await ask(SAFE, LEFT_PLAN);
  console.log(`\ndodge plan, bullet coming   ${fmt(dodgeDanger)}`);
  console.log(`dodge plan, nothing coming  ${fmt(dodgeSafe)}`);
  console.log(`"work the right side"       ${fmt(goRight)}`);
  console.log(`"work the left side"        ${fmt(goLeft)}\n`);

  check("with the dodge plan Jev slides out of the bullet's column", mostly(dodgeDanger, (m) => m === "left" || m === "right"));
  check("with the dodge plan and nothing coming, Jev fires", mostly(dodgeSafe, (m) => m === "fire"));
  // Plans are strategy: survival rules always win, so what a plan steers is where Jev goes when it's safe.
  check('"work the right side" makes Jev glide right', mostly(goRight, (m) => m === "right"));
  check('"work the left side" makes Jev glide left', mostly(goLeft, (m) => m === "left"));

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error("ERROR", e.message);
  process.exit(1);
});
