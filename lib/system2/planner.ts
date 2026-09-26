import type { Move } from "../game/world";

// Nemotron on Nebius Token Factory is the strategist: every few seconds it
// reads the whole fight and writes a short plan, which becomes Jev's
// instructions. https://docs.tokenfactory.nebius.com/
const URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";

export class PlanError extends Error {}

export type PlanInput = {
  state: string; // describeFight() at the moment of asking
  plan: string; // the plan Jev is flying on now
  recentMoves: Move[]; // Jev's last few moves, oldest first
  seconds: number;
};

const SYSTEM = `You are the strategist for a fast pilot model flying a ship in a real-time space shooter. The pilot decides every move itself, about four times a second: left, right, stay or fire. Every few seconds you write the plan it follows for the next few seconds.

How the game works:
- The ship sits on the bottom row and slides one column per move (columns 0 to 8). It fires straight up; the gun reloads for 0.35 s.
- A formation of enemies drifts across rows 1 to 3 and drops bullets. Every few seconds one enemy dives at the ship, steering toward its column and firing on the way down. Bullets fall straight down their column.
- One hit ends the run. Enemies are worth 100, divers 200.
- The pilot reads the same kind of description you are given: for its column and the columns beside it, when a bullet or diver reaches the ship's row ("bullet in 0.4 s"), and what a shot would hit.

Reply with exactly one line:
Plan: <one or two short sentences, 25 words or fewer>

Your plan is strategy for the next few seconds, not step-by-step orders. The pilot dodges bullets on its own, four times a second, and your plan is a few seconds old by the time it matters. So:
- Never tell it to stay, hold, wait or stop in a column. Never give it exact moves.
- Tell it where to hang out (a range of columns), what to shoot first (a diver, a side of the formation), and what to keep away from.
- Only mention bullets and divers the description shows; don't predict new ones.
Use the game's words: column numbers, "diver", "formation", "left side", "right side". Example of the form (a different situation from yours):
Plan: A diver is coming down the left; work columns 5 to 7 and shoot the diver when it's above you, then the right side of the formation.`;

export async function writePlan(input: PlanInput): Promise<string> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new PlanError("NEBIUS_API_KEY is not set");
  const user = [
    `The fight right now (${input.seconds.toFixed(0)} s into the run):`,
    input.state,
    `The pilot's current plan: ${input.plan}`,
    `Its last moves, oldest first: ${input.recentMoves.join(", ") || "none yet"}.`,
    "Write the plan for the next few seconds.",
  ].join("\n");

  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.PLAN_MODEL || process.env.LESSON_MODEL || "nvidia/Nemotron-3_5-Lightning",
      max_tokens: 200,
      temperature: 0.3,
      // Nemotron thinks by default and thinking shares max_tokens; off for a fast plan.
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new PlanError(`Token Factory returned ${res.status}`);
  return parsePlan(body?.choices?.[0]);
}

export function parsePlan(choice: { finish_reason?: string; message?: { content?: string } } | undefined): string {
  let text = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length" && !text.trim()) throw new PlanError("Plan ran out of tokens");
  const think = text.lastIndexOf("</think>");
  if (think >= 0) text = text.slice(think + "</think>".length);
  const line = text
    .split("\n")
    .map((l) => l.trim().replace(/^[*_#>\s]+/, ""))
    .find((l) => /^plan\b/i.test(l));
  const plan = (line ?? text.trim().split("\n")[0] ?? "").replace(/^plan[:\s*]*/i, "").replace(/^["']|["']$/g, "").trim();
  if (!plan) throw new PlanError("Plan reply was empty");
  // Keep it readable on the panel: cut at a sentence end near 200 characters.
  if (plan.length <= 200) return plan;
  const cut = plan.slice(0, 200).lastIndexOf(". ");
  return cut > 60 ? plan.slice(0, cut + 1) : plan.slice(0, 200);
}
