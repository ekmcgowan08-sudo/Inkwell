// Uses Deno's built-in Node compat (`node:assert/strict`) rather than
// deno.land/std, since this sandbox's network proxy blocks deno.land — see
// docs/DECISIONS.md. Works identically under a real `deno test` elsewhere.
import assert from "node:assert/strict";
import { statusForErrorCode } from "./errors.ts";
import { errorCodeSchema } from "@inkwell/ai-contracts";

Deno.test("statusForErrorCode maps every AssistantErrorCode to an HTTP status", () => {
  assert.equal(statusForErrorCode("unauthorized"), 401);
  assert.equal(statusForErrorCode("project_not_found"), 404);
  assert.equal(statusForErrorCode("ai_disabled_for_project"), 403);
  assert.equal(statusForErrorCode("rate_limited"), 429);
  assert.equal(statusForErrorCode("usage_allowance_exceeded"), 429);
  assert.equal(statusForErrorCode("provider_error"), 502);
  assert.equal(statusForErrorCode("invalid_request"), 400);
});

Deno.test("statusForErrorCode has an entry for every code the schema allows — catches a new code added without a status", () => {
  for (const code of errorCodeSchema.options) {
    const status = statusForErrorCode(code);
    assert.equal(typeof status, "number");
    assert.equal(status >= 400 && status < 600, true, `expected an HTTP error status for "${code}", got ${status}`);
  }
});
