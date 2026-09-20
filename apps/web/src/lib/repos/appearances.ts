import type { Appearance } from "@inkwell/shared-types";
import { db, nowIso } from "../db";
import { pushUpsert, pushDelete } from "../sync";

export async function listAppearancesForEntry(entryId: string): Promise<Appearance[]> {
  return db.appearances.where("entryId").equals(entryId).toArray();
}

export async function confirmAppearance(id: string): Promise<void> {
  const existing = await db.appearances.get(id);
  if (!existing) return;
  const updated: Appearance = { ...existing, confirmed: true };
  await db.appearances.put(updated);
  void pushUpsert("appearances", id, updated as unknown as Record<string, unknown>);
}

/**
 * "Dismiss" removes the suggestion outright — the schema has no separate "rejected" state distinct
 * from "not yet reviewed" (just `confirmed: boolean`), so a dismissed mention isn't remembered as
 * rejected. Re-running detectAppearances can resurface it. Acceptable for a simple, zero-cost,
 * explicitly user-initiated scan — not worth a schema change to avoid.
 */
export async function dismissAppearance(id: string): Promise<void> {
  await db.appearances.delete(id);
  void pushDelete("appearances", id);
}

/**
 * Deterministic, local, rule-based appearance detection — NOT a model call, same philosophy as
 * findingsScanner.ts's runLocalConsistencyScan. For every story-bible entry and every scene in the
 * project, checks whether the entry's name or any alias appears (case-insensitive, whole-word) in
 * the scene's plain text; if so and no appearance row exists yet for that (entry, scene) pair,
 * creates one as an unconfirmed suggestion for the author to review. An explicit, user-initiated
 * action (a button click), never run automatically in the background — matches the "no provider
 * request without user initiation" precedent, even though this makes no provider call at all.
 *
 * Known limitations, deliberately not engineered around: a short or common name/alias (e.g. "Sam")
 * can false-positive against unrelated words that happen to share the substring boundary; this only
 * scans each scene's current plainText, so a later edit that removes the mention leaves a stale
 * suggestion until the next scan.
 */
export async function detectAppearances(projectId: string): Promise<Appearance[]> {
  const entries = await db.storyBibleEntries
    .where("projectId")
    .equals(projectId)
    .and((e) => !e.deletedAt)
    .toArray();
  const scenes = await db.scenes
    .where("projectId")
    .equals(projectId)
    .and((s) => !s.deletedAt)
    .toArray();
  const existing = await db.appearances.where("projectId").equals(projectId).toArray();
  const existingKeys = new Set(existing.map((a) => `${a.entryId}:${a.sceneId}`));

  const created: Appearance[] = [];
  const now = nowIso();

  for (const entry of entries) {
    const names = [entry.name, ...entry.aliases].map((n) => n.trim()).filter((n) => n.length >= 3);
    if (names.length === 0) continue;
    const pattern = new RegExp(`\\b(${names.map(escapeRegExp).join("|")})\\b`, "i");

    for (const scene of scenes) {
      const key = `${entry.id}:${scene.id}`;
      if (existingKeys.has(key)) continue;
      if (!pattern.test(scene.plainText)) continue;

      const appearance: Appearance = {
        id: crypto.randomUUID(),
        projectId,
        entryId: entry.id,
        sceneId: scene.id,
        source: "ai_suggested",
        confirmed: false,
        createdAt: now,
      };
      await db.appearances.put(appearance);
      void pushUpsert("appearances", appearance.id, appearance as unknown as Record<string, unknown>);
      created.push(appearance);
      existingKeys.add(key);
    }
  }

  return created;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
