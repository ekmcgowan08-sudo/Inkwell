import { describe, expect, it, vi } from "vitest";

// Regression coverage for a real gap: theme/reduced-motion have always been localStorage-only,
// even for signed-in cloud accounts, despite `preferences` existing as an RLS-protected table
// specifically for this since early in the project. loadRemotePreferences/saveRemotePreferences
// are the sync layer that finally uses it — see theme.tsx for how they're wired in.
const state = vi.hoisted(() => ({
  userId: "aaaaaaaa-0000-0000-0000-000000000001" as string | null,
  preferencesRow: null as { theme: string; reduced_motion: boolean } | null,
  upsertCalls: [] as unknown[],
}));

vi.mock("../env", () => ({ isLocalOnlyMode: false }));
vi.mock("../supabase", () => ({
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: state.userId ? { user: { id: state.userId } } : null } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === "preferences" ? state.preferencesRow : null }),
        }),
      }),
      upsert: async (payload: unknown) => {
        state.upsertCalls.push(payload);
        return { error: null };
      },
    }),
  }),
}));

const { loadRemotePreferences, saveRemotePreferences } = await import("./preferences");

describe("preferences repo — cross-device theme sync", () => {
  it("returns null when there is no signed-in session", async () => {
    state.userId = null;
    state.preferencesRow = { theme: "dark", reduced_motion: true };
    const result = await loadRemotePreferences();
    expect(result).toBeNull();
  });

  it("returns null when the user has no preferences row yet", async () => {
    state.userId = "aaaaaaaa-0000-0000-0000-000000000001";
    state.preferencesRow = null;
    const result = await loadRemotePreferences();
    expect(result).toBeNull();
  });

  it("loads and camelCases the remote row", async () => {
    state.userId = "aaaaaaaa-0000-0000-0000-000000000001";
    state.preferencesRow = { theme: "dark", reduced_motion: true };
    const result = await loadRemotePreferences();
    expect(result).toEqual({ theme: "dark", reducedMotion: true });
  });

  it("saveRemotePreferences upserts snake_case columns keyed by user_id", async () => {
    state.userId = "aaaaaaaa-0000-0000-0000-000000000001";
    state.upsertCalls = [];
    await saveRemotePreferences({ theme: "light", reducedMotion: false });
    expect(state.upsertCalls).toHaveLength(1);
    expect(state.upsertCalls[0]).toEqual({ user_id: state.userId, theme: "light", reduced_motion: false });
  });

  it("saveRemotePreferences is a no-op with no signed-in session", async () => {
    state.userId = null;
    state.upsertCalls = [];
    await saveRemotePreferences({ theme: "light", reducedMotion: false });
    expect(state.upsertCalls).toHaveLength(0);
  });
});
