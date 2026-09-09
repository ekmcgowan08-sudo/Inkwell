import { db } from "./db";
import { getSupabase } from "./supabase";
import { isLocalOnlyMode } from "./env";
import { toSnakeRow } from "./caseConvert";

export type SyncStatus = "synced" | "syncing" | "offline" | "error";

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

/**
 * Best-effort push of one row to Supabase. Local-first: the caller has
 * ALREADY written to Dexie before calling this, so a failure here never
 * loses data — it just queues a retry. See docs/SYNC_AND_CONFLICTS.md.
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
  const { error } = await supabase.from(table).upsert(toSnakeRow(row) as never);
  if (error) {
    setStatus("error");
    await queueMutation(table, recordId, "upsert", row);
    return;
  }
  setStatus("synced");
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
  for (const item of items) {
    try {
      if (item.op === "upsert") {
        const { error } = await supabase.from(item.table).upsert(toSnakeRow(item.payload as Record<string, unknown>) as never);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(item.table).delete().eq("id", item.recordId);
        if (error) throw error;
      }
      await db.syncQueue.delete(item.id);
    } catch (err) {
      await db.syncQueue.update(item.id, { attempts: item.attempts + 1, lastError: String(err) });
    }
  }
  const remaining = await db.syncQueue.count();
  setStatus(remaining > 0 ? "error" : "synced");
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushSyncQueue());
  window.addEventListener("offline", () => setStatus("offline"));
  setInterval(() => void flushSyncQueue(), 30_000);
}
