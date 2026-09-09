import type { CharacterFields, Relationship, StoryBibleEntry, StoryBibleEntry as SBEntry } from "@inkwell/shared-types";
import { db, nowIso } from "../db";
import { pushUpsert, pushDelete } from "../sync";

export async function listEntries(projectId: string, entryType?: SBEntry["entryType"]): Promise<StoryBibleEntry[]> {
  const all = await db.storyBibleEntries.where("projectId").equals(projectId).and((e) => !e.deletedAt).toArray();
  return entryType ? all.filter((e) => e.entryType === entryType) : all;
}

export async function createEntry(
  projectId: string,
  entryType: SBEntry["entryType"],
  name: string,
): Promise<StoryBibleEntry> {
  const now = nowIso();
  const entry: StoryBibleEntry = {
    id: crypto.randomUUID(),
    projectId,
    entryType,
    customTypeLabel: null,
    name,
    aliases: [],
    summary: null,
    canonStatus: "draft",
    firstAppearanceSceneId: null,
    latestAppearanceSceneId: null,
    imageUrl: null,
    tags: [],
    notes: null,
    fields: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.storyBibleEntries.put(entry);
  void pushUpsert("story_bible_entries", entry.id, entry as unknown as Record<string, unknown>);
  return entry;
}

export async function updateEntry(id: string, patch: Partial<StoryBibleEntry>): Promise<void> {
  await db.storyBibleEntries.update(id, { ...patch, updatedAt: nowIso() });
  const full = await db.storyBibleEntries.get(id);
  if (full) void pushUpsert("story_bible_entries", id, full as unknown as Record<string, unknown>);
}

export async function updateCharacterField(id: string, field: keyof CharacterFields, value: string): Promise<void> {
  const entry = await db.storyBibleEntries.get(id);
  if (!entry) return;
  const fields = { ...(entry.fields as CharacterFields), [field]: value };
  await updateEntry(id, { fields });
}

export async function softDeleteEntry(id: string, projectId: string, userId: string): Promise<void> {
  const entry = await db.storyBibleEntries.get(id);
  if (!entry) return;
  await db.deletedItems.add({
    id: crypto.randomUUID(),
    projectId,
    userId,
    entityType: "story_bible_entry",
    entityId: id,
    snapshot: entry as unknown as Record<string, unknown>,
    deletedAt: nowIso(),
    purgeAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await db.storyBibleEntries.update(id, { deletedAt: nowIso() });
  void pushDelete("story_bible_entries", id);
}

export async function listRelationships(projectId: string): Promise<Relationship[]> {
  return db.relationships.where("projectId").equals(projectId).toArray();
}

export async function createRelationship(
  projectId: string,
  fromEntryId: string,
  toEntryId: string,
  relationshipType: string,
): Promise<Relationship> {
  const now = nowIso();
  const rel: Relationship = {
    id: crypto.randomUUID(),
    projectId,
    fromEntryId,
    toEntryId,
    relationshipType,
    direction: "mutual",
    description: null,
    status: "neutral",
    changesOverTime: [],
    linkedSceneIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.relationships.put(rel);
  void pushUpsert("relationships", rel.id, rel as unknown as Record<string, unknown>);
  return rel;
}

export async function deleteRelationship(id: string): Promise<void> {
  await db.relationships.delete(id);
  void pushDelete("relationships", id);
}

/** Simple project-wide search across name/summary/notes/tags — used by the story bible search box and command palette. */
export async function searchStoryBible(projectId: string, query: string): Promise<StoryBibleEntry[]> {
  const q = query.trim().toLowerCase();
  const entries = await listEntries(projectId);
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.summary?.toLowerCase().includes(q) ||
      e.notes?.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)) ||
      e.aliases.some((a) => a.toLowerCase().includes(q)),
  );
}
