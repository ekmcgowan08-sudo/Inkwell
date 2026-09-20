import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Chapter } from "@inkwell/shared-types";

const state = vi.hoisted(() => ({
  updateResult: { data: [{ id: "c1" }] as unknown, error: null as unknown },
  selectResult: { data: null as unknown, error: null as unknown },
  upsertResult: { data: null as unknown, error: null as unknown },
  upsertCalls: [] as { table: string; row: Record<string, unknown> }[],
  updateCalls: [] as { table: string; row: Record<string, unknown> }[],
}));

vi.mock("./env", () => ({ isLocalOnlyMode: false }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from(table: string) {
      return {
        update: (row: Record<string, unknown>) => {
          state.updateCalls.push({ table, row });
          return { eq: () => ({ eq: () => ({ select: () => Promise.resolve(state.updateResult) }) }) };
        },
        upsert: (row: Record<string, unknown>) => {
          state.upsertCalls.push({ table, row });
          return Promise.resolve(state.upsertResult);
        },
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(state.selectResult) }) }),
        delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      };
    },
  }),
}));

// Imported after the mocks above so sync.ts picks up the mocked ./env and ./supabase.
const { db } = await import("./db");
const { pushUpsert, resolveConflictKeepMine, resolveConflictKeepTheirs, getSyncStatus } = await import("./sync");

function makeChapter(overrides: Partial<Chapter>): Chapter {
  return {
    id: "c1",
    projectId: "p1",
    partId: null,
    title: "Chapter One",
    sortOrder: 0,
    status: "drafting",
    summary: null,
    revision: 0,
    wordCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("sync.ts — revision-gated push and conflict resolution", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    state.updateResult = { data: [{ id: "c1" }], error: null };
    state.selectResult = { data: null, error: null };
    state.upsertResult = { data: null, error: null };
    state.upsertCalls = [];
    state.updateCalls = [];
  });

  it("does a plain upsert for a row's first-ever push (revision 0), not a gated update", async () => {
    await pushUpsert("chapters", "c1", makeChapter({ revision: 0 }) as unknown as Record<string, unknown>);
    expect(state.upsertCalls).toHaveLength(1);
    expect(state.updateCalls).toHaveLength(0);
    expect(getSyncStatus()).toBe("synced");
  });

  it("gates subsequent pushes on the row's previous revision, and succeeds when the server still matches", async () => {
    state.updateResult = { data: [{ id: "c1" }], error: null };
    await pushUpsert("chapters", "c1", makeChapter({ revision: 1 }) as unknown as Record<string, unknown>);
    expect(state.updateCalls).toHaveLength(1);
    expect(getSyncStatus()).toBe("synced");
  });

  it("records a conflict (never silently overwrites) when another write already landed server-side", async () => {
    state.updateResult = { data: [], error: null }; // zero rows matched: base revision no longer current
    state.selectResult = { data: { id: "c1", title: "Someone else's edit", revision: 5 }, error: null };

    await pushUpsert("chapters", "c1", makeChapter({ title: "My edit", revision: 2 }) as unknown as Record<string, unknown>);

    expect(getSyncStatus()).toBe("conflict");
    const conflicts = await db.syncConflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.serverRow.revision).toBe(5);
    expect(conflicts[0]!.localRow.title).toBe("My edit");
  });

  it("keeps the server row absent case as a plain insert, not a false conflict", async () => {
    state.updateResult = { data: [], error: null };
    state.selectResult = { data: null, error: null }; // never synced before, e.g. queued from offline

    await pushUpsert("chapters", "c1", makeChapter({ revision: 3 }) as unknown as Record<string, unknown>);

    expect(getSyncStatus()).toBe("synced");
    expect(state.upsertCalls).toHaveLength(1);
    expect(await db.syncConflicts.count()).toBe(0);
  });

  it("resolveConflictKeepMine re-pushes past the server's revision and updates the local copy to match", async () => {
    await db.chapters.put(makeChapter({ revision: 2 }));
    await db.syncConflicts.put({
      id: "chapters:c1",
      table: "chapters",
      recordId: "c1",
      localRow: makeChapter({ title: "Mine", revision: 2 }) as unknown as Record<string, unknown>,
      serverRow: { id: "c1", title: "Theirs", revision: 5 },
      detectedAt: "2026-01-01T00:00:00.000Z",
    });

    await resolveConflictKeepMine("chapters:c1");

    expect(await db.syncConflicts.count()).toBe(0);
    expect(state.upsertCalls).toHaveLength(1);
    expect(state.upsertCalls[0]!.row.revision).toBe(6); // one past the server's
    const localChapter = await db.chapters.get("c1");
    expect(localChapter!.revision).toBe(6);
  });

  it("resolveConflictKeepTheirs overwrites the local row with the server's version", async () => {
    await db.chapters.put(makeChapter({ title: "Mine", revision: 2 }));
    await db.syncConflicts.put({
      id: "chapters:c1",
      table: "chapters",
      recordId: "c1",
      localRow: makeChapter({ title: "Mine", revision: 2 }) as unknown as Record<string, unknown>,
      serverRow: {
        id: "c1",
        title: "Theirs",
        revision: 5,
        project_id: "p1",
        sort_order: 0,
        part_id: null,
        status: "drafting",
        summary: null,
        word_count: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
      detectedAt: "2026-01-01T00:00:00.000Z",
    });

    await resolveConflictKeepTheirs("chapters:c1");

    expect(await db.syncConflicts.count()).toBe(0);
    const localChapter = await db.chapters.get("c1");
    expect(localChapter!.title).toBe("Theirs");
    expect(localChapter!.revision).toBe(5);
  });
});
