// Uses Deno's built-in Node compat (`node:assert/strict`) rather than
// deno.land/std, since this sandbox's network proxy blocks deno.land — see
// docs/DECISIONS.md. Works identically under a real `deno test` elsewhere.
import assert from "node:assert/strict";
import { currentPeriodMonth, defaultMonthlyAllowance, selectProvider } from "./index.ts";

Deno.test("currentPeriodMonth returns a YYYY-MM string", () => {
  assert.match(currentPeriodMonth(), /^\d{4}-\d{2}$/);
});

Deno.test("selectProvider falls back to the deterministic test provider when ANTHROPIC_API_KEY is unset", () => {
  Deno.env.delete("ANTHROPIC_API_KEY");
  const provider = selectProvider();
  assert.equal(provider.name, "test-deterministic");
});

Deno.test("selectProvider uses the Anthropic provider once a key is configured", () => {
  Deno.env.set("ANTHROPIC_API_KEY", "sk-test-fake-key-not-real");
  const provider = selectProvider();
  assert.equal(provider.name.startsWith("anthropic:"), true);
  Deno.env.delete("ANTHROPIC_API_KEY");
});

// Regression coverage for a real gap: AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE previously did nothing
// at all — the allowance check hardcoded 200_000 directly, ignoring the env var entirely, despite
// docs/OWNER_ACTIONS_REQUIRED.md telling the owner to tune it for their cost tolerance.
Deno.test("defaultMonthlyAllowance falls back to 200,000 when the env var is unset", () => {
  Deno.env.delete("AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE");
  assert.equal(defaultMonthlyAllowance(), 200_000);
});

Deno.test("defaultMonthlyAllowance uses the configured env var once set", () => {
  Deno.env.set("AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE", "50000");
  assert.equal(defaultMonthlyAllowance(), 50_000);
  Deno.env.delete("AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE");
});

Deno.test("defaultMonthlyAllowance ignores an invalid or non-positive value and falls back", () => {
  Deno.env.set("AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE", "not-a-number");
  assert.equal(defaultMonthlyAllowance(), 200_000);
  Deno.env.set("AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE", "-5");
  assert.equal(defaultMonthlyAllowance(), 200_000);
  Deno.env.delete("AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE");
});
