import type { Project, Series } from "@inkwell/shared-types";
import { db, nowIso } from "../db";
import { pushUpsert } from "../sync";

export async function listProjects(userId: string): Promise<Project[]> {
  return db.projects
    .where("userId")
    .equals(userId)
    .and((p) => p.status !== "deleted")
    .toArray();
}

export async function listSeries(userId: string): Promise<Series[]> {
  return db.series
    .where("userId")
    .equals(userId)
    .and((s) => !s.deletedAt)
    .toArray();
}

export async function createProject(
  userId: string,
  input: {
    title: string;
    genre?: string;
    seriesId?: string | null;
    goalWords?: number;
    dailyGoalWords?: number;
    writingStyle?: Project["writingStyle"];
  },
): Promise<Project> {
  const now = nowIso();
  const project: Project = {
    id: crypto.randomUUID(),
    userId,
    seriesId: input.seriesId ?? null,
    seriesOrder: null,
    title: input.title,
    genre: input.genre ?? "",
    coverColor: "#8B3A3A",
    coverImageUrl: null,
    goalWords: input.goalWords ?? 80000,
    dailyGoalWords: input.dailyGoalWords ?? 500,
    writingStyle: input.writingStyle ?? "unset",
    status: "active",
    isFavorite: false,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    lastEditedAt: now,
    deletedAt: null,
  };
  await db.projects.put(project);
  // A brand-new project starts with one empty chapter so the manuscript
  // view is never a dead end — mirrors the prototype's `createProject`.
  const chapterId = crypto.randomUUID();
  await db.chapters.put({
    id: chapterId,
    projectId: project.id,
    partId: null,
    title: "Chapter 1",
    sortOrder: 0,
    status: "drafting",
    summary: null,
    revision: 0,
    wordCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await db.scenes.put({
    id: crypto.randomUUID(),
    projectId: project.id,
    chapterId,
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
  void pushUpsert("projects", project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function createSeries(userId: string, title: string): Promise<Series> {
  const now = nowIso();
  const series: Series = {
    id: crypto.randomUUID(),
    userId,
    title,
    description: null,
    coverColor: "#8B3A3A",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.series.put(series);
  void pushUpsert("series", series.id, series as unknown as Record<string, unknown>);
  return series;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  const now = nowIso();
  const current = await db.projects.get(id);
  if (!current) return;
  await db.projects.update(id, { ...patch, revision: current.revision + 1, updatedAt: now, lastEditedAt: now });
  const full = await db.projects.get(id);
  if (full) void pushUpsert("projects", id, full as unknown as Record<string, unknown>);
}

export async function archiveProject(id: string): Promise<void> {
  await updateProject(id, { status: "archived" });
}

export async function toggleFavorite(id: string, value: boolean): Promise<void> {
  await updateProject(id, { isFavorite: value });
}

/** Soft delete with a recovery window — never a hard delete from the dashboard. */
export async function softDeleteProject(id: string, userId: string): Promise<void> {
  const project = await db.projects.get(id);
  if (!project) return;
  await db.deletedItems.add({
    id: crypto.randomUUID(),
    projectId: id,
    userId,
    entityType: "project",
    entityId: id,
    snapshot: project as unknown as Record<string, unknown>,
    deletedAt: nowIso(),
    purgeAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await updateProject(id, { status: "deleted", deletedAt: nowIso() });
}

export async function duplicateProject(id: string, userId: string): Promise<Project | null> {
  const source = await db.projects.get(id);
  if (!source) return null;
  const copy = await createProject(userId, {
    title: `${source.title} (Copy)`,
    genre: source.genre,
    goalWords: source.goalWords,
    dailyGoalWords: source.dailyGoalWords,
  });
  const chapters = await db.chapters.where("projectId").equals(id).toArray();
  const idMap = new Map<string, string>();
  for (const chapter of chapters) {
    const newChapterId = crypto.randomUUID();
    idMap.set(chapter.id, newChapterId);
    await db.chapters.put({ ...chapter, id: newChapterId, projectId: copy.id });
  }
  const scenes = await db.scenes.where("projectId").equals(id).toArray();
  for (const scene of scenes) {
    await db.scenes.put({
      ...scene,
      id: crypto.randomUUID(),
      projectId: copy.id,
      chapterId: idMap.get(scene.chapterId) ?? scene.chapterId,
    });
  }
  return copy;
}

export function wordCountForProject(chapters: { id: string }[], sceneWordCounts: Map<string, number>): number {
  let total = 0;
  for (const c of chapters) total += sceneWordCounts.get(c.id) ?? 0;
  return total;
}
