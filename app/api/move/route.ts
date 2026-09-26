import { MOVES, type Move } from "@/lib/game/world";
import { system1 } from "@/lib/system1";

// System 1: the page sends the fight in words, the four move descriptions and
// the current plan; Jev (or the offline fake) picks the move. The key stays here.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { state, moves, plan } = body ?? {};
  const valid =
    typeof state === "string" &&
    state.length > 0 &&
    state.length < 8000 &&
    moves &&
    MOVES.every((m: Move) => typeof moves[m] === "string" && moves[m].length < 500) &&
    typeof plan === "string" &&
    plan.length > 0 &&
    plan.length <= 400;
  if (!valid) return Response.json({ error: "Bad request" }, { status: 400 });

  try {
    const decision = await system1().decide({ state, moves, plan });
    return Response.json(decision);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[move]", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
