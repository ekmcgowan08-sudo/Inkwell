import {
  buildSystemPrompt,
  createTestProvider,
  extractFindings,
  inferGroundedness,
  parseCitations,
  summarizeContext,
  type AssistantResponse,
} from "@inkwell/ai-contracts";
import type { AIFinding, AIMode, Citation } from "@inkwell/shared-types";
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

  // Strip any trailing findings block (see promptBuilder.ts's FINDINGS_ELIGIBLE_MODES) before it
  // ever becomes citations, groundedness input, or visible chat content — same handling as the
  // server-side path in supabase/functions/ai-assistant/index.ts.
  const { text: answerText, findings: extractedFindings } = extractFindings(completion.text);

  const citations = parseCitations(answerText, ctx);
  const groundedness = inferGroundedness(ctx);
  const contextSummary = summarizeContext(ctx);

  await db.aiMessages.put({
    id: crypto.randomUUID(),
    conversationId: convoId,
    role: "assistant",
    mode,
    content: answerText,
    citations,
    contextSummary,
    isEstablishedVsInference: groundedness,
    tokensInput: completion.usage.tokensInput,
    tokensOutput: completion.usage.tokensOutput,
    createdAt: nowIso(),
  });

  if (extractedFindings.length > 0) {
    const findingsNow = nowIso();
    await db.aiFindings.bulkPut(
      extractedFindings.map((f) => ({
        id: crypto.randomUUID(),
        projectId,
        findingType: f.findingType,
        severity: f.severity,
        confidence: f.confidence,
        title: f.title,
        explanation: f.explanation,
        evidence: parseCitations(f.explanation, ctx),
        status: "open" as const,
        authorNote: null,
        snoozedUntil: null,
        createdAt: findingsNow,
        updatedAt: findingsNow,
      })),
    );
  }

  return {
    conversationId: convoId,
    content: answerText,
    citations,
    contextSummary,
    groundedness,
  };
}

async function askAssistantCloud(
  projectId: string,
  userId: string,
  mode: AIMode,
  question: string,
  conversationId: string | null,
  seriesScope: boolean,
) {
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
  const result = data as {
    conversationId: string;
    messageId: string;
    content: string;
    citations: Citation[];
    contextSummary: string[];
    groundedness: AssistantResponse["groundedness"];
    findings: AIFinding[];
    usage: AssistantResponse["usage"];
  };

  // The Edge Function is the source of truth (it wrote all of this to Postgres via the
  // service-role client already) — this mirrors that response into the local Dexie cache, the
  // same store every other page (AIAssistantPage's message list, FindingsPage) actually reads
  // from. Without this, a cloud-connected author would get a real answer back but see nothing
  // change in the chat or Findings workspace, since neither reads live from Postgres.
  const now = nowIso();
  if (!conversationId) {
    await db.aiConversations.put({
      id: result.conversationId,
      projectId,
      userId,
      scope: "project",
      title: question.slice(0, 60),
      createdAt: now,
      updatedAt: now,
    });
  }
  await db.aiMessages.put({
    id: crypto.randomUUID(),
    conversationId: result.conversationId,
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
  await db.aiMessages.put({
    id: result.messageId,
    conversationId: result.conversationId,
    role: "assistant",
    mode,
    content: result.content,
    citations: result.citations,
    contextSummary: result.contextSummary,
    isEstablishedVsInference: result.groundedness,
    tokensInput: result.usage.tokensInput,
    tokensOutput: result.usage.tokensOutput,
    createdAt: nowIso(),
  });
  if (result.findings.length > 0) await db.aiFindings.bulkPut(result.findings);

  return result;
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
  return askAssistantCloud(projectId, userId, mode, question, conversationId, seriesScope);
}
