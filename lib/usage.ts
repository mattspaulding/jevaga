// Token and dollar accounting for Jev and Nemotron, shared by the page and the
// headless scripts (scripts/learn.ts, scripts/sim.ts, scripts/coach-bench.ts).

export type JevUsage = { answers: number; cached: number; inputTokens: number; outputTokens: number; costUsd: number };
export type NemotronUsage = { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
export type Usage = { jev: JevUsage; nemotron: NemotronUsage };

export const emptyUsage = (): Usage => ({
  jev: { answers: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  nemotron: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
});

// Nebius Token Factory list prices in dollars per million tokens. Lightning:
// the Token Factory model endpoints page, checked 2026-09-26. Nano (the coach's
// fallback): Nebius's listing on cloudprice.net and typingmind.com, checked
// 2026-10-21, because Nebius's own price page needs a login. Jev's cost comes
// back on every answer (provider_metadata.gateway.cost) and is never derived.
const NEMOTRON_PRICES: Record<string, { input: number; output: number }> = {
  "nvidia/Nemotron-3_5-Lightning": { input: 0.06, output: 0.24 },
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": { input: 0.06, output: 0.24 },
};
export const NEMOTRON_INPUT_PER_1M_USD = NEMOTRON_PRICES["nvidia/Nemotron-3_5-Lightning"].input;
export const NEMOTRON_OUTPUT_PER_1M_USD = NEMOTRON_PRICES["nvidia/Nemotron-3_5-Lightning"].output;

// A model with no looked-up price is counted at Lightning's.
export function nemotronCost(inputTokens: number, outputTokens: number, model?: string): number {
  const p = (model && NEMOTRON_PRICES[model]) || NEMOTRON_PRICES["nvidia/Nemotron-3_5-Lightning"];
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

type Counted = { inputTokens?: number; outputTokens?: number; costUsd?: number };

// Add one Jev answer, cached or not, to a running total. Missing numbers count as 0.
export function addJevAnswer(usage: Usage, u?: Counted & { cached?: boolean }): void {
  usage.jev.answers++;
  if (u?.cached) usage.jev.cached++;
  usage.jev.inputTokens += u?.inputTokens ?? 0;
  usage.jev.outputTokens += u?.outputTokens ?? 0;
  usage.jev.costUsd += u?.costUsd ?? 0;
}

// Add one Nemotron rule-writing call to a running total. Missing numbers count as 0.
export function addCoachCall(usage: Usage, u?: Counted): void {
  usage.nemotron.calls++;
  usage.nemotron.inputTokens += u?.inputTokens ?? 0;
  usage.nemotron.outputTokens += u?.outputTokens ?? 0;
  usage.nemotron.costUsd += u?.costUsd ?? 0;
}

export function totalCostUsd(usage: Usage): number {
  return usage.jev.costUsd + usage.nemotron.costUsd;
}

// 812, 12.4K, 1.2M
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// $0.0012, $0.034, $1.20 — enough digits to show a small charge, fewer once it's a real amount.
export function formatUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

// The same totals, printed the same way, at the end of every headless script.
export function summarizeUsage(usage: Usage): string {
  const { jev, nemotron } = usage;
  return [
    `Jev: ${jev.answers} answers (${jev.cached} cached) · ${formatTokens(jev.inputTokens + jev.outputTokens)} tokens · ${formatUsd(jev.costUsd)}`,
    `Nemotron: ${nemotron.calls} calls · ${formatTokens(nemotron.inputTokens + nemotron.outputTokens)} tokens · ${formatUsd(nemotron.costUsd)}`,
    `Total: ${formatUsd(totalCostUsd(usage))}`,
  ].join("\n");
}
