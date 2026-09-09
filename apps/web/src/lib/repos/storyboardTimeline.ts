import type { DailyProgress, Goal, StoryboardCard, StoryThread, TimelineEvent } from "@inkwell/shared-types";
import { db, nowIso } from "../db";
import { pushUpsert, pushDelete } from "../sync";

// ---- Storyboard ----

export async function listStoryboardCards(projectId: string): Promise<StoryboardCard[]> {
  return db.storyboardCards.where("projectId").equals(projectId).sortBy("sortOrder");
}

export async function createStoryboardCard(projectId: string, title: string, column = "Act 1"): Promise<StoryboardCard> {
  const existing = await listStoryboardCards(projectId);
  const now = nowIso();
  const card: StoryboardCard = {
    id: crypto.randomUUID(),
    projectId,
    sceneId: null,
    title,
    summary: null,
    column,
    sortOrder: existing.length,
    povCharacterId: null,
    charactersPresent: [],
    locationId: null,
    inWorldTime: null,
    storyThreadId: null,
    status: "drafting",
    revisionPriority: null,
    colorLabel: null,
    notes: null,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.storyboardCards.put(card);
  void pushUpsert("storyboard_cards", card.id, card as unknown as Record<string, unknown>);
  return card;
}

export async function updateStoryboardCard(id: string, patch: Partial<StoryboardCard>): Promise<void> {
  await db.storyboardCards.update(id, { ...patch, updatedAt: nowIso() });
  const full = await db.storyboardCards.get(id);
  if (full) void pushUpsert("storyboard_cards", id, full as unknown as Record<string, unknown>);
}

export async function reorderStoryboardCards(cards: { id: string; column: string; sortOrder: number }[]): Promise<void> {
  await db.transaction("rw", db.storyboardCards, async () => {
    for (const c of cards) await db.storyboardCards.update(c.id, { column: c.column, sortOrder: c.sortOrder, updatedAt: nowIso() });
  });
  for (const c of cards) {
    const full = await db.storyboardCards.get(c.id);
    if (full) void pushUpsert("storyboard_cards", c.id, full as unknown as Record<string, unknown>);
  }
}

export async function deleteStoryboardCard(id: string): Promise<void> {
  await db.storyboardCards.delete(id);
  void pushDelete("storyboard_cards", id);
}

export async function listStoryThreads(projectId: string): Promise<StoryThread[]> {
  return db.storyThreads.where("projectId").equals(projectId).toArray();
}

export async function createStoryThread(projectId: string, title: string): Promise<StoryThread> {
  const now = nowIso();
  const thread: StoryThread = {
    id: crypto.randomUUID(),
    projectId,
    title,
    color: "#C9A227",
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  await db.storyThreads.put(thread);
  void pushUpsert("story_threads", thread.id, thread as unknown as Record<string, unknown>);
  return thread;
}

// ---- Timeline ----

export async function listTimelineEvents(projectId: string): Promise<TimelineEvent[]> {
  return db.timelineEvents.where("projectId").equals(projectId).sortBy("sortOrder");
}

export async function createTimelineEvent(projectId: string, label: string): Promise<TimelineEvent> {
  const existing = await listTimelineEvents(projectId);
  const now = nowIso();
  const event: TimelineEvent = {
    id: crypto.randomUUID(),
    projectId,
    label,
    detail: null,
    whenLabel: "New event",
    whenDate: null,
    fictionalCalendarId: null,
    durationMinutes: null,
    locationId: null,
    characterIds: [],
    linkedSceneIds: [],
    dependsOnEventIds: [],
    plotlineTag: null,
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now,
  };
  await db.timelineEvents.put(event);
  void pushUpsert("timeline_events", event.id, event as unknown as Record<string, unknown>);
  return event;
}

export async function updateTimelineEvent(id: string, patch: Partial<TimelineEvent>): Promise<void> {
  await db.timelineEvents.update(id, { ...patch, updatedAt: nowIso() });
  const full = await db.timelineEvents.get(id);
  if (full) void pushUpsert("timeline_events", id, full as unknown as Record<string, unknown>);
}

export async function deleteTimelineEvent(id: string): Promise<void> {
  await db.timelineEvents.delete(id);
  void pushDelete("timeline_events", id);
}

/** Naive conflict check: two events with the same explicit whenDate and overlapping duration at different locations. */
export function detectTimelineConflicts(events: TimelineEvent[]): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]!;
      const b = events[j]!;
      if (!a.whenDate || !b.whenDate || a.whenDate !== b.whenDate) continue;
      const sharedCharacters = a.characterIds.some((c) => b.characterIds.includes(c));
      if (sharedCharacters && a.locationId && b.locationId && a.locationId !== b.locationId) {
        conflicts.set(a.id, [...(conflicts.get(a.id) ?? []), b.id]);
        conflicts.set(b.id, [...(conflicts.get(b.id) ?? []), a.id]);
      }
    }
  }
  return conflicts;
}

// ---- Goals & progress ----

export async function getActiveDailyGoal(projectId: string): Promise<Goal | undefined> {
  const goals = await db.goals.where("projectId").equals(projectId).and((g) => g.kind === "daily" && g.active).toArray();
  return goals[0];
}

export async function setDailyGoal(projectId: string, targetWords: number): Promise<Goal> {
  const existing = await getActiveDailyGoal(projectId);
  const now = nowIso();
  const goal: Goal = existing
    ? { ...existing, targetWords, updatedAt: now }
    : {
        id: crypto.randomUUID(),
        projectId,
        kind: "daily",
        targetWords,
        deadline: null,
        restDays: [],
        active: true,
        createdAt: now,
        updatedAt: now,
      };
  await db.goals.put(goal);
  void pushUpsert("goals", goal.id, goal as unknown as Record<string, unknown>);
  return goal;
}

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Persisted replacement for the prototype's session-only "words today".
 *
 * Approach: the first time each calendar day sees this project (call this on
 * project open, in addition to after every autosave), we snapshot the
 * project's current total word count as that day's baseline in a small
 * local-only bookkeeping table. "Words written today" is then always
 * `currentTotal - baseline`, timezone-anchored to the author's local clock.
 * Known limitation: if a device is never opened for a project until partway
 * through a writing session on a given day (e.g. the app was already open
 * and idle since before local midnight), the baseline is captured late and
 * today's count under-reports — documented in docs/EDITOR_AND_AUTOSAVE.md.
 */
export async function recordWordsWrittenToday(projectId: string, userId: string, currentTotalWords: number): Promise<DailyProgress> {
  const date = todayLocalDate();
  const baselineKey = `${projectId}:${date}`;
  let baseline = await db.dailyBaselines.get(baselineKey);
  if (!baseline) {
    baseline = { id: baselineKey, projectId, date, baselineWordCount: currentTotalWords };
    await db.dailyBaselines.put(baseline);
  }

  const wordsWritten = currentTotalWords - baseline.baselineWordCount;
  const goal = await getActiveDailyGoal(projectId);
  const goalMet = goal ? wordsWritten >= goal.targetWords : false;

  const existing = await db.dailyProgress.where("projectId").equals(projectId).and((d) => d.date === date).first();
  const row: DailyProgress = existing
    ? { ...existing, wordsWritten, goalMet }
    : { id: crypto.randomUUID(), projectId, userId, date, wordsWritten, goalMet };
  await db.dailyProgress.put(row);
  void pushUpsert("daily_progress", row.id, row as unknown as Record<string, unknown>);
  return row;
}

export async function getStreak(projectId: string): Promise<number> {
  const rows = await db.dailyProgress.where("projectId").equals(projectId).and((d) => d.goalMet).sortBy("date");
  if (rows.length === 0) return 0;
  let streak = 1;
  for (let i = rows.length - 1; i > 0; i--) {
    const cur = new Date(rows[i]!.date);
    const prev = new Date(rows[i - 1]!.date);
    const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

export async function progressHistory(projectId: string): Promise<DailyProgress[]> {
  return db.dailyProgress.where("projectId").equals(projectId).sortBy("date");
}
