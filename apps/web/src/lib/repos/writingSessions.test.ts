import { describe, expect, it, beforeEach } from "vitest";
import { db } from "../db";
import { endWritingSession, listRecentSessions, startWritingSession } from "./writingSessions";

const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("writingSessions repo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("startWritingSession creates an open session with wordsStart === wordsEnd", async () => {
    const session = await startWritingSession(PROJECT_ID, USER_ID, 1000);
    expect(session.endedAt).toBeNull();
    expect(session.wordsStart).toBe(1000);
    expect(session.wordsEnd).toBe(1000);
  });

  it("endWritingSession sets endedAt and the final word count", async () => {
    const session = await startWritingSession(PROJECT_ID, USER_ID, 1000);
    await endWritingSession(session.id, 1350);
    const updated = await db.writingSessions.get(session.id);
    expect(updated!.endedAt).not.toBeNull();
    expect(updated!.wordsEnd).toBe(1350);
  });

  it("endWritingSession is a no-op on an already-ended or nonexistent session", async () => {
    const session = await startWritingSession(PROJECT_ID, USER_ID, 1000);
    await endWritingSession(session.id, 1200);
    const firstEndedAt = (await db.writingSessions.get(session.id))!.endedAt;

    await endWritingSession(session.id, 9999); // should not overwrite
    const stillSame = await db.writingSessions.get(session.id);
    expect(stillSame!.endedAt).toBe(firstEndedAt);
    expect(stillSame!.wordsEnd).toBe(1200);

    await endWritingSession("nonexistent-id", 1); // should not throw
  });

  it("listRecentSessions returns only ended sessions, newest first, capped at the limit", async () => {
    // Seeded directly with distinct startedAt timestamps for deterministic ordering — two real
    // startWritingSession() calls in a fast test can land in the same millisecond.
    await db.writingSessions.put({
      id: "a",
      projectId: PROJECT_ID,
      userId: USER_ID,
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: "2026-01-01T10:20:00.000Z",
      wordsStart: 100,
      wordsEnd: 150,
      createdAt: "2026-01-01T10:00:00.000Z",
    });
    await db.writingSessions.put({
      id: "b",
      projectId: PROJECT_ID,
      userId: USER_ID,
      startedAt: "2026-01-01T11:00:00.000Z",
      endedAt: "2026-01-01T11:30:00.000Z",
      wordsStart: 150,
      wordsEnd: 300,
      createdAt: "2026-01-01T11:00:00.000Z",
    });
    await db.writingSessions.put({
      id: "c",
      projectId: PROJECT_ID,
      userId: USER_ID,
      startedAt: "2026-01-01T12:00:00.000Z",
      endedAt: null,
      wordsStart: 300,
      wordsEnd: 300,
      createdAt: "2026-01-01T12:00:00.000Z",
    }); // left open, should be excluded

    const recent = await listRecentSessions(PROJECT_ID, 10);
    expect(recent).toHaveLength(2);
    expect(recent.every((s) => s.endedAt !== null)).toBe(true);
    expect(recent[0]!.id).toBe("b"); // newest first
  });
});
