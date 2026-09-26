import type { Move } from "../game/world";

// Nemotron on Nebius Token Factory edits the playbook after each run: one
// change per run (add, replace or remove a rule). The code applies the change,
// so the playbook stays short and never contradicts itself.
// https://docs.tokenfactory.nebius.com/
const URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";
export const MAX_RULES = 4; // learned rules, above the default
// The frog's instinct from run 1 stays as the last line of every playbook; the
// coach's rules sit above it as learned exceptions.
export const DEFAULT_RULE = "Otherwise, jump forward.";

// moveText is the description of the chosen move, so the coach sees exactly where the frog went.
// options: all five move descriptions; safe: moves that would have kept the frog clear for the next ~1.2 s (hindsight from the game).
export type BeatLog = {
  state: string;
  move: Move;
  moveText: string;
  confidence: number;
  options?: Record<Move, string>;
  safe?: Move[];
};
// How earlier runs went, so the coach can keep what helped.
export type RunRecord = { distance: number; cause: "hit" | "stalled"; playbook: string[] };
export type Lesson = { whatHappened: string; change: string; playbook: string[] };
export class LessonError extends Error {}

const SYSTEM = `You coach a frog in a real-time road-crossing game. A fast model decides every hop by following a numbered playbook. After each run you make exactly one change to the playbook.

How the game works:
- Cars glide along their lanes without stopping. The frog hops instantly from square to square whenever the fast model answers; the road keeps moving while it thinks (usually 0.2 to 0.6 s).
- The frog is hit whenever a car overlaps its square.
- "Lane 0" (or "your lane") is the frog's lane. "Lane +1" is the next lane ahead, "lane +2" the one after, and so on; "lane -1" is behind. Columns are 0 to 8.
- The fast model sees every lane on screen: where the cars are, and for its column and the columns either side, when the next car covers that column.
- Timing words, in seconds from the moment the model was asked: "car now, gone at 0.3 s" means a car is there now, so hopping there now gets the frog hit. "Car from 0.4 to 0.9 s" means the square is safe for 0.4 s, then a car passes. "Clear for 3+ s" means nothing is coming.
- A run also ends if the frog makes no forward progress for 9 seconds (cause "stalled").
- The playbook holds at most ${MAX_RULES} rules, and always ends with "${DEFAULT_RULE}", which you cannot change.

Reply in exactly this format and nothing else:
What happened: <one plain sentence about what went wrong this run>
Change: <"add", or "replace N", or "remove N", where N is a rule number>
Rule: <the new rule, for add or replace>

How to choose the change:
- Pick the one change that would most likely have saved the frog this run. The model's answer lands a few tenths of a second after it is asked, so a car arriving within about 0.5 s is already dangerous.
- If an existing rule caused this death, or came in right before a worse run, replace or remove it.
- If the playbook is full (${MAX_RULES} rules), you must replace or remove.
- A rule is "If <situation>, <move>." in 20 words or fewer. It names one lane ("your lane", "lane +1", "lane -1") and exactly one move ("forward", "wait", "left", "right" or "back"). Use thresholds ("car now", "car within 0.5 s", "clear for 1 s or more"), never exact windows like "car from 0.1 to 0.6 s".
Example reply, about a different situation from yours (don't copy it):
What happened: The frog waited in its lane while a car drove into it.
Change: add
Rule: If your lane has a car at your column within 0.5 s, hop forward.`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+-.]+/g, " ").trim();
const action = (s: string) => norm(s).match(/\b(forward|wait|left|right|back)\b(?!.*\b(forward|wait|left|right|back)\b)/)?.[1];
// What a rule is about: its lanes and its timing. Two rules about the same
// situation are the same rule (same move) or a contradiction (different move).
function situation(rule: string) {
  const t = norm(rule).replace(/\byour lane\b/g, "lane 0");
  const lanes = [...new Set(t.match(/lane [+-]?\d/g) ?? [])].sort().join(",");
  const timing = [...new Set(t.match(/car now|within \d+(\.\d+)? s|\d+(\.\d+)? s or more|clear|grass/g) ?? [])].sort().join(",");
  return `${lanes}|${timing}`;
}
const isDefault = (rule: string) => /^otherwise\b/i.test(rule.trim()) || /^jump forward\.?$/i.test(rule.trim());
const learned = (playbook: string[]) => playbook.filter((r) => !isDefault(r));

// The decision where the frog could still have been saved: the last one, or if
// it was already trapped there, the latest earlier one whose move was not safe.
function mistakeBeat(input: { beats: BeatLog[]; cause: "hit" | "stalled" }) {
  if (input.cause !== "hit") return null;
  for (let i = input.beats.length - 1; i >= 0; i--) {
    const b = input.beats[i];
    if (b.safe?.length && !b.safe.includes(b.move)) {
      // "Back" survives in hindsight but rarely works as a general rule for
      // crossing a road; allow it only when it was the only way out.
      const forwardish = b.safe.filter((m) => m !== "back");
      return { index: i, move: b.move, safe: forwardish.length ? forwardish : b.safe };
    }
  }
  return null;
}
// The lane the fatal move went into, in the playbook's words.
const laneOf = (move: Move) => (move === "forward" ? "lane +1" : move === "back" ? "lane -1" : "lane 0");

export type Edit = { op: "add" } | { op: "replace" | "remove"; n: number };

function ruleProblem(rule: string): string | null {
  const moves = norm(rule).match(/\b(forward|wait|left|right|back)\b/g) ?? [];
  if (new Set(moves).size !== 1) return `"${rule}" must name exactly one move.`;
  if (!/\blane [+-]?\d\b|\byour lane\b/i.test(rule)) return `"${rule}" must name a lane: "your lane", "lane +1" or "lane -1".`;
  if (/\bfrom \d+(\.\d+)? to \d+(\.\d+)?/i.test(rule)) return `"${rule}" uses an exact window; use a threshold like "within 0.5 s".`;
  return null;
}

// Applies one edit to the learned rules. A new rule about the same situation
// as an existing one replaces it, so the playbook can't contradict itself.
export function applyEdit(playbook: string[], edit: Edit, rule: string | undefined): { rules: string[]; change: string } | string {
  const rules = learned(playbook);
  if (edit.op === "remove") {
    if (edit.n < 1 || edit.n > rules.length) return `There is no rule ${edit.n} to remove.`;
    return { rules: rules.filter((_, i) => i !== edit.n - 1), change: `Removed rule ${edit.n}.` };
  }
  if (!rule) return "Add and replace need a rule.";
  const problem = ruleProblem(rule);
  if (problem) return problem;
  const clash = rules.findIndex((r) => situation(r) === situation(rule));
  if (clash >= 0 && action(rules[clash]) === action(rule) && !(edit.op === "replace" && edit.n === clash + 1))
    return `Rule ${clash + 1} already says that. Pick a different change.`;
  if (edit.op === "replace" || clash >= 0) {
    const n = edit.op === "replace" && clash < 0 ? edit.n : clash + 1;
    if (n < 1 || n > rules.length) return `There is no rule ${n} to replace.`;
    if (norm(rules[n - 1]) === norm(rule)) return `Rule ${n} already says exactly that. Make a real change.`;
    const next = [...rules];
    next[n - 1] = rule;
    return { rules: next, change: `Replaced rule ${n}.` };
  }
  if (rules.length >= MAX_RULES) return `The playbook is full (${MAX_RULES} rules). Replace or remove one instead.`;
  return { rules: [...rules, rule], change: `Added rule ${rules.length + 1}.` };
}

// After the edit, some rule about the lane the frog died in must pick a move
// that would have kept it alive.
function coversMistake(rules: string[], mistake: ReturnType<typeof mistakeBeat>): string | null {
  if (!mistake) return null;
  const lane = laneOf(mistake.move);
  const ok = rules.some((r) => {
    const t = norm(r).replace(/\byour lane\b/g, "lane 0");
    const m = action(r) as Move | undefined;
    return t.includes(lane) && !!m && mistake.safe.includes(m);
  });
  return ok
    ? null
    : `After your change no rule would have saved the frog. It died moving ${mistake.move} into ${lane}; only ${mistake.safe.join(", ")} kept it alive. Make a change that adds or fixes a rule about ${lane} with one of those moves.`;
}

// Asks once; if the edit can't be applied or wouldn't have saved the frog,
// asks again with the problem pointed out. A second failure is a failed lesson.
export async function writeLesson(input: {
  playbook: string[];
  beats: BeatLog[];
  cause: "hit" | "stalled";
  history?: RunRecord[];
}): Promise<Lesson> {
  const mistake = mistakeBeat(input);
  let note: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await ask(input, mistake, note);
    const applied = applyEdit(input.playbook, reply.edit, reply.rule);
    const problem = typeof applied === "string" ? applied : coversMistake(applied.rules, mistake);
    if (!problem && typeof applied !== "string")
      return { whatHappened: reply.whatHappened, change: applied.change, playbook: [...applied.rules, DEFAULT_RULE] };
    note = problem ?? undefined;
  }
  throw new LessonError(note ?? "The coach's change could not be used");
}

async function ask(
  input: { playbook: string[]; beats: BeatLog[]; cause: "hit" | "stalled"; history?: RunRecord[] },
  mistake: ReturnType<typeof mistakeBeat>,
  retryNote?: string,
) {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new LessonError("NEBIUS_API_KEY is not set");

  const last = input.beats[input.beats.length - 1];
  const history = (input.history ?? []).slice(-5);
  const rules = learned(input.playbook);
  const user = [
    ...(history.length
      ? [
          "Run history (oldest first), with the rules each run used:",
          ...history.map(
            (h, i) =>
              `Run ${i + 1}: reached row ${h.distance} (${h.cause}). Rules: ${learned(h.playbook).map((r, j) => `${j + 1}) ${r}`).join(" ") || "none yet"}`,
          ),
        ]
      : []),
    "Playbook used this run:",
    ...rules.map((r, i) => `${i + 1}. ${r}`),
    `(then: ${DEFAULT_RULE})`,
    `Cause: ${input.cause === "hit" ? "hit by a car" : "stalled: no forward progress for 9 seconds"}`,
    "Last decisions (oldest first):",
    ...input.beats.map(
      (b, i) => `Decision ${i + 1}.\n${b.state}\nMove chosen: ${b.move}: ${b.moveText} (confidence ${b.confidence.toFixed(2)})`,
    ),
    ...(last?.options
      ? ["All five options at the last decision were:", ...Object.entries(last.options).map(([m, t]) => `- ${m}: ${t}`)]
      : []),
    ...(mistake
      ? [
          mistake.index === input.beats.length - 1
            ? `Hindsight from the replay: at the last decision these moves would have kept the frog alive: ${mistake.safe.join(", ")}.`
            : `Hindsight from the replay: by the last decision no move could save the frog. The mistake was decision ${mistake.index + 1} (move chosen: ${input.beats[mistake.index].move}: ${input.beats[mistake.index].moveText}). There, these moves would have kept it alive: ${mistake.safe.join(", ")}.`,
        ]
      : []),
    ...(retryNote ? [`Your last change didn't work: ${retryNote}`] : []),
  ].join("\n");

  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.LESSON_MODEL || "nvidia/Nemotron-3_5-Lightning",
      max_tokens: process.env.LESSON_THINKING === "on" ? 4000 : 300,
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
  if (process.env.LESSON_DEBUG) console.error(`--- coach reply${retryNote ? " (retry)" : ""} ---\n${body?.choices?.[0]?.message?.content}`);
  return parseReply(body?.choices?.[0]);
}

export function parseReply(choice: { finish_reason?: string; message?: { content?: string } } | undefined): {
  whatHappened: string;
  edit: Edit;
  rule?: string;
} {
  let text = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length" && !text.trim()) throw new LessonError("Lesson ran out of tokens");
  const think = text.lastIndexOf("</think>");
  if (think >= 0) text = text.slice(think + "</think>".length);
  const lines = text.split("\n").map((l) => l.trim().replace(/^[*_#>\s]+/, "").replace(/[*_]+$/, ""));
  const field = (label: string) =>
    lines
      .find((l) => l.toLowerCase().startsWith(label))
      ?.slice(label.length)
      .replace(/^[:\s*]+/, "")
      .replace(/^["']|["']$/g, "")
      .trim();
  const whatHappened = field("what happened");
  const change = field("change")?.toLowerCase() ?? "";
  const rule = field("rule")?.replace(/^\d+[.)]\s*/, "").slice(0, 140);
  const m = change.match(/^(add|replace|remove)(?:\s+(?:rule\s+)?(\d+))?/);
  if (!whatHappened || !m) throw new LessonError("Lesson reply was missing a line");
  const edit: Edit = m[1] === "add" ? { op: "add" } : { op: m[1] as "replace" | "remove", n: Number(m[2] ?? 0) };
  return { whatHappened, edit, rule };
}
