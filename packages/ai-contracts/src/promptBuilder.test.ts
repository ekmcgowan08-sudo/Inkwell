import { describe, expect, it } from "vitest";
import { buildSystemPrompt, FINDINGS_ELIGIBLE_MODES } from "./promptBuilder.ts";
import { FINDINGS_BLOCK_END, FINDINGS_BLOCK_START } from "./findingsExtraction.ts";
import type { ContextBundle } from "./contracts.ts";

function emptyContext(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    projectTitle: "Test Book",
    chapterSummaries: [],
    retrievedChunks: [],
    approvedCanonFacts: [],
    storyBibleDigest: [],
    openThreads: [],
    recentTimelineEvents: [],
    recentMessages: [],
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  it("omits every section header when its context bucket is empty", () => {
    const prompt = buildSystemPrompt("ask", emptyContext());
    expect(prompt).not.toContain("CHAPTER SUMMARIES:");
    expect(prompt).not.toContain("APPROVED CANON FACTS:");
    expect(prompt).not.toContain("STORY BIBLE:");
    expect(prompt).not.toContain("TIMELINE");
    expect(prompt).not.toContain("OPEN STORY THREADS:");
    expect(prompt).not.toContain("RELEVANT MANUSCRIPT EXCERPTS");
  });

  it("includes a section, with a bracketed citation id, only when its bucket is non-empty", () => {
    const prompt = buildSystemPrompt("ask", emptyContext({ openThreads: [{ id: "th1", title: "The missing crown" }] }));
    expect(prompt).toContain("OPEN STORY THREADS:");
    // This bracket format must stay in sync with citations.ts's CITATION_PATTERN — a prior real
    // bug (see docs/DECISIONS.md, 2026-09-24) was this exact string not matching that regex.
    expect(prompt).toContain("[story_thread:th1] The missing crown");
  });

  it("includes the no-content note only when chapters, story bible, and retrieved excerpts are all empty", () => {
    expect(buildSystemPrompt("ask", emptyContext())).toContain("This project has no manuscript or story-bible content yet");

    const withChapter = emptyContext({ chapterSummaries: [{ chapterId: "ch1", title: "x", summary: "" }] });
    expect(buildSystemPrompt("ask", withChapter)).not.toContain("This project has no manuscript or story-bible content yet");
  });

  it("does not treat open threads or canon facts alone as 'has content' for the no-content note", () => {
    // A project with only an open thread recorded (no manuscript, no story bible) should still
    // get the plain "nothing here yet" note — threads/canon facts aren't manuscript substance.
    const ctx = emptyContext({ openThreads: [{ id: "th1", title: "x" }], approvedCanonFacts: [{ id: "cf1", statement: "x" }] });
    expect(buildSystemPrompt("ask", ctx)).toContain("This project has no manuscript or story-bible content yet");
  });

  it("uses the mode-specific task instruction", () => {
    const prompt = buildSystemPrompt("timeline_analysis", emptyContext());
    expect(prompt).toContain("Check the in-story timeline for conflicting or impossible event ordering");
  });

  it("appends findings-block instructions only for FINDINGS_ELIGIBLE_MODES", () => {
    for (const mode of FINDINGS_ELIGIBLE_MODES) {
      const prompt = buildSystemPrompt(mode, emptyContext());
      expect(prompt).toContain(FINDINGS_BLOCK_START);
      expect(prompt).toContain(FINDINGS_BLOCK_END);
    }
  });

  it("never appends findings-block instructions for a mode outside FINDINGS_ELIGIBLE_MODES", () => {
    expect(FINDINGS_ELIGIBLE_MODES.has("brainstorming")).toBe(false);
    const prompt = buildSystemPrompt("brainstorming", emptyContext());
    expect(prompt).not.toContain(FINDINGS_BLOCK_START);
    expect(prompt).not.toContain(FINDINGS_BLOCK_END);
  });

  it("includes the project title", () => {
    expect(buildSystemPrompt("ask", emptyContext({ projectTitle: "The Lighthouse Keeps" }))).toContain("PROJECT: The Lighthouse Keeps");
  });
});
