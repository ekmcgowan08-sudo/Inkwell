import {
  buildSystemPrompt,
  createTestProvider,
  inferGroundedness,
  parseCitations,
  summarizeContext,
  type AssistantResponse,
} from "@inkwell/ai-contracts";
import type { AIMode, Citation } from "@inkwell/shared-types";
import { db, nowIso } from "./db";
import { buildLocalContext } from "./aiLocalContext";
import { isLocalOnlyMode } from "./env";
import { getSupabase } from "./supabase";

async function askAssistantLocal(
  projectId: string,
  userId: string,
  mode: AIMode,
  question: string,
  conversationId: string | null,
  seriesScope: boolean,
) {
  const ctx = await buildLocalContext(projectId, seriesScope);
  const system = buildSystemPrompt(mode, ctx);
  const provider = createTestProvider();
  const completion = await provider.complete({ system, user: question });

  const now = nowIso();
  const convoId = conversationId ?? crypto.randomUUID();
  if (!conversationId) {
    await db.aiConversations.put({ id: convoId, projectId, userId, scope: "project", title: question.slice(0, 60), createdAt: now, updatedAt: now });
  }
  await db.aiMessages.put({
    id: crypto.randomUUID(),
    conversationId: convoId,
    role: "user",
    mode,
    content: question,
    citations: [],
    contextSummary: [],
    isEstablishedVsInference: null,
    tokensInput: 0,
    tokensOutput: 0,
    createdAt: now,
  });

  const citations = parseCitations(completion.text, ctx);
  const groundedness = inferGroundedness(ctx);
  const contextSummary = summarizeContext(ctx);

  await db.aiMessages.put({
    id: crypto.randomUUID(),
    conversationId: convoId,
    role: "assistant",
    mode,
    content: completion.text,
    citations,
    contextSummary,
    isEstablishedVsInference: groundedness,
    tokensInput: completion.usage.tokensInput,
    tokensOutput: completion.usage.tokensOutput,
    createdAt: nowIso(),
  });

  return {
    conversationId: convoId,
    content: completion.text,
    citations,
    contextSummary,
    groundedness,
  };
}

async function askAssistantCloud(projectId: string, mode: AIMode, question: string, conversationId: string | null, seriesScope: boolean) {
  const supabase = getSupabase()!;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");

  // supabase-js attaches the signed-in user's access token automatically, so
  // the Edge Function can verify the caller's identity server-side — the
  // client never has to (and never should) hold a privileged key itself.
  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: { projectId, mode, question, conversationId, seriesScope },
  });
  if (error) throw new Error(error.message ?? "The AI assistant is unavailable right now.");
  return data as {
    conversationId: string;
    content: string;
    citations: Citation[];
    contextSummary: string[];
    groundedness: AssistantResponse["groundedness"];
  };
}

export async function askAssistant(
  projectId: string,
  userId: string,
  mode: AIMode,
  question: string,
  conversationId: string | null,
  seriesScope = false,
) {
  if (isLocalOnlyMode) return askAssistantLocal(projectId, userId, mode, question, conversationId, seriesScope);
  return askAssistantCloud(projectId, mode, question, conversationId, seriesScope);
}
