import type { WritingSession } from "@inkwell/shared-types";
import { db, nowIso } from "../db";
import { pushUpsert } from "../sync";

/**
 * A writing session is a continuous span of active editing, tracked separately from the daily
 * word-count baseline (storyboardTimeline.ts) — sessions are per-visit ("you wrote for 22 minutes
 * and added 340 words just now"), daily progress is per-calendar-day. Start is lazy: called on the
 * first real edit, not on merely opening the manuscript page, so browsing without writing doesn't
 * create empty sessions. End is best-effort (component unmount / tab hidden) — a hard browser
 * crash or force-quit leaves a session with `endedAt: null` forever, which is an accepted, harmless
 * limitation (it just never shows a duration) rather than something worth a heartbeat-write scheme
 * to avoid, which would violate the "never wire a DB write to every keystroke" rule in spirit.
 */
export async function startWritingSession(projectId: string, userId: string, wordsStart: number): Promise<WritingSession> {
  const now = nowIso();
  const session: WritingSession = {
    id: crypto.randomUUID(),
    projectId,
    userId,
    startedAt: now,
    endedAt: null,
    wordsStart,
    wordsEnd: wordsStart,
    createdAt: now,
  };
  await db.writingSessions.put(session);
  void pushUpsert("writing_sessions", session.id, session as unknown as Record<string, unknown>);
  return session;
}

export async function endWritingSession(id: string, wordsEnd: number): Promise<void> {
  const existing = await db.writingSessions.get(id);
  if (!existing || existing.endedAt) return; // already ended, or never started — nothing to do
  const updated: WritingSession = { ...existing, endedAt: nowIso(), wordsEnd };
  await db.writingSessions.put(updated);
  void pushUpsert("writing_sessions", id, updated as unknown as Record<string, unknown>);
}

export async function listRecentSessions(projectId: string, limit = 10): Promise<WritingSession[]> {
  const sessions = await db.writingSessions.where("projectId").equals(projectId).and((s) => !!s.endedAt).sortBy("startedAt");
  return sessions.slice(-limit).reverse();
}
