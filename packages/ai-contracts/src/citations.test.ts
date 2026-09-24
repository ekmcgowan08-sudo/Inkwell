import { describe, expect, it } from "vitest";
import { parseCitations, inferGroundedness, summarizeContext } from "./citations.ts";
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

describe("parseCitations", () => {
  it("returns nothing when the text has no citation markers", () => {
    expect(parseCitations("Just a plain answer, no brackets here.", emptyContext())).toEqual([]);
  });

  it("resolves a citation's label from the matching context bucket", () => {
    const ctx = emptyContext({ chapterSummaries: [{ chapterId: "ch1", title: "Chapter One", summary: "..." }] });
    const citations = parseCitations("As shown in [chapter:ch1], the storm begins.", ctx);
    expect(citations).toEqual([{ kind: "chapter", id: "ch1", label: "Chapter One" }]);
  });

  it("resolves every supported citation kind from its own bucket", () => {
    const ctx: ContextBundle = emptyContext({
      chapterSummaries: [{ chapterId: "ch1", title: "Chapter One", summary: "" }],
      retrievedChunks: [{ sourceType: "scene", sourceId: "sc1", label: "Opening scene", content: "" }],
      storyBibleDigest: [{ id: "sb1", name: "Isolde Vane", entryType: "character", digest: "" }],
      recentTimelineEvents: [{ id: "tl1", label: "The fire", whenLabel: "9 years ago" }],
      approvedCanonFacts: [{ id: "cf1", statement: "The lighthouse burned down." }],
      openThreads: [{ id: "th1", title: "The missing crown" }],
    });
    const text = "[chapter:ch1] [scene:sc1] [story_bible_entry:sb1] [timeline_event:tl1] [canon_fact:cf1] [story_thread:th1]";
    const citations = parseCitations(text, ctx);
    expect(citations).toEqual([
      { kind: "chapter", id: "ch1", label: "Chapter One" },
      { kind: "scene", id: "sc1", label: "Opening scene" },
      { kind: "story_bible_entry", id: "sb1", label: "Isolde Vane" },
      { kind: "timeline_event", id: "tl1", label: "The fire" },
      { kind: "canon_fact", id: "cf1", label: "The lighthouse burned down." },
      { kind: "story_thread", id: "th1", label: "The missing crown" },
    ]);
  });

  it("resolves a story-thread citation — the exact format buildSystemPrompt's OPEN STORY THREADS section instructs the model to use", () => {
    // Regression test: CITATION_PATTERN and citationSchema's kind enum previously didn't include
    // "story_thread" at all, even though promptBuilder.ts's OPEN STORY THREADS section explicitly
    // tells the model to cite threads as `[story_thread:id]`. Any citation in that exact format
    // silently vanished instead of resolving — never caught because the deterministic test
    // provider never emits citation-style text, so no existing test exercised this path.
    const ctx = emptyContext({ openThreads: [{ id: "th1", title: "The missing crown" }] });
    const citations = parseCitations("As established in [story_thread:th1], the crown is still missing.", ctx);
    expect(citations).toEqual([{ kind: "story_thread", id: "th1", label: "The missing crown" }]);
  });

  it("falls back to a generic label when the id isn't found in any context bucket", () => {
    const citations = parseCitations("[scene:unknown-id]", emptyContext());
    expect(citations).toEqual([{ kind: "scene", id: "unknown-id", label: "Referenced item" }]);
  });

  it("de-duplicates repeated citations of the same kind and id", () => {
    const ctx = emptyContext({ chapterSummaries: [{ chapterId: "ch1", title: "Chapter One", summary: "" }] });
    const citations = parseCitations("[chapter:ch1] appears twice: [chapter:ch1].", ctx);
    expect(citations).toHaveLength(1);
  });

  it("keeps the same id cited under two different kinds as two separate citations", () => {
    const ctx = emptyContext({
      chapterSummaries: [{ chapterId: "x1", title: "Chapter One", summary: "" }],
      retrievedChunks: [{ sourceType: "scene", sourceId: "x1", label: "Opening scene", content: "" }],
    });
    const citations = parseCitations("[chapter:x1] and [scene:x1]", ctx);
    expect(citations).toHaveLength(2);
  });
});

describe("inferGroundedness", () => {
  it("reports not_established when the context has no chapters, story bible, or retrieved chunks", () => {
    expect(inferGroundedness(emptyContext())).toBe("not_established");
  });

  it("reports not_established even with open threads or timeline events alone", () => {
    const ctx = emptyContext({
      openThreads: [{ id: "t1", title: "The missing crown" }],
      recentTimelineEvents: [{ id: "e1", label: "x", whenLabel: "y" }],
    });
    expect(inferGroundedness(ctx)).toBe("not_established");
  });

  it("reports mixed once any of chapters, story bible, or retrieved chunks is present", () => {
    expect(inferGroundedness(emptyContext({ chapterSummaries: [{ chapterId: "ch1", title: "x", summary: "" }] }))).toBe("mixed");
    expect(inferGroundedness(emptyContext({ storyBibleDigest: [{ id: "sb1", name: "x", entryType: "character", digest: "" }] }))).toBe("mixed");
    expect(inferGroundedness(emptyContext({ retrievedChunks: [{ sourceType: "scene", sourceId: "s1", label: "x", content: "" }] }))).toBe("mixed");
  });
});

describe("summarizeContext", () => {
  it("labels chapters, story bible entries, and open threads distinctly", () => {
    const ctx = emptyContext({
      chapterSummaries: [{ chapterId: "ch1", title: "Chapter One", summary: "" }],
      storyBibleDigest: [{ id: "sb1", name: "Isolde Vane", entryType: "character", digest: "" }],
      openThreads: [{ id: "t1", title: "The missing crown" }],
    });
    expect(summarizeContext(ctx)).toEqual(["Chapter: Chapter One", "character: Isolde Vane", "Open thread: The missing crown"]);
  });

  it("caps the summary at 12 entries even when the context has more", () => {
    const ctx = emptyContext({
      chapterSummaries: Array.from({ length: 20 }, (_, i) => ({ chapterId: `ch${i}`, title: `Chapter ${i}`, summary: "" })),
    });
    expect(summarizeContext(ctx)).toHaveLength(12);
  });
});
