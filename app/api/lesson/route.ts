import { MOVES } from "@/lib/game/world";
import { writeLesson, type BeatLog, type RunRecord } from "@/lib/system2/nemotron";

// System 2: after a run ends, Nemotron on Nebius Token Factory reads the last
// few beats and writes what happened plus one rule for the playbook.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { playbook, beats, cause, history } = body ?? {};
  const valid =
    Array.isArray(playbook) &&
    playbook.length > 0 &&
    playbook.length <= 50 &&
    playbook.every((r: unknown) => typeof r === "string" && r.length <= 200) &&
    (cause === "hit" || cause === "stalled") &&
    Array.isArray(beats) &&
    beats.length > 0 &&
    beats.length <= 6 &&
    beats.every(
      (b: BeatLog) =>
        typeof b?.state === "string" &&
        b.state.length < 4000 &&
        MOVES.includes(b.move) &&
        typeof b.moveText === "string" &&
        b.moveText.length < 500 &&
        typeof b.confidence === "number" &&
        (b.options === undefined || MOVES.every((m) => typeof b.options?.[m] === "string" && b.options[m].length < 500)) &&
        (b.safe === undefined || (Array.isArray(b.safe) && b.safe.every((m) => MOVES.includes(m)))),
    );
  const historyOk =
    history === undefined ||
    (Array.isArray(history) &&
      history.length <= 20 &&
      history.every(
        (h: RunRecord) =>
          typeof h?.distance === "number" &&
          (h.cause === "hit" || h.cause === "stalled") &&
          Array.isArray(h.playbook) &&
          h.playbook.length <= 50 &&
          h.playbook.every((r) => typeof r === "string" && r.length <= 200),
      ));
  if (!valid || !historyOk) return Response.json({ error: "Bad request" }, { status: 400 });

  try {
    return Response.json(await writeLesson({ playbook, beats, cause, history }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[lesson]", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
