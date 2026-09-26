import { MOVES } from "@/lib/game/world";
import { writePlan } from "@/lib/system2/planner";

// System 2: every few seconds the page sends the whole fight; Nemotron on
// Nebius Token Factory writes the plan Jev flies on next. The key stays here.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { state, plan, recentMoves, seconds } = body ?? {};
  const valid =
    typeof state === "string" &&
    state.length > 0 &&
    state.length < 8000 &&
    typeof plan === "string" &&
    plan.length <= 400 &&
    Array.isArray(recentMoves) &&
    recentMoves.length <= 20 &&
    recentMoves.every((m: unknown) => MOVES.includes(m as never)) &&
    typeof seconds === "number";
  if (!valid) return Response.json({ error: "Bad request" }, { status: 400 });

  try {
    return Response.json({ plan: await writePlan({ state, plan, recentMoves, seconds }) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[plan]", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
