import type { Chapter, Part, Scene } from "@inkwell/shared-types";
import { countWords, extractPlainText } from "@inkwell/shared-types";
import { db, nowIso } from "../db";
import { pushUpsert, pushDelete } from "../sync";

export async function listChapters(projectId: string): Promise<Chapter[]> {
  return db.chapters
    .where("projectId")
    .equals(projectId)
    .and((c) => !c.deletedAt)
    .sortBy("sortOrder");
}

// ---- Parts (optional grouping above chapters — see PRODUCT.md's manuscript hierarchy) ----

export async function listParts(projectId: string): Promise<Part[]> {
  return db.parts
    .where("projectId")
    .equals(projectId)
    .and((p) => !p.deletedAt)
    .sortBy("sortOrder");
}

export async function createPart(projectId: string, title: string): Promise<Part> {
  const existing = await listParts(projectId);
  const now = nowIso();
  const part: Part = {
    id: crypto.randomUUID(),
    projectId,
    title,
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.parts.put(part);
  void pushUpsert("parts", part.id, part as unknown as Record<string, unknown>);
  return part;
}

export async function renamePart(id: string, title: string): Promise<void> {
  await db.parts.update(id, { title, updatedAt: nowIso() });
  const full = await db.parts.get(id);
  if (full) void pushUpsert("parts", id, full as unknown as Record<string, unknown>);
}

export async function reorderParts(orderedIds: string[]): Promise<void> {
  await db.transaction("rw", db.parts, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.parts.update(orderedIds[i]!, { sortOrder: i, updatedAt: nowIso() });
    }
  });
  for (const id of orderedIds) {
    const full = await db.parts.get(id);
    if (full) void pushUpsert("parts", id, full as unknown as Record<string, unknown>);
  }
}

/**
 * A part is purely an organizational label, never a container whose removal should take content
 * with it — deleting one ungroups its chapters (partId -> null) rather than deleting them.
 */
export async function deletePart(id: string): Promise<void> {
  const chaptersInPart = await db.chapters.where("partId").equals(id).toArray();
  await db.transaction("rw", db.parts, db.chapters, async () => {
    for (const chapter of chaptersInPart) {
      await db.chapters.update(chapter.id, { partId: null, updatedAt: nowIso() });
    }
    await db.parts.delete(id);
  });
  void pushDelete("parts", id);
  for (const chapter of chaptersInPart) {
    const full = await db.chapters.get(chapter.id);
    if (full) void pushUpsert("chapters", chapter.id, full as unknown as Record<string, unknown>);
  }
}

export async function assignChapterToPart(chapterId: string, partId: string | null): Promise<void> {
  const current = await db.chapters.get(chapterId);
  if (!current) return;
  await db.chapters.update(chapterId, { partId, revision: current.revision + 1, updatedAt: nowIso() });
  const full = await db.chapters.get(chapterId);
  if (full) void pushUpsert("chapters", chapterId, full as unknown as Record<string, unknown>);
}

export async function listScenes(chapterId: string): Promise<Scene[]> {
  return db.scenes
    .where("chapterId")
    .equals(chapterId)
    .and((s) => !s.deletedAt)
    .sortBy("sortOrder");
}

export async function listAllScenes(projectId: string): Promise<Scene[]> {
  return db.scenes
    .where("projectId")
    .equals(projectId)
    .and((s) => !s.deletedAt)
    .toArray();
}

export async function createChapter(projectId: string, title: string): Promise<Chapter> {
  const existing = await listChapters(projectId);
  const now = nowIso();
  const chapter: Chapter = {
    id: crypto.randomUUID(),
    projectId,
    partId: null,
    title,
    sortOrder: existing.length,
    status: "drafting",
    summary: null,
    revision: 0,
    wordCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.chapters.put(chapter);
  await db.scenes.put({
    id: crypto.randomUUID(),
    projectId,
    chapterId: chapter.id,
    title: "Scene 1",
    sortOrder: 0,
    content: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    plainText: "",
    wordCount: 0,
    povCharacterId: null,
    locationId: null,
    inWorldTime: null,
    storyThreadId: null,
    status: "drafting",
    revisionPriority: null,
    colorLabel: null,
    notes: null,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  void pushUpsert("chapters", chapter.id, chapter as unknown as Record<string, unknown>);
  return chapter;
}

export async function renameChapter(id: string, title: string): Promise<void> {
  const current = await db.chapters.get(id);
  if (!current) return;
  await db.chapters.update(id, { title, revision: current.revision + 1, updatedAt: nowIso() });
  const full = await db.chapters.get(id);
  if (full) void pushUpsert("chapters", id, full as unknown as Record<string, unknown>);
}

export async function reorderChapters(projectId: string, orderedIds: string[]): Promise<void> {
  await db.transaction("rw", db.chapters, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const current = await db.chapters.get(orderedIds[i]!);
      if (!current) continue;
      await db.chapters.update(orderedIds[i]!, { sortOrder: i, revision: current.revision + 1, updatedAt: nowIso() });
    }
  });
  for (const id of orderedIds) {
    const full = await db.chapters.get(id);
    if (full) void pushUpsert("chapters", id, full as unknown as Record<string, unknown>);
  }
  void projectId;
}

export async function softDeleteChapter(id: string, projectId: string, userId: string): Promise<void> {
  const chapter = await db.chapters.get(id);
  if (!chapter) return;
  await db.deletedItems.add({
    id: crypto.randomUUID(),
    projectId,
    userId,
    entityType: "chapter",
    entityId: id,
    snapshot: chapter as unknown as Record<string, unknown>,
    deletedAt: nowIso(),
    purgeAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await db.chapters.update(id, { deletedAt: nowIso() });
  void pushDelete("chapters", id);
}

export async function createScene(projectId: string, chapterId: string, title: string): Promise<Scene> {
  const existing = await listScenes(chapterId);
  const now = nowIso();
  const scene: Scene = {
    id: crypto.randomUUID(),
    projectId,
    chapterId,
    title,
    sortOrder: existing.length,
    content: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    plainText: "",
    wordCount: 0,
    povCharacterId: null,
    locationId: null,
    inWorldTime: null,
    storyThreadId: null,
    status: "drafting",
    revisionPriority: null,
    colorLabel: null,
    notes: null,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.scenes.put(scene);
  void pushUpsert("scenes", scene.id, scene as unknown as Record<string, unknown>);
  return scene;
}

/**
 * The autosave write path. Called by the editor's debounce timer, not on
 * every keystroke. Bumps `revision` (used for optimistic-concurrency sync)
 * and appends a document_revisions row so crash recovery / version history
 * always has a prior state to fall back to. See docs/EDITOR_AND_AUTOSAVE.md.
 */
export async function autosaveScene(sceneId: string, content: unknown): Promise<{ wordCount: number }> {
  const scene = await db.scenes.get(sceneId);
  if (!scene) throw new Error("Scene not found");
  const plainText = extractPlainText(content);
  const wordCount = countWords(plainText);
  const nextRevision = scene.revision + 1;
  const now = nowIso();

  await db.transaction("rw", db.scenes, db.documentRevisions, db.chapters, async () => {
    await db.scenes.update(sceneId, { content, plainText, wordCount, revision: nextRevision, updatedAt: now });
    await db.documentRevisions.put({
      id: crypto.randomUUID(),
      sceneId,
      projectId: scene.projectId,
      revision: nextRevision,
      content,
      plainText,
      wordCount,
      createdAt: now,
      createdBy: "autosave",
    });
    await recomputeChapterWordCount(scene.chapterId);
  });

  const full = await db.scenes.get(sceneId);
  if (full) void pushUpsert("scenes", sceneId, full as unknown as Record<string, unknown>);
  return { wordCount };
}

async function recomputeChapterWordCount(chapterId: string): Promise<void> {
  const scenes = await listScenes(chapterId);
  const total = scenes.reduce((sum, s) => sum + s.wordCount, 0);
  await db.chapters.update(chapterId, { wordCount: total, updatedAt: nowIso() });
}

export async function projectWordCount(projectId: string): Promise<number> {
  const scenes = await listAllScenes(projectId);
  return scenes.reduce((sum, s) => sum + s.wordCount, 0);
}

export async function listRevisions(sceneId: string) {
  return db.documentRevisions.where("sceneId").equals(sceneId).reverse().sortBy("revision");
}

export async function restoreRevision(sceneId: string, revisionId: string): Promise<void> {
  const revision = await db.documentRevisions.get(revisionId);
  if (!revision) return;
  const scene = await db.scenes.get(sceneId);
  if (!scene) return;
  const now = nowIso();
  const nextRevision = scene.revision + 1;
  await db.transaction("rw", db.scenes, db.documentRevisions, async () => {
    await db.scenes.update(sceneId, {
      content: revision.content,
      plainText: revision.plainText,
      wordCount: revision.wordCount,
      revision: nextRevision,
      updatedAt: now,
    });
    await db.documentRevisions.put({
      id: crypto.randomUUID(),
      sceneId,
      projectId: scene.projectId,
      revision: nextRevision,
      content: revision.content,
      plainText: revision.plainText,
      wordCount: revision.wordCount,
      createdAt: now,
      createdBy: "restore",
    });
  });
  const full = await db.scenes.get(sceneId);
  if (full) void pushUpsert("scenes", sceneId, full as unknown as Record<string, unknown>);
}
