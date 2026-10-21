import { MOVES, THREATS, type Move } from "@/lib/game/world";
import { MAX_MOVE_LENGTH, MAX_RULE_LENGTH, MAX_RULES, MAX_STATE_LENGTH } from "@/lib/system1/types";
import { writeRule, type CoachInput } from "@/lib/system2/coach";

// System 2: after a death the page sends what Jev read and picked in the last
// second or so; Nemotron on Nebius Token Factory writes one rule. The key stays here.
const isMoves = (m: unknown): m is Record<Move, string> =>
  !!m && typeof m === "object" && MOVES.every((k) => typeof (m as Record<string, unknown>)[k] === "string" && ((m as Record<string, string>)[k]).length <= MAX_MOVE_LENGTH);

// Lightning gets 8 s (60 s with thinking on), then Nano 15 s.
export const maxDuration = 90;

// A death keeps the questions from the last 1.5 s, at most one every 250 ms: about 8.
const MAX_ASKED = 12;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<CoachInput> | null;
  const { asked, tHit, hitBy, rules, retry } = body ?? {};
  const valid =
    Array.isArray(asked) &&
    asked.length > 0 &&
    asked.length <= MAX_ASKED &&
    asked.every(
      (a) =>
        a &&
        typeof a.t === "number" &&
        typeof a.state === "string" &&
        a.state.length <= MAX_STATE_LENGTH &&
        isMoves(a.moves) &&
        MOVES.includes(a.pick) &&
        MOVES.every((m) => typeof a.probabilities?.[m] === "number"),
    ) &&
    typeof tHit === "number" &&
    !!hitBy &&
    THREATS.includes(hitBy.by) &&
    typeof hitBy.x === "number" &&
    typeof hitBy.y === "number" &&
    Array.isArray(rules) &&
    rules.length <= MAX_RULES &&
    rules.every((r) => typeof r === "string" && r.length > 0 && r.length <= MAX_RULE_LENGTH) &&
    (retry === undefined || (typeof retry === "string" && retry.length <= 1000));
  if (!valid) return Response.json({ error: "Bad request" }, { status: 400 });

  try {
    return Response.json(await writeRule({ asked, tHit, hitBy, rules, retry }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[coach]", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
