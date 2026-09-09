import { buildSystemPrompt, createTestProvider, type AssistantResponse, type ContextBundle } from "@inkwell/ai-contracts";
import type { AIMode, Citation } from "@inkwell/shared-types";
import { db, nowIso } from "./db";
import { buildLocalContext } from "./aiLocalContext";
import { isLocalOnlyMode } from "./env";
import { getSupabase } from "./supabase";

const CITATION_PATTERN = /\[(scene|chapter|story_bible_entry|timeline_event|canon_fact):([\w-]+)\]/g;

function parseCitations(text: string, ctx: ContextBundle): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const [, kind, id] = match;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label =
      ctx.chapterSummaries.find((c) => c.chapterId === id)?.title ??
      ctx.retrievedChunks.find((c) => c.sourceId === id)?.label ??
      ctx.storyBibleDigest.find((e) => e.id === id)?.name ??
      ctx.recentTimelineEvents.find((e) => e.id === id)?.label ??
      ctx.approvedCanonFacts.find((f) => f.id === id)?.statement ??
      "Referenced item";
    citations.push({ kind: kind as Citation["kind"], id: id!, label });
  }
  return citations;
}

function inferGroundedness(ctx: ContextBundle): AssistantResponse["groundedness"] {
  if (ctx.chapterSummaries.length === 0 && ctx.storyBibleDigest.length === 0 && ctx.retrievedChunks.length === 0) {
    return "not_established";
  }
  return "mixed";
}

async function askAssistantLocal(projectId: string, userId: string, mode: AIMode, question: string, conversationId: string | null) {
  const ctx = await buildLocalContext(projectId);
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
  const contextSummary = [
    ...ctx.chapterSummaries.map((c) => `Chapter: ${c.title}`),
    ...ctx.storyBibleDigest.map((e) => `${e.entryType}: ${e.name}`),
    ...ctx.openThreads.map((t) => `Open thread: ${t.title}`),
  ].slice(0, 12);

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

async function askAssistantCloud(projectId: string, mode: AIMode, question: string, conversationId: string | null) {
  const supabase = getSupabase()!;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");

  // supabase-js attaches the signed-in user's access token automatically, so
  // the Edge Function can verify the caller's identity server-side — the
  // client never has to (and never should) hold a privileged key itself.
  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: { projectId, mode, question, conversationId, seriesScope: false },
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
) {
  if (isLocalOnlyMode) return askAssistantLocal(projectId, userId, mode, question, conversationId);
  return askAssistantCloud(projectId, mode, question, conversationId);
}
