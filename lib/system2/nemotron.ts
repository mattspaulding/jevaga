import type { Move } from "../game/world";

// Nemotron on Nebius Token Factory writes one lesson after each run.
// https://docs.tokenfactory.nebius.com/
const URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";

// moveText is the description of the chosen move, so the coach sees exactly where the frog went.
// options: all five move descriptions; safe: moves that would have survived that beat (hindsight from the game).
export type BeatLog = {
  state: string;
  move: Move;
  moveText: string;
  confidence: number;
  options?: Record<Move, string>;
  safe?: Move[];
};
export type Lesson = { whatHappened: string; rule: string };
export class LessonError extends Error {}

const SYSTEM = `You coach a frog in a grid road-crossing game. A fast model picks every move by following a numbered playbook. You add one rule after each run.

How the game works:
- The world moves in beats. Each beat the frog makes one move (forward, left, right, back, wait), then every car advances.
- The frog is hit if a car covers or passes through the frog's cell during that beat.
- "Lane 0" is the frog's lane. "Lane +1" is the next lane ahead, "lane +2" the one after, and so on to the top of the screen; "lane -1" is behind. Columns are 0 to 8.
- The fast model sees every lane on screen: where the cars are, and when a car reaches the frog's column and the columns either side of it.
- Timing words: a car "reaches column N this beat" means being in column N now gets the frog hit. "In N beats" means it arrives later. "For at least 4 beats" means clear for now.
- A run also ends if the frog makes no forward progress for 15 beats (cause "stalled").

Reply with exactly two lines and nothing else:
What happened: <one plain sentence about what went wrong>
Rule: <one rule of 20 words or fewer>

Write the rule as "If <situation>, <move>." using the game's own words: lane names ("lane 0", "lane +1", "lane -1"), timing ("reaches your column this beat", "in 2 beats", "for at least 4 beats") and moves ("forward", "wait", "left", "right", "back").
The last beat's "Move chosen" line says exactly where the frog went and what was coming, and the list of all five options shows which moves were open. A car that "reaches column N this beat" hits a frog standing in or moving into column N, so waiting there is never safe. Pick the move that would have kept the frog alive and base the rule on it. Examples of the form:
Rule: If a car in lane +1 reaches your column this beat, wait.
Rule: If a car in your lane reaches your column in 2 beats, go forward.
Do not repeat or reword a rule already in the playbook; write a rule about a different detail of what went wrong.`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+-]+/g, " ").trim();
const action = (s: string) => norm(s).match(/\b(forward|wait|left|right|back)\b(?!.*\b(forward|wait|left|right|back)\b)/)?.[1];
// What a rule is about: its lanes, its timing and its move. Two rules with the
// same signature are the same rule, however they are worded.
function signature(rule: string) {
  const t = norm(rule).replace(/\byour lane\b/g, "lane 0");
  const lanes = [...new Set(t.match(/lane [+-]?\d/g) ?? [])].sort().join(",");
  const timing = [...new Set(t.match(/this beat|in \d beats?|at least \d beats?|clear/g) ?? [])].sort().join(",");
  return `${lanes}|${timing}|${action(rule)}`;
}
// The beat where the frog could still have been saved: the last beat, or if
// it was already trapped there, the latest earlier beat whose move was not safe.
function mistakeBeat(input: { beats: BeatLog[]; cause: "hit" | "stalled" }) {
  if (input.cause !== "hit") return null;
  for (let i = input.beats.length - 1; i >= 0; i--) {
    const b = input.beats[i];
    if (b.safe?.length && !b.safe.includes(b.move)) {
      // "Back" survives in hindsight but rarely works as a general rule for
      // crossing a road; allow it only when it was the only way out.
      const forwardish = b.safe.filter((m) => m !== "back");
      return { index: i, safe: forwardish.length ? forwardish : b.safe };
    }
  }
  return null;
}

export function isRepeat(rule: string, playbook: string[]) {
  const sig = signature(rule);
  return playbook.some((p) => signature(p) === sig);
}

// Asks once; if the rule duplicates one already in the playbook, asks again
// with that pointed out. A second duplicate counts as a failed lesson.
export async function writeLesson(input: {
  playbook: string[];
  beats: BeatLog[];
  cause: "hit" | "stalled";
}): Promise<Lesson> {
  const mistake = mistakeBeat(input);
  const problem = (l: Lesson) => {
    if (isRepeat(l.rule, input.playbook))
      return `Your rule "${l.rule}" is already in the playbook. Look again at beat ${mistake ? mistake.index + 1 : input.beats.length} and write a different rule.`;
    const move = action(l.rule) as Move | undefined;
    if (mistake && (!move || !mistake.safe.includes(move)))
      return `Your rule "${l.rule}" would not have saved the frog: at beat ${mistake.index + 1} only ${mistake.safe.join(", ")} kept it alive. Write a rule whose move is one of those.`;
    return null;
  };
  let lesson = await ask(input);
  const first = problem(lesson);
  if (first) {
    lesson = await ask(input, first);
    const second = problem(lesson);
    if (second) throw new LessonError(second.split(":")[0]);
  }
  return lesson;
}

async function ask(
  input: { playbook: string[]; beats: BeatLog[]; cause: "hit" | "stalled" },
  retryNote?: string,
): Promise<Lesson> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new LessonError("NEBIUS_API_KEY is not set");

  const last = input.beats[input.beats.length - 1];
  const mistake = mistakeBeat(input);
  const user = [
    "Playbook:",
    ...input.playbook.map((r, i) => `${i + 1}. ${r}`),
    `Cause: ${input.cause === "hit" ? "hit by a car on the last move" : "stalled: no forward progress for 15 beats"}`,
    "Last beats (oldest first):",
    ...input.beats.map(
      (b, i) => `Beat ${i + 1}.\n${b.state}\nMove chosen: ${b.move}: ${b.moveText} (confidence ${b.confidence.toFixed(2)})`,
    ),
    ...(last?.options
      ? ["All five options at the last beat were:", ...Object.entries(last.options).map(([m, t]) => `- ${m}: ${t}`)]
      : []),
    ...(mistake
      ? [
          mistake.index === input.beats.length - 1
            ? `Hindsight from the replay: at the last beat these moves would have kept the frog alive: ${mistake.safe.join(", ")}. Your rule's move must be one of them.`
            : `Hindsight from the replay: by the last beat no move could save the frog. The mistake was beat ${mistake.index + 1} (move chosen: ${input.beats[mistake.index].move}: ${input.beats[mistake.index].moveText}). There, these moves would have kept it alive: ${mistake.safe.join(", ")}. Write the rule about beat ${mistake.index + 1}; its move must be one of those.`,
        ]
      : []),
    ...(retryNote ? [retryNote] : []),
  ].join("\n");

  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.LESSON_MODEL || "nvidia/Nemotron-3_5-Lightning",
      max_tokens: process.env.LESSON_THINKING === "on" ? 4000 : 400,
      temperature: 0.3,
      // Nemotron thinks by default and thinking shares max_tokens; off unless LESSON_THINKING=on.
      chat_template_kwargs: { enable_thinking: process.env.LESSON_THINKING === "on" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(process.env.LESSON_THINKING === "on" ? 45_000 : 15_000),
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
