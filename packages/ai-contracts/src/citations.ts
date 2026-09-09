import type { Citation } from "@inkwell/shared-types";
import type { ContextBundle, AssistantResponse } from "./contracts.ts";

const CITATION_PATTERN = /\[(scene|chapter|story_bible_entry|timeline_event|canon_fact):([\w-]+)\]/g;

/**
 * Extracts structured citations from a model's plain-text response by
 * looking for the bracketed ids the system prompt asked it to use (see
 * promptBuilder.ts), and resolving each id back to a human label using the
 * same context bundle the model was given. Shared by the Edge Function
 * (real Anthropic calls) and the web app's local-only test-provider path,
 * so both produce citations the same way.
 */
export function parseCitations(text: string, ctx: ContextBundle): Citation[] {
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

/** Coarse groundedness signal shown to the author alongside the answer — see docs/AI_ARCHITECTURE.md. */
export function inferGroundedness(ctx: ContextBundle): AssistantResponse["groundedness"] {
  if (ctx.chapterSummaries.length === 0 && ctx.storyBibleDigest.length === 0 && ctx.retrievedChunks.length === 0) {
    return "not_established";
  }
  return "mixed";
}

export function summarizeContext(ctx: ContextBundle): string[] {
  return [
    ...ctx.chapterSummaries.map((c) => `Chapter: ${c.title}`),
    ...ctx.storyBibleDigest.map((e) => `${e.entryType}: ${e.name}`),
    ...ctx.openThreads.map((t) => `Open thread: ${t.title}`),
  ].slice(0, 12);
}
