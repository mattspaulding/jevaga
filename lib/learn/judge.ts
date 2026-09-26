import { applyChange, type CoachInput, type Coaching } from "../system2/coach";
import type { Control, Death } from "./recorder";
import { replay, REPLAY_MAX_PAST, type Decide, type ReplayResult } from "./replay";

// The judge: after each death, reproduce it, ask the coach for a rule, and
// keep the rule only if the replay of this death now survives, the most
// recent deaths the rules already fixed still survive, and Jev still fires
// in calm moments. Nothing here trusts the coach; everything is flown.

export type Book = { rules: string[]; deaths: Death[]; controls: Control[] };
export const emptyBook = (): Book => ({ rules: [], deaths: [], controls: [] });

const REGRESSION_LIMIT = 8; // most recent fixed deaths re-flown for each new rule
const ATTEMPTS = 2; // rules tested per death: the coach's first rule and one retry
const COACH_CALLS = 3; // a failed or garbled coach reply gets one extra call without using up a test

export type JudgeStep =
  | { kind: "reproduce" }
  | { kind: "coach"; attempt: number }
  | { kind: "test"; attempt: number; coaching: Coaching }
  | { kind: "earlier"; attempt: number; i: number; of: number }
  | { kind: "controls"; attempt: number };

export type Attempt = {
  coaching?: Coaching;
  error?: string; // the coach failed or broke the format
  thisDeath?: ReplayResult;
  earlier: { tested: number; survived: number };
  controls: { tested: number; fired: number; before: number }; // before: fired with the current rules
  passed: boolean;
  why?: string; // why the rule was thrown out, as told to the coach on the retry
};

export type Verdict = {
  kind: "kept" | "luck" | "none" | "didnt-hold" | "untested" | "coach-failed";
  death: Death;
  attempts: Attempt[];
  book: Book; // the book after this death
  shown?: { rules: string[]; result: ReplayResult }; // the replay to play on the canvas
  error?: string;
};

export class Cancelled extends Error {}

export type JudgeDeps = {
  decide: Decide; // Jev, paced
  coach: (input: CoachInput) => Promise<Coaching>;
  onStep?: (step: JudgeStep) => void;
  cancelled?: () => boolean;
};

const s1 = (x: number) => `${x.toFixed(1)} s`;

function whyItDied(death: Death, r: ReplayResult): string {
  const picks = r.moves.map((m) => m.move).join(", ") || "nothing";
  if (r.stillThreatened) return `in the replay the pilot picked ${picks} and was still about to be hit ${s1(REPLAY_MAX_PAST)} after the old hit.`;
  const when = r.final.t - death.tHit;
  const at = r.hitBy ? ` by a ${r.hitBy.by} at x ${r.hitBy.x.toFixed(1)}` : "";
  return `in the replay the pilot picked ${picks} and was hit${at} ${Math.abs(when) < 0.05 ? "at the same moment" : when < 0 ? `${s1(-when)} earlier` : `${s1(when)} later`}.`;
}

export async function afterDeath(death: Death, before: Book, deps: JudgeDeps): Promise<Verdict> {
  const check = () => {
    if (deps.cancelled?.()) throw new Cancelled("stopped");
  };
  const book: Book = { rules: [...before.rules], deaths: [...before.deaths], controls: [...before.controls] };
  const save = (status: Death["status"], happened?: string) => {
    const d = { ...death, status, happened };
    book.deaths.push(d);
    return d;
  };
  const attempts: Attempt[] = [];

  deps.onStep?.({ kind: "reproduce" });
  const again = await replay(death, death.rules, deps.decide);
  check();
  if (again.outcome === "untested") return { kind: "untested", death, attempts, book: before, error: again.error };
  if (again.outcome === "survived") {
    const d = save("luck");
    return { kind: "luck", death: d, attempts, book, shown: { rules: death.rules, result: again } };
  }

  // How often Jev fires in the calm moments with the rules it has now: a new rule may not lower it.
  let firedBefore: number | null = null;
  const firedWith = async (rules: string[]) => {
    let fired = 0;
    for (const c of book.controls) {
      if ((await deps.decide({ ...c, rules })).move === "fire") fired++;
      check();
    }
    return fired;
  };

  let retry: string | undefined;
  let lastShown: Verdict["shown"] = { rules: death.rules, result: again };
  let tested = 0;
  for (let call = 1; call <= COACH_CALLS && tested < ATTEMPTS; call++) {
    const attempt = tested + 1;
    const a: Attempt = { earlier: { tested: 0, survived: 0 }, controls: { tested: 0, fired: 0, before: 0 }, passed: false };
    attempts.push(a);

    deps.onStep?.({ kind: "coach", attempt });
    try {
      a.coaching = await deps.coach({ asked: death.asked, tHit: death.tHit, hitBy: death.hitBy, rules: book.rules, retry });
    } catch (e) {
      a.error = e instanceof Error ? e.message : String(e);
      if (!/timeout|aborted|fetch|network|50\d/i.test(a.error)) retry = `your reply couldn't be used (${a.error}).`;
      check();
      continue;
    }
    tested++;
    check();
    const coaching = a.coaching;
    if (coaching.change.kind === "none") {
      const d = save("unsolved", coaching.happened);
      return { kind: "none", death: d, attempts, book, shown: lastShown };
    }
    const candidate = applyChange(book.rules, coaching);

    deps.onStep?.({ kind: "test", attempt, coaching });
    a.thisDeath = await replay(death, candidate, deps.decide);
    check();
    if (a.thisDeath.outcome === "untested") return { kind: "untested", death, attempts, book: before, error: a.thisDeath.error };
    lastShown = { rules: candidate, result: a.thisDeath };
    if (a.thisDeath.outcome !== "survived") {
      a.why = `your rule "${coaching.rule}" didn't save it: ${whyItDied(death, a.thisDeath)}`;
      retry = a.why;
      continue;
    }

    const fixed = book.deaths.filter((d) => d.status === "fixed").slice(-REGRESSION_LIMIT);
    let broke: Death | null = null;
    for (const [i, d] of fixed.entries()) {
      deps.onStep?.({ kind: "earlier", attempt, i: i + 1, of: fixed.length });
      const r = await replay(d, candidate, deps.decide);
      check();
      if (r.outcome === "untested") return { kind: "untested", death, attempts, book: before, error: r.error };
      a.earlier.tested++;
      if (r.outcome === "survived") a.earlier.survived++;
      else {
        broke = d;
        break;
      }
    }
    if (broke) {
      a.why = `your rule "${coaching.rule}" saved this death but broke an earlier fix: the pilot died again in run ${broke.run} (${broke.happened ?? "an earlier death"}).`;
      retry = a.why;
      continue;
    }

    if (book.controls.length) {
      deps.onStep?.({ kind: "controls", attempt });
      firedBefore ??= await firedWith(book.rules);
      a.controls = { tested: book.controls.length, fired: await firedWith(candidate), before: firedBefore };
      if (a.controls.fired < a.controls.before) {
        a.why = `your rule "${coaching.rule}" made the pilot shoot less: with nothing arriving and an enemy above, it fired in ${a.controls.fired} of ${a.controls.tested} calm moments, down from ${a.controls.before} without it.`;
        retry = a.why;
        continue;
      }
    }

    a.passed = true;
    book.rules = candidate;
    const d = save("fixed", coaching.happened);
    return { kind: "kept", death: d, attempts, book, shown: lastShown };
  }

  const coached = attempts.some((a) => a.coaching);
  const d = save("unsolved", attempts.find((a) => a.coaching)?.coaching?.happened);
  return { kind: coached ? "didnt-hold" : "coach-failed", death: d, attempts, book, shown: lastShown };
}
