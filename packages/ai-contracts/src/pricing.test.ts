import { describe, expect, it } from "vitest";
import { estimateCostUsdMicros, formatUsdMicros, MODEL_PRICING_USD_PER_MILLION_TOKENS } from "./pricing.ts";

describe("estimateCostUsdMicros", () => {
  it("computes cost from a known model's input/output rates", () => {
    const { input, output } = MODEL_PRICING_USD_PER_MILLION_TOKENS["claude-sonnet-5"]!;
    const micros = estimateCostUsdMicros("claude-sonnet-5", 1_000_000, 1_000_000);
    expect(micros).toBe(Math.round((input + output) * 1_000_000));
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCostUsdMicros("claude-sonnet-5", 0, 0)).toBe(0);
  });

  it("falls back to the default pricing bucket for an unrecognized model id", () => {
    const known = estimateCostUsdMicros("claude-sonnet-5", 500, 500);
    const unknown = estimateCostUsdMicros("some-future-model-id", 500, 500);
    expect(unknown).toBe(known);
  });

  it("prices input and output tokens independently, not just by total token count", () => {
    // Opus's rates are asymmetric (input 15, output 75 per million) — an implementation that
    // priced total tokens at a single blended rate would get this wrong.
    const inputHeavy = estimateCostUsdMicros("claude-opus-5", 1_000_000, 0);
    const outputHeavy = estimateCostUsdMicros("claude-opus-5", 0, 1_000_000);
    expect(outputHeavy).toBeGreaterThan(inputHeavy);
  });
});

describe("formatUsdMicros", () => {
  it("formats micro-dollars as a dollar amount with 4 decimal places", () => {
    expect(formatUsdMicros(1_000_000)).toBe("$1.0000");
    expect(formatUsdMicros(0)).toBe("$0.0000");
    expect(formatUsdMicros(1_234)).toBe("$0.0012");
  });
});
