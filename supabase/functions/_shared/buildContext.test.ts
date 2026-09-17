// Uses Deno's built-in Node compat (`node:assert/strict`) rather than
// deno.land/std, since this sandbox's network proxy blocks deno.land — see
// docs/DECISIONS.md. Works identically under a real `deno test` elsewhere.
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildContextFromSupabase } from "./buildContext.ts";

type Resp = { data: unknown; error: { message: string } | null };
type Filter = { op: string; col: string; val: unknown };
/** A static response, or a function of the `.eq()`/`.neq()` filters applied — lets a single table
 * mock return different rows depending on which project_id/series_id was actually queried for. */
type TableResponse = Resp | ((filters: Filter[]) => Resp);

function makeQuery(responder: TableResponse) {
  // Mimics supabase-js's chainable, thenable query builder: every filter/
  // modifier method returns the same object, and awaiting it resolves to
  // the canned response — enough to exercise buildContext.ts's query shapes
  // without a real Postgres connection.
  const filters: Filter[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "is", "not", "order", "limit"]) chain[method] = () => chain;
  for (const op of ["eq", "neq"]) {
    chain[op] = (col: string, val: unknown) => {
      filters.push({ op, col, val });
      return chain;
    };
  }
  chain.then = (onFulfilled: (v: Resp) => unknown, onRejected: (e: unknown) => unknown) => {
    const response = typeof responder === "function" ? responder(filters) : responder;
    return Promise.resolve(response).then(onFulfilled, onRejected);
  };
  return chain;
}

function makeFakeClient(opts: {
  tables?: Record<string, TableResponse>;
  rpc?: Record<string, Resp>;
  rpcCalls?: string[];
}): SupabaseClient {
  const tables = opts.tables ?? {};
  const rpcResponses = opts.rpc ?? {};
  return {
    from(table: string) {
      return makeQuery(tables[table] ?? { data: [], error: null });
    },
    rpc(fn: string) {
      opts.rpcCalls?.push(fn);
      return Promise.resolve(rpcResponses[fn] ?? { data: [], error: null });
    },
  } as unknown as SupabaseClient;
}

const CHAPTERS: Resp = { data: [{ id: "c1", title: "Chapter One", summary: null }], error: null };

Deno.test("buildContextFromSupabase uses ranked full-text search when the question matches something", async () => {
  const rpcCalls: string[] = [];
  const client = makeFakeClient({
    tables: { chapters: CHAPTERS },
    rpc: {
      search_scenes_ranked: {
        data: [{ id: "s1", chapter_id: "c1", title: "Scene 1", plain_text: "the dragon appears", updated_at: "2026-01-01" }],
        error: null,
      },
      search_story_bible_entries_ranked: {
        data: [{ id: "e1", name: "The Dragon", entry_type: "character", summary: "A dragon.", fields: {} }],
        error: null,
      },
    },
    rpcCalls,
  });

  const ctx = await buildContextFromSupabase(client, "p1", "My Book", null, "tell me about the dragon");

  assert.deepEqual(rpcCalls.sort(), ["search_scenes_ranked", "search_story_bible_entries_ranked"]);
  assert.equal(ctx.retrievedChunks.length, 1);
  assert.equal(ctx.retrievedChunks[0]!.sourceId, "s1");
  assert.equal(ctx.storyBibleDigest[0]!.name, "The Dragon");
});

Deno.test("buildContextFromSupabase falls back to a recency sample when ranked search finds no keyword match", async () => {
  const client = makeFakeClient({
    tables: {
      chapters: CHAPTERS,
      scenes: {
        data: [{ id: "s2", chapter_id: "c1", title: "Scene 2", plain_text: "fallback content", updated_at: "2026-01-02" }],
        error: null,
      },
      story_bible_entries: {
        data: [{ id: "e2", name: "Someone Else", entry_type: "character", summary: "Unrelated.", fields: {} }],
        error: null,
      },
    },
    rpc: {
      search_scenes_ranked: { data: [], error: null },
      search_story_bible_entries_ranked: { data: [], error: null },
    },
  });

  const ctx = await buildContextFromSupabase(client, "p1", "My Book", null, "a question that matches nothing written");

  assert.equal(ctx.retrievedChunks.length, 1);
  assert.equal(ctx.retrievedChunks[0]!.sourceId, "s2");
  assert.equal(ctx.storyBibleDigest[0]!.id, "e2");
});

Deno.test("buildContextFromSupabase skips ranked search entirely for an empty question and goes straight to the recency sample", async () => {
  const rpcCalls: string[] = [];
  const client = makeFakeClient({
    tables: {
      chapters: CHAPTERS,
      scenes: { data: [{ id: "s3", chapter_id: "c1", title: "Scene 3", plain_text: "anything", updated_at: "2026-01-03" }], error: null },
      story_bible_entries: { data: [], error: null },
    },
    rpcCalls,
  });

  const ctx = await buildContextFromSupabase(client, "p1", "My Book", null, "   ");

  assert.deepEqual(rpcCalls, []);
  assert.equal(ctx.retrievedChunks[0]!.sourceId, "s3");
});

const SIBLING_PROJECTS: Resp = { data: [{ id: "p2", title: "Book Two" }], error: null };

function seriesAwareTables(): Record<string, TableResponse> {
  return {
    chapters: (filters) => {
      const projectId = filters.find((f) => f.col === "project_id")?.val;
      if (projectId === "p2") return { data: [{ id: "c-p2", title: "Sibling Chapter", summary: "What happened in book two." }], error: null };
      return { data: [{ id: "c1", title: "Chapter One", summary: null }], error: null };
    },
    canon_facts: (filters) => {
      const projectId = filters.find((f) => f.col === "project_id")?.val;
      if (projectId === "p2") return { data: [{ id: "f-p2", statement: "The dragon died in book two." }], error: null };
      return { data: [], error: null };
    },
    story_bible_entries: (filters) => {
      const projectId = filters.find((f) => f.col === "project_id")?.val;
      if (projectId === "p2") return { data: [{ id: "e-p2", name: "Book Two Character", entry_type: "character", summary: null, fields: {} }], error: null };
      return { data: [], error: null };
    },
    projects: SIBLING_PROJECTS,
  };
}

Deno.test("buildContextFromSupabase includes a book-labeled slice of sibling series books when seriesScope is on", async () => {
  const client = makeFakeClient({ tables: seriesAwareTables() });

  const ctx = await buildContextFromSupabase(client, "p1", "My Book", null, "", { seriesId: "series-1", seriesScope: true });

  const seriesChapter = ctx.chapterSummaries.find((c) => c.chapterId === "c-p2");
  assert.ok(seriesChapter, "expected the sibling book's chapter to be included");
  assert.equal(seriesChapter!.title, "[Book Two] Sibling Chapter");

  const seriesFact = ctx.approvedCanonFacts.find((f) => f.id === "f-p2");
  assert.ok(seriesFact, "expected the sibling book's canon fact to be included");
  assert.equal(seriesFact!.statement, "[Book Two] The dragon died in book two.");

  const seriesEntry = ctx.storyBibleDigest.find((e) => e.id === "e-p2");
  assert.ok(seriesEntry, "expected the sibling book's story bible entry to be included");
  assert.equal(seriesEntry!.name, "[Book Two] Book Two Character");

  // The active project's own content must still be present alongside the series content.
  assert.ok(ctx.chapterSummaries.some((c) => c.chapterId === "c1"));
});

Deno.test("buildContextFromSupabase never reads other books unless seriesScope is explicitly true", async () => {
  const client = makeFakeClient({ tables: seriesAwareTables() });

  const ctx = await buildContextFromSupabase(client, "p1", "My Book", null, "", { seriesId: "series-1", seriesScope: false });

  assert.ok(!ctx.chapterSummaries.some((c) => c.chapterId === "c-p2"), "series content leaked in despite seriesScope: false");
});

Deno.test("buildContextFromSupabase is a no-op for series content when the project has no series (seriesId null)", async () => {
  const client = makeFakeClient({ tables: seriesAwareTables() });

  const ctx = await buildContextFromSupabase(client, "p1", "My Book", null, "", { seriesId: null, seriesScope: true });

  assert.ok(!ctx.chapterSummaries.some((c) => c.chapterId === "c-p2"), "series content leaked in for a standalone project");
});
