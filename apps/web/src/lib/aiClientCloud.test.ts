import { describe, expect, it, vi, beforeEach } from "vitest";

// Regression test for a real bug: askAssistantCloud got a successful response back from the Edge
// Function but never wrote anything to Dexie, and every page that shows AI Assistant output
// (AIAssistantPage's message list, FindingsPage) reads exclusively from Dexie via useLiveQuery —
// so a cloud-connected author would send a question, get billed for it server-side, and see
// nothing happen in the UI. Fixed by mirroring the Edge Function's response into the same local
// tables askAssistantLocal already writes to.
const state = vi.hoisted(() => ({
  invokeResponse: null as { data: unknown; error: unknown } | null,
}));

vi.mock("./env", () => ({ isLocalOnlyMode: false }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) },
    functions: { invoke: async () => state.invokeResponse },
  }),
}));

const { db } = await import("./db");
const { askAssistant } = await import("./aiClient");

const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("askAssistant (cloud mode) — mirrors the Edge Function response into Dexie", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("writes the conversation, both messages, and any findings so the chat/findings UI actually shows them", async () => {
    state.invokeResponse = {
      data: {
        conversationId: "33333333-3333-3333-3333-333333333333",
        messageId: "44444444-4444-4444-4444-444444444444",
        content: "Here's my analysis.",
        citations: [],
        contextSummary: [],
        groundedness: "mixed",
        findings: [
          {
            id: "55555555-5555-5555-5555-555555555555",
            projectId: PROJECT_ID,
            findingType: "contradiction",
            severity: "medium",
            confidence: 0.8,
            title: "Server-created finding",
            explanation: "Created by the Edge Function, mirrored to the client.",
            evidence: [],
            status: "open",
            authorNote: null,
            snoozedUntil: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        usage: { tokensInput: 100, tokensOutput: 50, estimatedCostUsdMicros: 10 },
      },
      error: null,
    };

    const result = await askAssistant(PROJECT_ID, USER_ID, "consistency_check", "Is this consistent?", null);

    expect(result.conversationId).toBe("33333333-3333-3333-3333-333333333333");

    const conversation = await db.aiConversations.get("33333333-3333-3333-3333-333333333333");
    expect(conversation?.projectId).toBe(PROJECT_ID);

    const messages = await db.aiMessages.where("conversationId").equals("33333333-3333-3333-3333-333333333333").sortBy("createdAt");
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.content).toBe("Is this consistent?");
    expect(messages[1]!.role).toBe("assistant");
    expect(messages[1]!.content).toBe("Here's my analysis.");
    expect(messages[1]!.tokensInput).toBe(100);

    const findings = await db.aiFindings.where("projectId").equals(PROJECT_ID).toArray();
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toBe("Server-created finding");
  });

  it("does not re-create the conversation row on a follow-up message in the same conversation", async () => {
    const conversationId = "33333333-3333-3333-3333-333333333333";
    await db.aiConversations.put({
      id: conversationId,
      projectId: PROJECT_ID,
      userId: USER_ID,
      scope: "project",
      title: "Original title",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    state.invokeResponse = {
      data: {
        conversationId,
        messageId: "66666666-6666-6666-6666-666666666666",
        content: "Follow-up answer.",
        citations: [],
        contextSummary: [],
        groundedness: "mixed",
        findings: [],
        usage: { tokensInput: 10, tokensOutput: 5, estimatedCostUsdMicros: 1 },
      },
      error: null,
    };

    await askAssistant(PROJECT_ID, USER_ID, "ask", "A follow-up question", conversationId);

    const conversation = await db.aiConversations.get(conversationId);
    expect(conversation?.title).toBe("Original title"); // untouched, not overwritten
    const messages = await db.aiMessages.where("conversationId").equals(conversationId).toArray();
    expect(messages).toHaveLength(2); // just the new user+assistant pair
  });
});
