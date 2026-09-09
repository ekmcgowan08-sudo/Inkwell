import type { ContextBundle } from "@inkwell/ai-contracts";
import { db } from "./db";

/**
 * Builds the same shape of bounded context the server-side ai-assistant Edge
 * Function assembles from Postgres (see supabase/functions/ai-assistant),
 * but reads from the local Dexie store instead. Used only in local-only mode
 * (no Supabase configured) so the AI assistant demo works with zero backend
 * — this never calls a real model provider, only the deterministic test
 * provider. See docs/AI_ARCHITECTURE.md "local-only mode" section.
 */
export async function buildLocalContext(projectId: string): Promise<ContextBundle> {
  const project = await db.projects.get(projectId);
  const chapters = await db.chapters.where("projectId").equals(projectId).and((c) => !c.deletedAt).sortBy("sortOrder");
  const scenesByChapter = await db.scenes.where("projectId").equals(projectId).and((s) => !s.deletedAt).toArray();
  const entries = await db.storyBibleEntries.where("projectId").equals(projectId).and((e) => !e.deletedAt).toArray();
  const threads = await db.storyThreads.where("projectId").equals(projectId).and((t) => t.status === "open").toArray();
  const events = await db.timelineEvents.where("projectId").equals(projectId).sortBy("sortOrder");

  const chapterSummaries = chapters.map((c) => {
    const scenes = scenesByChapter.filter((s) => s.chapterId === c.id);
    const text = scenes.map((s) => s.plainText).join(" ");
    return { chapterId: c.id, title: c.title, summary: text.slice(0, 400) || "(no content yet)" };
  });

  const retrievedChunks = scenesByChapter
    .filter((s) => s.plainText.trim().length > 0)
    .slice(0, 12)
    .map((s) => ({ sourceType: "scene", sourceId: s.id, label: chapters.find((c) => c.id === s.chapterId)?.title ?? s.title, content: s.plainText.slice(0, 800) }));

  return {
    projectTitle: project?.title ?? "Untitled",
    chapterSummaries,
    retrievedChunks,
    approvedCanonFacts: [],
    storyBibleDigest: entries.map((e) => ({ id: e.id, name: e.name, entryType: e.entryType, digest: e.summary ?? JSON.stringify(e.fields).slice(0, 200) })),
    openThreads: threads.map((t) => ({ id: t.id, title: t.title })),
    recentTimelineEvents: events.slice(0, 10).map((e) => ({ id: e.id, label: e.label, whenLabel: e.whenLabel })),
    recentMessages: [],
  };
}
