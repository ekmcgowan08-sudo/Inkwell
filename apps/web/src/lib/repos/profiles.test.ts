import { describe, expect, it, vi } from "vitest";

// Regression coverage for the "terms/privacy acceptance never gets recorded" gap: onboarding used
// to show a plain-text "by continuing you agree..." disclaimer that wrote nothing anywhere, so
// docs/IMPLEMENTATION_STATUS.md honestly flagged it as not actually implemented. hasAcceptedLegalTerms
// / acceptLegalTerms are the client-side half of the fix (see LegalAcceptancePage.tsx for the UI).
const state = vi.hoisted(() => ({
  profileRow: null as { terms_accepted_at: string | null; privacy_accepted_at: string | null } | null,
  updateCalls: [] as { table: string; payload: unknown; id: string }[],
}));

vi.mock("../env", () => ({ isLocalOnlyMode: false }));
vi.mock("../supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({ data: table === "profiles" ? state.profileRow : null }),
        }),
      }),
      update: (payload: unknown) => ({
        eq: async (_col: string, id: string) => {
          state.updateCalls.push({ table, payload, id });
          return { error: null };
        },
      }),
    }),
  }),
}));

const { hasAcceptedLegalTerms, acceptLegalTerms } = await import("./profiles");

describe("profiles repo — legal terms acceptance", () => {
  it("reports not-accepted when the profile row has null timestamps", async () => {
    state.profileRow = { terms_accepted_at: null, privacy_accepted_at: null };
    const accepted = await hasAcceptedLegalTerms("aaaaaaaa-0000-0000-0000-000000000001");
    expect(accepted).toBe(false);
  });

  it("reports accepted once both timestamps are set", async () => {
    state.profileRow = { terms_accepted_at: "2026-09-18T00:00:00.000Z", privacy_accepted_at: "2026-09-18T00:00:00.000Z" };
    const accepted = await hasAcceptedLegalTerms("aaaaaaaa-0000-0000-0000-000000000002");
    expect(accepted).toBe(true);
  });

  it("acceptLegalTerms writes both timestamps to the profile row and caches acceptance", async () => {
    state.profileRow = { terms_accepted_at: null, privacy_accepted_at: null };
    const userId = "aaaaaaaa-0000-0000-0000-000000000003";
    await acceptLegalTerms(userId);

    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0]!.table).toBe("profiles");
    expect(state.updateCalls[0]!.id).toBe(userId);
    const payload = state.updateCalls[0]!.payload as { terms_accepted_at: string; privacy_accepted_at: string };
    expect(payload.terms_accepted_at).toBeTruthy();
    expect(payload.privacy_accepted_at).toBeTruthy();

    // Cached in-memory now, so a subsequent check doesn't need another round trip — even though
    // the underlying mocked row was never updated (state.profileRow still has nulls).
    const accepted = await hasAcceptedLegalTerms(userId);
    expect(accepted).toBe(true);
  });
});
