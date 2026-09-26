import type { RunRecord } from "../system2/nemotron";

// What the coach remembers between runs: every run so far, the best run and
// the playbook it used, and rules that were taken back because they backfired.
export type CoachMemory = {
  history: RunRecord[];
  best: { run: number; distance: number; playbook: string[] } | null;
  rejected: string[];
};

export type Rollback = { playbook: string[]; undone: string[]; bestRun: number; bestDistance: number; distance: number };

export const newMemory = (): CoachMemory => ({ history: [], best: null, rejected: [] });

const same = (a: string[], b: string[]) => a.length === b.length && a.every((r, i) => r === b[i]);

// A run "backfired" if it did much worse than the best run while using a
// different playbook: at most 60% of the best distance and at least 4 rows short.
const backfired = (distance: number, best: number) => distance <= best * 0.6 && best - distance >= 4;

// Records a finished run. Returns a rollback when the playbook it used did
// much worse than the best one: the playbook goes back to the best run's, and
// the rules added since are remembered as rejected so the coach won't retry them.
export function afterRun(mem: CoachMemory, run: RunRecord & { n: number }): Rollback | null {
  mem.history = [...mem.history, { distance: run.distance, cause: run.cause, playbook: run.playbook }];
  if (!mem.best || run.distance > mem.best.distance) {
    mem.best = { run: run.n, distance: run.distance, playbook: run.playbook };
    return null;
  }
  if (same(run.playbook, mem.best.playbook) || !backfired(run.distance, mem.best.distance)) return null;
  const kept = new Set(mem.best.playbook);
  const undone = run.playbook.filter((r) => !kept.has(r));
  mem.rejected = [...new Set([...mem.rejected, ...undone])];
  return { playbook: mem.best.playbook, undone, bestRun: mem.best.run, bestDistance: mem.best.distance, distance: run.distance };
}
