import type { ContextBundle } from "./contracts.ts";
import { FINDINGS_BLOCK_END, FINDINGS_BLOCK_START } from "./findingsExtraction.ts";
import type { z } from "zod";
import type { aiModeSchema } from "@inkwell/shared-types";

type AIMode = z.infer<typeof aiModeSchema>;

/**
 * Modes where the model plausibly surfaces concrete, trackable issues — as opposed to prose
 * feedback (pacing, structure), free-form brainstorming, or a plain answer. Only these get the
 * trailing findings-block instruction, so `extractFindings` (see `findingsExtraction.ts`) has
 * something meaningful to parse and the Edge Function knows when it's worth persisting
 * `ai_findings` rows automatically. See docs/AI_ARCHITECTURE.md "AI Findings vs. the AI
 * Assistant's consistency-check mode".
 */
export const FINDINGS_ELIGIBLE_MODES = new Set<AIMode>([
  "consistency_check",
  "character_continuity",
  "timeline_analysis",
  "plot_thread_tracking",
  "dropped_thread_detection",
  "canon_extraction",
]);

const MODE_INSTRUCTIONS: Record<AIMode, string> = {
  ask: "Answer the author's question directly, grounded only in the provided context.",
  consistency_check:
    "Compare the manuscript against the story bible and canon facts. Flag any contradiction (appearance, timeline, geography, established facts) with specific citations.",
  character_continuity:
    "Focus on one or more characters: check whether their described traits, voice, and behavior stay consistent across the provided scenes.",
  timeline_analysis: "Check the in-story timeline for conflicting or impossible event ordering, gaps, or duration mismatches.",
  plot_thread_tracking: "Identify open story threads and where each was last advanced.",
  dropped_thread_detection: "Identify plot threads that were opened but never revisited or resolved in the provided material.",
  pacing_feedback: "Give pacing feedback only for the material provided — note scenes that may be slow, rushed, or repetitive.",
  structure_feedback: "Give structural feedback, optionally referencing the structure overlay the author is using, as a guide rather than a rule.",
  scene_analysis: "Analyze the specified scene(s) for clarity, tension, and consistency with established canon.",
  brainstorming: "Brainstorm freely. Clearly label suggestions as suggestions. Never write manuscript prose meant to be inserted directly.",
  dialogue_alternatives: "Offer alternative dialogue options consistent with each character's established voice.",
  revision_planning: "Help the author plan revisions: prioritize issues, suggest an order of operations, do not rewrite prose.",
  canon_extraction: "Extract candidate canon facts stated in the provided scenes for the author to approve. Do not invent facts.",
  chapter_summary: "Summarize the specified chapter(s) factually, without adding invented details.",
  series_continuity: "Check continuity across the books in this series that the author has explicitly included in scope.",
};

export function buildSystemPrompt(mode: AIMode, ctx: ContextBundle): string {
  const lines: string[] = [];
  lines.push(
    "You are Inkwell's project-scoped writing assistant, embedded in a fiction author's private drafting tool.",
    "You are not the author. Never invent story details and present them as established canon. Never write manuscript prose intended to be inserted directly unless explicitly asked to brainstorm, and even then, label it clearly as a suggestion.",
    "Always distinguish between: (a) established — stated directly in the provided context, (b) inference — a reasonable read between the lines, and (c) not established — the author hasn't written this yet. Say plainly when something is not established rather than guessing.",
    "Ground every claim in the provided context. Where practical, name the chapter, scene, character, or story-bible entry you're drawing from so the author can verify it themselves.",
    `Task for this request: ${MODE_INSTRUCTIONS[mode]}`,
    "",
    `PROJECT: ${ctx.projectTitle}`,
    "",
  );

  if (ctx.chapterSummaries.length) {
    lines.push("CHAPTER SUMMARIES:");
    for (const c of ctx.chapterSummaries) lines.push(`- [chapter:${c.chapterId}] ${c.title}: ${c.summary}`);
    lines.push("");
  }

  if (ctx.approvedCanonFacts.length) {
    lines.push("APPROVED CANON FACTS:");
    for (const f of ctx.approvedCanonFacts) lines.push(`- [canon_fact:${f.id}] ${f.statement}`);
    lines.push("");
  }

  if (ctx.storyBibleDigest.length) {
    lines.push("STORY BIBLE:");
    for (const e of ctx.storyBibleDigest) lines.push(`- [story_bible_entry:${e.id}] ${e.name} (${e.entryType}): ${e.digest}`);
    lines.push("");
  }

  if (ctx.recentTimelineEvents.length) {
    lines.push("TIMELINE (recent/relevant events):");
    for (const t of ctx.recentTimelineEvents) lines.push(`- [timeline_event:${t.id}] ${t.whenLabel}: ${t.label}`);
    lines.push("");
  }

  if (ctx.openThreads.length) {
    lines.push("OPEN STORY THREADS:");
    for (const t of ctx.openThreads) lines.push(`- [story_thread:${t.id}] ${t.title}`);
    lines.push("");
  }

  if (ctx.retrievedChunks.length) {
    lines.push("RELEVANT MANUSCRIPT EXCERPTS (retrieved for this question, not the full manuscript):");
    for (const chunk of ctx.retrievedChunks) {
      lines.push(`--- [${chunk.sourceType}:${chunk.sourceId}] ${chunk.label} ---`);
      lines.push(chunk.content);
    }
    lines.push("");
  }

  if (ctx.chapterSummaries.length === 0 && ctx.retrievedChunks.length === 0 && ctx.storyBibleDigest.length === 0) {
    lines.push("NOTE: This project has no manuscript or story-bible content yet. Say so plainly if asked about it.");
  }

  lines.push(
    "Keep answers focused and under 200 words unless the author asks for more detail. When you make a claim, prefer citing a specific bracketed id shown above so the UI can render it as a clickable citation.",
  );

  if (FINDINGS_ELIGIBLE_MODES.has(mode)) {
    lines.push(
      "",
      "After your answer, if you identified any concrete, specific issues worth tracking (not vague impressions), list each one in this exact format so they can be saved automatically:",
      "",
      FINDINGS_BLOCK_START,
      '[{"findingType": "contradiction|character_inconsistency|timeline_conflict|geographic_conflict|dropped_thread|unresolved_setup|repeated_information|pacing_observation|possible_canon_fact", "severity": "low|medium|high", "confidence": 0.0-1.0, "title": "short specific title", "explanation": "one or two sentences, citing a bracketed id like [scene:id] wherever possible"}]',
      FINDINGS_BLOCK_END,
      "",
      `If you found nothing concrete enough to track, still include the block with an empty array: ${FINDINGS_BLOCK_START}[]${FINDINGS_BLOCK_END}. Never fabricate a finding just to fill this block, and never omit the block entirely for this task.`,
    );
  }

  return lines.join("\n");
}
