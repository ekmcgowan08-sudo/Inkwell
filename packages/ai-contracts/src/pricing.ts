/**
 * Anthropic API pricing used only to estimate and cap spend — NOT a billing
 * source of truth. Verify against https://www.anthropic.com/pricing before
 * relying on these numbers; update `PRICING_CHECKED_AT` whenever you do.
 * Prices are per-million-tokens in USD, as commonly published for the Claude
 * model family at authoring time. Treat as a hypothesis requiring owner
 * confirmation — see docs/COSTS.md.
 */
export const PRICING_CHECKED_AT = "2026-09-09";

export const MODEL_PRICING_USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  // Fallback bucket used when the configured model isn't in this table yet.
  default: { input: 3, output: 15 },
};

/** Returns cost in micro-dollars (millionths of USD) to avoid float drift in storage. */
export function estimateCostUsdMicros(model: string, tokensInput: number, tokensOutput: number): number {
  const pricing = MODEL_PRICING_USD_PER_MILLION_TOKENS[model] ?? MODEL_PRICING_USD_PER_MILLION_TOKENS.default!;
  const dollars = (tokensInput / 1_000_000) * pricing.input + (tokensOutput / 1_000_000) * pricing.output;
  return Math.round(dollars * 1_000_000);
}

export function formatUsdMicros(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}
