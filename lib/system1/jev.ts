import { MOVES, type Move } from "../game/world";
import { instructionsFor, type DecideInput, type Decision, type System1 } from "./types";

// Jev through Vercel AI Gateway's TypeSafe-compatible route.
// https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe
const URL = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";

export class JevError extends Error {}

export const jev: System1 = {
  async decide({ state, moves, playbook }: DecideInput): Promise<Decision> {
    const key = process.env.AI_GATEWAY_API_KEY;
    if (!key) throw new JevError("AI_GATEWAY_API_KEY is not set");
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.JEV_MODEL || "typesafe-ai/jev",
        state,
        questions: { move: { type: "choice", instructions: instructionsFor(playbook), criteria: moves } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body?.error_type || body?.error?.type || body?.error?.message || "";
      throw new JevError(`Jev returned ${res.status}${detail ? ` (${String(detail).slice(0, 120)})` : ""}`);
    }

    const answer = body?.answers?.move;
    const move = answer?.choice as Move;
    const p = answer?.probabilities;
    if (!MOVES.includes(move) || !p || MOVES.some((m) => typeof p[m] !== "number") || typeof answer.confidence !== "number")
      throw new JevError("Jev's answer was missing a valid move, probabilities or confidence");

    return {
      move,
      probabilities: Object.fromEntries(MOVES.map((m) => [m, p[m]])) as Record<Move, number>,
      confidence: answer.confidence,
      source: "jev",
    };
  },
};
