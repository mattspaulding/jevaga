import type { Move } from "../game/world";

// Nemotron on Nebius Token Factory writes one lesson after each run.
// https://docs.tokenfactory.nebius.com/
const URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";

export type BeatLog = { state: string; move: Move; confidence: number };
export type Lesson = { whatHappened: string; rule: string };
export class LessonError extends Error {}

const SYSTEM = `You coach a frog in a grid road-crossing game. A fast model picks every move by following a numbered playbook. You add one rule after each run.

How the game works:
- The world moves in beats. Each beat the frog makes one move (forward, left, right, back, wait), then every car advances.
- The frog is hit if a car covers or passes through the frog's cell during that beat.
- "Lane 0" is the frog's lane. "Lane +1" is the next lane ahead, "lane -1" is behind. Columns are 0 to 8.
- Timing words: a car "reaches column N this beat" means being in column N now gets the frog hit. "In N beats" means it arrives later. "For at least 4 beats" means clear for now.
- A run also ends if the frog makes no forward progress for 15 beats (cause "stalled").

Reply with exactly two lines and nothing else:
What happened: <one plain sentence about what went wrong>
Rule: <one rule of 20 words or fewer>

The rule must use the game's own words, such as "lane +1", "lane 0", "reaches your column this beat", "in 2 beats", "forward", "wait", "left", "right". Good examples:
Rule: If a car in lane +1 reaches your column this beat, wait.
Rule: If lane +1 is clear for at least 2 beats, go forward.
Do not repeat or reword a rule already in the playbook.`;

export async function writeLesson(input: {
  playbook: string[];
  beats: BeatLog[];
  cause: "hit" | "stalled";
}): Promise<Lesson> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new LessonError("NEBIUS_API_KEY is not set");

  const user = [
    "Playbook:",
    ...input.playbook.map((r, i) => `${i + 1}. ${r}`),
    `Cause: ${input.cause}`,
    "Last beats (oldest first):",
    ...input.beats.map(
      (b, i) => `Beat ${i + 1}.\n${b.state}\nMove chosen: ${b.move} (confidence ${b.confidence.toFixed(2)})`,
    ),
  ].join("\n");

  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.LESSON_MODEL || "nvidia/Nemotron-3_5-Lightning",
      max_tokens: 400,
      temperature: 0.3,
      // Lightning thinks by default and thinking shares max_tokens; turn it off.
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new LessonError(`Token Factory returned ${res.status}`);
  return parseLesson(body?.choices?.[0]);
}

export function parseLesson(choice: { finish_reason?: string; message?: { content?: string } } | undefined): Lesson {
  let text = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length" && !text.trim()) throw new LessonError("Lesson ran out of tokens");
  const think = text.lastIndexOf("</think>");
  if (think >= 0) text = text.slice(think + "</think>".length);
  const line = (label: string) =>
    text
      .split("\n")
      .map((l) => l.trim().replace(/^[*_#>\-\s]+/, ""))
      .find((l) => l.toLowerCase().startsWith(label))
      ?.slice(label.length)
      .replace(/^[:\s*]+/, "")
      .replace(/^["']|["']$/g, "")
      .trim();
  const whatHappened = line("what happened");
  const rule = line("rule")?.replace(/^\d+[.)]\s*/, "").slice(0, 140);
  if (!whatHappened || !rule) throw new LessonError("Lesson reply was missing a line");
  return { whatHappened, rule };
}
