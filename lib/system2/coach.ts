import { ARRIVAL } from "../describe";
import type { HitBy } from "../game/world";
import type { Asked } from "../learn/recorder";
import { MAX_RULE_LENGTH, MAX_RULES } from "../system1/types";
import { nemotronCost } from "../usage";

// Nemotron on Nebius Token Factory is the coach: after each of Jev's deaths it
// reads what Jev saw and picked in the last second or so and writes one rule.
// The game, not the coach, decides whether the rule is kept.
// https://docs.tokenfactory.nebius.com/
const URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";

export class CoachError extends Error {}

export type CoachInput = {
  asked: Asked[]; // oldest first
  tHit: number;
  hitBy: HitBy;
  rules: string[]; // the rulebook Jev died with
  retry?: string; // why the previous attempt's rule was thrown out
};

export type Change = { kind: "add" } | { kind: "replace"; n: number } | { kind: "none" };
export type Coaching = {
  happened: string;
  change: Change;
  rule: string | null;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
};

const SYSTEM = `You coach a fast pilot model flying a ship in a real-time space shooter. About four times a second the pilot reads a short description of the fight and picks one move: left, right, stay or fire. It follows written rules. It has just been hit. You get what it read and what it picked in the last second or so before the hit.

How the game works:
- The ship sits on the bottom row, positions x 0 (left edge) to 8 (right edge). Left or right glides it about 1.2 columns, then it stops. Stay stops it. Fire stops it and shoots straight up if the gun is ready.
- Three kinds of enemy dive at the ship, each its own way. A Drone locks onto a column, moves over and falls straight down it; it never turns or shoots. A Bat zigzags down firing straight down, and 4 rows above the ship turns once toward where the ship is then and flies straight at that spot. A Cyclops parks over a column, shoots twice at where the ship is when it fires, then drops straight down that column. In formation, Bats drop bullets that fall straight down and a Cyclops fires shots that fly straight at where the ship was. One hit ends the run.
- Some enemies are carriers. A carrier Bat fires fans of three bullets, a carrier Drone falls with two mini-drones in the columns either side of it, and a carrier Cyclops parks, shows a warning line down its column for 0.8 s, then fills that column with its Eye Beam for 0.5 s. Shoot a carrier and its weapon drops to the ship's row; gliding onto it takes it until the wave ends: the Fan (each shot splits in three), the Eye Beam (fire hits every enemy in the column at once) or Wingmen (two mini-drones beside the ship that fire with it and each take one hit for it).
- The description gives, for where the ship stops and one glide either side, what reaches the ship first and when ("Bat bullet in 0.4 s", "Drone in 0.8 s", "Cyclops beam in 0.6 s", "nothing for 2.5+ s"), counting what a glide passes under on the way.

What hits the ship: if the ship stops, stays or fires where an enemy or its shot arrives, it is hit when it arrives. An option reading "Cyclops shot in 0.3 s" means taking it gets the ship hit in 0.3 s. An option reading "nothing for 2.5+ s" is clear for now. So the pilot survives by comparing its options by what arrives and when, and picking one where nothing arrives soon.

Your job: write ONE rule that would have saved the pilot, so it recognises the situation next time. The game tests your rule by replaying this exact moment with the rule added. It also replays earlier deaths the rules already fixed, and checks that the pilot still fires in calm moments. A rule that fails any of those is thrown out.

Write the rule as a situation and what to do about it:
- Use the description's own words: the enemy names (Drone, Bat, Cyclops, Bat bullet, Cyclops shot, Cyclops beam), "revving", "falling straight down", "zigzagging", "committed", "parked", "eye glowing", "carrier", "mini-drones", "warning line", "takes the", "where you stop", "a little left", "a little right", "edge", "glide", "stop".
- Say what to do in terms of the moves left, right, stay and fire, or "the option where nothing arrives soon". Only name left or right when the rule says what the description shows on that side; the safe side changes every time.
- Keep it general: no x positions, rows or exact times that only fit this death. A good rule would have saved many deaths, not only this one.
- Never tell the pilot to stop firing when nothing is arriving.
- If nothing the pilot read could have saved it, the change is none.

Reply with exactly three lines and nothing else:
What happened: <one short sentence, 20 words or fewer>
Change: add | replace <rule number> | none   (with no rules yet, it is add)
Rule: <one sentence, 30 words or fewer; leave it empty when the change is none>`;

const s2 = (x: number) => `${x.toFixed(2)} s`;

// When the first thing reaches the ship if it takes this option, from the option's own text.
export function arrivalOf(text: string): number {
  if (/nothing for 2\.5\+ s/.test(text)) return Infinity;
  const m = text.match(ARRIVAL);
  return m ? Number(m[1]) : Infinity;
}

// Hindsight the pilot had in front of it: which options were clear for at least a second.
function hindsight(a: Asked): string {
  const moves = ["left", "right", "stay", "fire"] as const;
  const clear = moves.filter((m) => arrivalOf(a.moves[m]) >= 1);
  const worst = arrivalOf(a.moves[a.pick]);
  const picked = worst === Infinity ? "nothing was arriving on the option it picked" : `the option it picked had something arriving in ${worst.toFixed(1)} s`;
  return clear.length
    ? `Hindsight: options with nothing arriving for at least 1 s: ${clear.join(", ")}; ${picked}.`
    : `Hindsight: every option had something arriving within 1 s; ${picked}.`;
}

export function describeDeath(input: CoachInput): string {
  const moments = input.asked.map((a) =>
    [
      `${s2(input.tHit - a.t)} before the hit, the pilot read:`,
      a.state,
      "Its options:",
      `- left: ${a.moves.left}`,
      `- right: ${a.moves.right}`,
      `- stay: ${a.moves.stay}`,
      `- fire: ${a.moves.fire}`,
      `It picked ${a.pick} (${a.probabilities[a.pick].toFixed(2)}).`,
      hindsight(a),
    ].join("\n"),
  );
  const book = input.rules.length
    ? `The pilot's rules when it died:\n${input.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}${input.rules.length >= MAX_RULES ? `\nThe rulebook is full (${MAX_RULES} rules): replace one.` : ""}`
    : "The pilot had no rules yet.";
  return [
    ...moments,
    `Then a ${input.hitBy.by} hit the ship at x ${input.hitBy.x.toFixed(1)}.`,
    book,
    ...(input.retry ? [`Your last rule was thrown out: ${input.retry} Write a different rule.`] : []),
  ].join("\n\n");
}

// Nemotron's thinking mode: COACH_THINKING=on|off (measured with scripts/coach-bench.ts).
const thinking = () => process.env.COACH_THINKING === "on";

export async function writeRule(input: CoachInput): Promise<Coaching> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new CoachError("NEBIUS_API_KEY is not set");
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.COACH_MODEL || "nvidia/Nemotron-3_5-Lightning",
      // Thinking shares max_tokens, so it gets far more room when it's on.
      max_tokens: thinking() ? 4000 : 300,
      temperature: 0.3,
      chat_template_kwargs: { enable_thinking: thinking() },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: describeDeath(input) },
      ],
    }),
    signal: AbortSignal.timeout(thinking() ? 60_000 : 15_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new CoachError(`Token Factory returned ${res.status}`);
  const coaching = parseCoaching(body?.choices?.[0], input.rules.length);
  // Token Factory reports tokens, not a price; the price is looked up, not guessed.
  const usage = body?.usage;
  const inputTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const outputTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0;
  return { ...coaching, usage: { inputTokens, outputTokens, costUsd: nemotronCost(inputTokens, outputTokens) } };
}

export function parseCoaching(
  choice: { finish_reason?: string; message?: { content?: string } } | undefined,
  ruleCount: number,
): Coaching {
  let text = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length" && !text.trim()) throw new CoachError("The coach ran out of tokens");
  const think = text.lastIndexOf("</think>");
  if (think >= 0) text = text.slice(think + "</think>".length);
  const lines = text.split("\n").map((l) => l.trim().replace(/^[*_#>\s-]+/, "").replace(/\*\*/g, ""));
  const field = (name: string) => {
    const line = lines.find((l) => l.toLowerCase().startsWith(name));
    return line ? line.slice(line.indexOf(":") + 1).trim().replace(/^["']|["']$/g, "") : null;
  };
  const happened = field("what happened");
  const changeText = (field("change") ?? "").toLowerCase();
  const rule = field("rule");
  if (!happened) throw new CoachError("The coach didn't say what happened");
  // The panel shows it; keep it to one readable sentence.
  const short = (t: string) => {
    if (t.length <= 180) return t;
    const cut = t.slice(0, 180).lastIndexOf(". ");
    return cut > 40 ? t.slice(0, cut + 1) : `${t.slice(0, t.slice(0, 177).lastIndexOf(" "))}…`;
  };

  let change: Change;
  const replace = changeText.match(/replace\D*(\d+)/);
  if (replace) change = { kind: "replace", n: Number(replace[1]) };
  else if (changeText.startsWith("add")) change = { kind: "add" };
  else if (changeText.startsWith("none")) change = { kind: "none" };
  else throw new CoachError(`The coach's change wasn't add, replace or none ("${changeText.slice(0, 40)}")`);

  if (change.kind === "none") return { happened: short(happened), change, rule: null };
  if (!rule) throw new CoachError("The coach changed the rulebook but wrote no rule");
  if (rule.startsWith("<")) throw new CoachError("The coach echoed the reply template instead of writing a rule");
  if (rule.length > MAX_RULE_LENGTH) throw new CoachError("The coach's rule was too long");
  // "Replace 1" in an empty or short rulebook means add.
  if (change.kind === "replace" && change.n > ruleCount && ruleCount < MAX_RULES) change = { kind: "add" };
  if (change.kind === "replace" && (change.n < 1 || change.n > ruleCount))
    throw new CoachError(`The coach replaced rule ${change.n}, which doesn't exist`);
  if (change.kind === "add" && ruleCount >= MAX_RULES) throw new CoachError("The coach added a rule to a full rulebook");
  return { happened: short(happened), change, rule };
}

// The rulebook a coaching would produce (the judge tests it before keeping it).
export function applyChange(rules: string[], c: Coaching): string[] {
  if (c.change.kind === "none" || !c.rule) return rules;
  if (c.change.kind === "add") return [...rules, c.rule];
  const n = c.change.n;
  return rules.map((r, i) => (i === n - 1 ? c.rule! : r));
}
