// Uses Deno's built-in Node compat (`node:assert/strict`) rather than
// deno.land/std, since this sandbox's network proxy blocks deno.land — see
// docs/DECISIONS.md. Works identically under a real `deno test` elsewhere.
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAndRecordRateLimit } from "./rateLimit.ts";

function makeQuery(response: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "lt", "gte"]) chain[method] = () => chain;
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    Promise.resolve(response).then(onFulfilled, onRejected);
  return chain;
}

function makeFakeClient(opts: {
  existingCount: number;
  deleteCalls?: unknown[];
  insertCalls?: unknown[];
  insertError?: { message: string } | null;
}): SupabaseClient {
  return {
    from() {
      return {
        delete() {
          opts.deleteCalls?.push(true);
          return makeQuery({ data: null, error: null });
        },
        select() {
          return makeQuery({ data: null, error: null, count: opts.existingCount });
        },
        insert(row: unknown) {
          opts.insertCalls?.push(row);
          return Promise.resolve({ data: null, error: opts.insertError ?? null });
        },
      };
    },
  } as unknown as SupabaseClient;
}

Deno.test("checkAndRecordRateLimit allows a request under the limit and records it", async () => {
  const insertCalls: unknown[] = [];
  const client = makeFakeClient({ existingCount: 3, insertCalls });

  const result = await checkAndRecordRateLimit(client, "user-1", 60, 8);

  assert.equal(result.allowed, true);
  assert.equal(result.retryAfterSeconds, 0);
  assert.equal(insertCalls.length, 1);
  assert.deepEqual(insertCalls[0], { user_id: "user-1" });
});

Deno.test("checkAndRecordRateLimit blocks a request at the limit, without recording an extra event", async () => {
  const insertCalls: unknown[] = [];
  const client = makeFakeClient({ existingCount: 8, insertCalls });

  const result = await checkAndRecordRateLimit(client, "user-1", 60, 8);

  assert.equal(result.allowed, false);
  assert.equal(result.retryAfterSeconds, 60);
  assert.equal(insertCalls.length, 0);
});

Deno.test("checkAndRecordRateLimit prunes old events for this user before checking (opportunistic cleanup)", async () => {
  const deleteCalls: unknown[] = [];
  const client = makeFakeClient({ existingCount: 0, deleteCalls });

  await checkAndRecordRateLimit(client, "user-1", 60, 8);

  assert.equal(deleteCalls.length, 1);
});

Deno.test("checkAndRecordRateLimit surfaces a real database error rather than silently allowing the request", async () => {
  const client = makeFakeClient({ existingCount: 0, insertError: { message: "boom" } });
  await assert.rejects(() => checkAndRecordRateLimit(client, "user-1", 60, 8), /Rate limit record failed: boom/);
});
