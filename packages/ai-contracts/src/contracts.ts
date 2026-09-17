import { z } from "zod";
import { aiModeSchema, citationSchema, uuidSchema } from "@inkwell/shared-types";

/** Request body for the `ai-assistant` Edge Function. Validated server-side before any provider call. */
export const assistantRequestSchema = z.object({
  projectId: uuidSchema,
  conversationId: uuidSchema.nullable().default(null), // null = start a new conversation
  mode: aiModeSchema,
  question: z.string().min(1).max(4000),
  /** Explicit opt-in only — the assistant never reads outside the active project unless this is set AND the project belongs to a series. */
  seriesScope: z.boolean().default(false),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export const assistantResponseSchema = z.object({
  conversationId: uuidSchema,
  messageId: uuidSchema,
  content: z.string(),
  citations: z.array(citationSchema),
  contextSummary: z.array(z.string()),
  groundedness: z.enum(["established", "inference", "not_established", "mixed"]),
  usage: z.object({
    tokensInput: z.number().int().nonnegative(),
    tokensOutput: z.number().int().nonnegative(),
    estimatedCostUsdMicros: z.number().int().nonnegative(),
  }),
});
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;

/**
 * Bounds for the optional cross-book series-continuity context (`AssistantRequest.seriesScope`),
 * shared by the server-side context builder (`supabase/functions/_shared/buildContext.ts`) and the
 * local-only one (`apps/web/src/lib/aiLocalContext.ts`) so both apply the same limits.
 */
export const MAX_SERIES_BOOKS = 4;
export const MAX_SERIES_CHAPTERS_PER_BOOK = 5;
export const MAX_SERIES_CANON_FACTS_PER_BOOK = 10;
export const MAX_SERIES_STORY_BIBLE_PER_BOOK = 10;

/** The bounded context assembled server-side for one AI request. Never the full manuscript — see docs/AI_ARCHITECTURE.md. */
export interface ContextBundle {
  projectTitle: string;
  chapterSummaries: Array<{ chapterId: string; title: string; summary: string }>;
  retrievedChunks: Array<{ sourceType: string; sourceId: string; label: string; content: string }>;
  approvedCanonFacts: Array<{ id: string; statement: string }>;
  storyBibleDigest: Array<{ id: string; name: string; entryType: string; digest: string }>;
  openThreads: Array<{ id: string; title: string }>;
  recentTimelineEvents: Array<{ id: string; label: string; whenLabel: string }>;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface LLMUsage {
  tokensInput: number;
  tokensOutput: number;
}

export interface LLMCompletion {
  text: string;
  usage: LLMUsage;
}

/** Every AI provider (real Anthropic, or the deterministic test double) implements this. */
export interface LLMProvider {
  readonly name: string;
  complete(args: { system: string; user: string; maxTokens?: number }): Promise<LLMCompletion>;
}

export const errorCodeSchema = z.enum([
  "unauthorized",
  "project_not_found",
  "ai_disabled_for_project",
  "rate_limited",
  "usage_allowance_exceeded",
  "provider_error",
  "invalid_request",
]);
export type AssistantErrorCode = z.infer<typeof errorCodeSchema>;

export class AssistantError extends Error {
  code: AssistantErrorCode;
  constructor(code: AssistantErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AssistantError";
  }
}
