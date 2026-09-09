// Uses Deno's built-in Node compat (`node:assert/strict`) rather than
// deno.land/std, since this sandbox's network proxy blocks deno.land — see
// docs/DECISIONS.md. Works identically under a real `deno test` elsewhere.
import assert from "node:assert/strict";
import { currentPeriodMonth, selectProvider } from "./index.ts";

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
