/**
 * ai-assistant Edge Function — the ONLY place in this codebase allowed to
 * hold an Anthropic API key. Never import this file's logic, or
 * `providers/anthropicProvider.ts`, into any distributed client.
 *
 * Deploy: `supabase functions deploy ai-assistant`
 * Local:  `supabase functions serve ai-assistant --env-file supabase/functions/.env`
 *
 * Request contract: AssistantRequest (packages/ai-contracts/src/contracts.ts).
 * See docs/AI_ARCHITECTURE.md for the full data-flow description.
 */
import {
  assistantRequestSchema,
  buildSystemPrompt,
  createTestProvider,
  estimateCostUsdMicros,
  inferGroundedness,
  parseCitations,
  summarizeContext,
  AssistantError,
  type LLMProvider,
} from "@inkwell/ai-contracts";
import { createAnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "@inkwell/ai-contracts/providers/anthropicProvider";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabaseClients.ts";
import { buildContextFromSupabase } from "../_shared/buildContext.ts";
import { checkAndRecordRateLimit } from "../_shared/rateLimit.ts";

function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function selectProvider(): LLMProvider {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set — falling back to the deterministic test provider. Set it in supabase/functions/.env for real AI responses.");
    return createTestProvider();
  }
  return createAnthropicProvider({ apiKey, model: Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_ANTHROPIC_MODEL });
}

async function handleRequest(req: Request): Promise<Response> {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw new AssistantError("invalid_request", "Only POST is supported.");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new AssistantError("unauthorized", "Missing Authorization header.");

    const userClient = createUserClient(authHeader);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) throw new AssistantError("unauthorized", "Invalid or expired session.");

    const serviceClient = createServiceClient();

    // Sliding-window rate limit, checked before doing anything else — cheapest possible rejection
    // for an abusive/looping client, independent of whether they're still under their monthly
    // token budget. See supabase/functions/_shared/rateLimit.ts.
    const rateLimit = await checkAndRecordRateLimit(serviceClient, user.id);
    if (!rateLimit.allowed) {
      throw new AssistantError(
        "rate_limited",
        `You're sending requests too quickly. Please wait ${rateLimit.retryAfterSeconds} seconds and try again.`,
      );
    }

    const parsed = assistantRequestSchema.safeParse(await req.json());
    if (!parsed.success) throw new AssistantError("invalid_request", parsed.error.message);
    const { projectId, mode, question, conversationId } = parsed.data;

    // Ownership check happens BY QUERYING THROUGH THE USER'S OWN CLIENT: RLS
    // means this returns null for a project the caller doesn't own, exactly
    // as if it didn't exist — no separate "is this yours" check needed, and
    // no way to distinguish "not found" from "not yours" (avoids leaking
    // existence of other users' projects).
    const { data: project, error: projectError } = await userClient.from("projects").select("id, title").eq("id", projectId).maybeSingle();
    if (projectError) throw new AssistantError("provider_error", projectError.message);
    if (!project) throw new AssistantError("project_not_found", "Project not found.");

    // Usage allowance check — the real financial backstop (monthly token budget), separate from
    // the burst-rate limit above.
    const periodMonth = currentPeriodMonth();
    const [{ data: entitlement }, { data: usage }] = await Promise.all([
      serviceClient.from("entitlements").select("ai_monthly_token_allowance").eq("user_id", user.id).maybeSingle(),
      serviceClient
        .from("ai_usage")
        .select("id, tokens_input, tokens_output")
        .eq("user_id", user.id)
        .is("project_id", null)
        .eq("period_month", periodMonth)
        .maybeSingle(),
    ]);
    const allowance = entitlement?.ai_monthly_token_allowance ?? 200_000;
    const usedTokens = (usage?.tokens_input ?? 0) + (usage?.tokens_output ?? 0);
    if (usedTokens >= allowance) {
      throw new AssistantError("usage_allowance_exceeded", `Monthly AI allowance (${allowance.toLocaleString()} tokens) reached.`);
    }

    // If a conversation id was supplied, verify (server-side, since we're
    // about to write with the service role) that it actually belongs to
    // this user and project before appending to it.
    let resolvedConversationId = conversationId;
    if (resolvedConversationId) {
      const { data: convo } = await serviceClient
        .from("ai_conversations")
        .select("id, user_id, project_id")
        .eq("id", resolvedConversationId)
        .maybeSingle();
      if (!convo || convo.user_id !== user.id || convo.project_id !== projectId) {
        throw new AssistantError("invalid_request", "conversationId does not belong to this user/project.");
      }
    } else {
      const { data: created, error: createError } = await serviceClient
        .from("ai_conversations")
        .insert({ project_id: projectId, user_id: user.id, scope: "project", title: question.slice(0, 60) })
        .select("id")
        .single();
      if (createError || !created) throw new AssistantError("provider_error", createError?.message ?? "Failed to create conversation.");
      resolvedConversationId = created.id;
    }

    const ctx = await buildContextFromSupabase(userClient, projectId, project.title, conversationId, question);
    const system = buildSystemPrompt(mode, ctx);
    const provider = selectProvider();
    const completion = await provider.complete({ system, user: question, maxTokens: 1024 });

    const citations = parseCitations(completion.text, ctx);
    const groundedness = inferGroundedness(ctx);
    const contextSummary = summarizeContext(ctx);

    const { error: userMsgError } = await serviceClient.from("ai_messages").insert({
      conversation_id: resolvedConversationId,
      project_id: projectId,
      role: "user",
      mode,
      content: question,
    });
    if (userMsgError) throw new AssistantError("provider_error", userMsgError.message);

    const { data: assistantMessage, error: assistantMsgError } = await serviceClient
      .from("ai_messages")
      .insert({
        conversation_id: resolvedConversationId,
        project_id: projectId,
        role: "assistant",
        mode,
        content: completion.text,
        citations,
        context_summary: contextSummary,
        groundedness,
        tokens_input: completion.usage.tokensInput,
        tokens_output: completion.usage.tokensOutput,
      })
      .select("id")
      .single();
    if (assistantMsgError || !assistantMessage) throw new AssistantError("provider_error", assistantMsgError?.message ?? "Failed to save response.");

    const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_ANTHROPIC_MODEL;
    const costMicros = estimateCostUsdMicros(model, completion.usage.tokensInput, completion.usage.tokensOutput);
    await serviceClient
      .from("ai_usage")
      .upsert(
        {
          user_id: user.id,
          project_id: null,
          period_month: periodMonth,
          tokens_input: (usage?.tokens_input ?? 0) + completion.usage.tokensInput,
          tokens_output: (usage?.tokens_output ?? 0) + completion.usage.tokensOutput,
          estimated_cost_usd_micros: costMicros,
          request_count: 1,
        },
        { onConflict: "user_id,project_id,period_month" },
      );

    return jsonResponse({
      conversationId: resolvedConversationId,
      messageId: assistantMessage.id,
      content: completion.text,
      citations,
      contextSummary,
      groundedness,
      usage: {
        tokensInput: completion.usage.tokensInput,
        tokensOutput: completion.usage.tokensOutput,
        estimatedCostUsdMicros: costMicros,
      },
    });
  } catch (err) {
    if (err instanceof AssistantError) {
      const status = { unauthorized: 401, project_not_found: 404, ai_disabled_for_project: 403, rate_limited: 429, usage_allowance_exceeded: 429, provider_error: 502, invalid_request: 400 }[err.code];
      return jsonResponse({ error: err.message, code: err.code }, status);
    }
    console.error("ai-assistant unhandled error:", err);
    return jsonResponse({ error: "Internal error." }, 500);
  }
}

// `import.meta.main` is true when Supabase's edge runtime (or `supabase
// functions serve`) runs this file directly, and false when
// index.test.ts imports it — so the test file never accidentally starts a
// real listener.
if (import.meta.main) {
  Deno.serve(handleRequest);
}

// Re-exported so ai-assistant/index.test.ts can exercise this logic directly.
export { currentPeriodMonth, handleRequest, selectProvider };
