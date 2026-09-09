import type { ContextBundle } from "./contracts.js";
import type { z } from "zod";
import type { aiModeSchema } from "@inkwell/shared-types";

type AIMode = z.infer<typeof aiModeSchema>;

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

  if (
    ctx.chapterSummaries.length === 0 &&
    ctx.retrievedChunks.length === 0 &&
    ctx.storyBibleDigest.length === 0
  ) {
    lines.push("NOTE: This project has no manuscript or story-bible content yet. Say so plainly if asked about it.");
  }

  lines.push(
    "Keep answers focused and under 200 words unless the author asks for more detail. When you make a claim, prefer citing a specific bracketed id shown above so the UI can render it as a clickable citation.",
  );

  return lines.join("\n");
}
