import { db } from "./db";
import { getSupabase } from "./supabase";
import { isLocalOnlyMode } from "./env";
import { toCamelRow, toSnakeRow } from "@inkwell/shared-types";

export type SyncStatus = "synced" | "syncing" | "offline" | "error" | "conflict";

type Listener = (status: SyncStatus) => void;
const listeners = new Set<Listener>();
let currentStatus: SyncStatus = "synced";

function setStatus(s: SyncStatus) {
  currentStatus = s;
  listeners.forEach((l) => l(s));
}

export function onSyncStatusChange(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

type PushResult = "synced" | "conflict" | "error";

/**
 * Revision-gated write: succeeds only if the server's current revision still
 * matches the revision this local write was based on (`row.revision - 1`),
 * the standard optimistic-concurrency check. A zero-row update result means
 * either the row doesn't exist server-side yet (first sync of it) or another
 * device's write landed first (a real conflict) — the two are told apart by
 * a follow-up fetch. See docs/SYNC_AND_CONFLICTS.md.
 */
async function conditionalUpsert(table: string, recordId: string, row: Record<string, unknown>): Promise<PushResult> {
  const supabase = getSupabase();
  if (!supabase) return "error";
  const snakeRow = toSnakeRow(row);
  const revision = row.revision;

  // Rows without a revision counter (e.g. join/local-only tables) have nothing to gate on.
  // Revision 0 is a row's first-ever push: nothing on the server to conflict with yet.
  if (typeof revision !== "number" || revision <= 0) {
    const { error } = await supabase.from(table).upsert(snakeRow as never);
    return error ? "error" : "synced";
  }

  const baseRevision = revision - 1;
  const { data: updated, error: updateError } = await supabase
    .from(table)
    .update(snakeRow as never)
    .eq("id", recordId)
    .eq("revision", baseRevision)
    .select("id");
  if (updateError) return "error";
  if (updated && updated.length > 0) return "synced";

  const { data: serverRow, error: fetchError } = await supabase.from(table).select("*").eq("id", recordId).maybeSingle();
  if (fetchError) return "error";

  if (!serverRow) {
    // Not on the server yet (e.g. queued while offline before its first sync) — plain insert.
    const { error: insertError } = await supabase.from(table).upsert(snakeRow as never);
    return insertError ? "error" : "synced";
  }

  await db.syncConflicts.put({
    id: `${table}:${recordId}`,
    table,
    recordId,
    localRow: row,
    serverRow: serverRow as Record<string, unknown>,
    detectedAt: new Date().toISOString(),
  });
  return "conflict";
}

/**
 * Best-effort push of one row to Supabase. Local-first: the caller has
 * ALREADY written to Dexie before calling this, so a failure here never
 * loses data — it just queues a retry (or, on a real conflict, waits for the
 * author to resolve it). See docs/SYNC_AND_CONFLICTS.md.
 */
export async function pushUpsert(table: string, recordId: string, row: Record<string, unknown>): Promise<void> {
  if (isLocalOnlyMode) return; // single-device local mode: nothing to sync to
  const supabase = getSupabase();
  if (!supabase || !navigator.onLine) {
    setStatus("offline");
    await queueMutation(table, recordId, "upsert", row);
    return;
  }
  setStatus("syncing");
  const result = await conditionalUpsert(table, recordId, row);
  if (result === "synced") {
    setStatus("synced");
  } else if (result === "conflict") {
    setStatus("conflict");
  } else {
    setStatus("error");
    await queueMutation(table, recordId, "upsert", row);
  }
}

export async function pushDelete(table: string, recordId: string): Promise<void> {
  if (isLocalOnlyMode) return;
  const supabase = getSupabase();
  if (!supabase || !navigator.onLine) {
    await queueMutation(table, recordId, "delete", null);
    return;
  }
  const { error } = await supabase.from(table).delete().eq("id", recordId);
  if (error) await queueMutation(table, recordId, "delete", null);
}

async function queueMutation(table: string, recordId: string, op: "upsert" | "delete", payload: unknown) {
  await db.syncQueue.put({
    id: `${table}:${recordId}:${op}`,
    table,
    recordId,
    op,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
}

/** Drains the local retry queue. Call on reconnect and on an interval. */
export async function flushSyncQueue(): Promise<void> {
  if (isLocalOnlyMode) return;
  const supabase = getSupabase();
  if (!supabase || !navigator.onLine) return;
  const items = await db.syncQueue.toArray();
  if (items.length === 0) return;
  setStatus("syncing");
  let sawConflict = false;
  for (const item of items) {
    try {
      if (item.op === "upsert") {
        const result = await conditionalUpsert(item.table, item.recordId, item.payload as Record<string, unknown>);
        if (result === "error") throw new Error("conditional upsert failed");
        if (result === "conflict") sawConflict = true;
      } else {
        const { error } = await supabase.from(item.table).delete().eq("id", item.recordId);
        if (error) throw error;
      }
      // A conflict is now tracked in syncConflicts, not this queue — resolving it produces a fresh push.
      await db.syncQueue.delete(item.id);
    } catch (err) {
      await db.syncQueue.update(item.id, { attempts: item.attempts + 1, lastError: String(err) });
    }
  }
  const remaining = await db.syncQueue.count();
  setStatus(remaining > 0 ? "error" : sawConflict ? "conflict" : "synced");
}

/** Maps a Supabase snake_case table name to its Dexie store name (e.g. "story_bible_entries" -> "storyBibleEntries"). */
function dexieTableNameFor(snakeTable: string): string {
  return snakeTable.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Resolve a recorded conflict by keeping the local (this device's) version. Re-pushes it
 * as the revision *after* the server's current one, so the gated write succeeds this time,
 * and updates the local copy's revision to match so the next local edit stays in sync.
 */
export async function resolveConflictKeepMine(conflictId: string): Promise<void> {
  const conflict = await db.syncConflicts.get(conflictId);
  if (!conflict) return;
  const serverRevision = conflict.serverRow.revision;
  const nextRevision = (typeof serverRevision === "number" ? serverRevision : 0) + 1;
  const row = { ...conflict.localRow, revision: nextRevision };
  await db.table(dexieTableNameFor(conflict.table)).update(conflict.recordId, { revision: nextRevision });
  await db.syncConflicts.delete(conflictId);
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from(conflict.table).upsert(toSnakeRow(row) as never);
  if (error) await queueMutation(conflict.table, conflict.recordId, "upsert", row);
}

/**
 * Resolve a recorded conflict by keeping the server's (other device's) version. Overwrites
 * this device's local copy so both sides end up consistent, and drops the queued write.
 */
export async function resolveConflictKeepTheirs(conflictId: string): Promise<void> {
  const conflict = await db.syncConflicts.get(conflictId);
  if (!conflict) return;
  const camelRow = toCamelRow<Record<string, unknown>>(conflict.serverRow);
  await db.table(dexieTableNameFor(conflict.table)).put(camelRow);
  await db.syncQueue.delete(`${conflict.table}:${conflict.recordId}:upsert`);
  await db.syncConflicts.delete(conflictId);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushSyncQueue());
  window.addEventListener("offline", () => setStatus("offline"));
  setInterval(() => void flushSyncQueue(), 30_000);
}
