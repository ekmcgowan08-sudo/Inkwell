import Dexie, { type Table } from "dexie";
import type {
  AIConversation,
  AIFinding,
  AIMessage,
  Chapter,
  DailyProgress,
  DeletedItem,
  DocumentRevision,
  Goal,
  NamedSnapshot,
  Part,
  Project,
  Relationship,
  Scene,
  Series,
  StoryboardCard,
  StoryBibleEntry,
  StoryThread,
  TimelineEvent,
  WritingSession,
} from "@inkwell/shared-types";

/**
 * The local-first store. Every client (this browser/desktop webview) keeps a
 * full working copy here; it is the source of truth while writing, and the
 * thing the editor reads from for instant response regardless of network
 * state. See docs/EDITOR_AND_AUTOSAVE.md and docs/SYNC_AND_CONFLICTS.md.
 */

export interface SyncQueueItem {
  id: string;
  table: string;
  recordId: string;
  op: "upsert" | "delete";
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export interface LocalUser {
  id: string;
  displayName: string;
  createdAt: string;
}

/** Local-only bookkeeping (never synced) for the daily writing-progress baseline. See repos/storyboardTimeline.ts. */
export interface DailyBaseline {
  id: string; // `${projectId}:${date}`
  projectId: string;
  date: string;
  baselineWordCount: number;
}

class InkwellDB extends Dexie {
  localUser!: Table<LocalUser, string>;
  series!: Table<Series, string>;
  projects!: Table<Project, string>;
  parts!: Table<Part, string>;
  chapters!: Table<Chapter, string>;
  scenes!: Table<Scene, string>;
  storyBibleEntries!: Table<StoryBibleEntry, string>;
  relationships!: Table<Relationship, string>;
  storyThreads!: Table<StoryThread, string>;
  storyboardCards!: Table<StoryboardCard, string>;
  timelineEvents!: Table<TimelineEvent, string>;
  goals!: Table<Goal, string>;
  writingSessions!: Table<WritingSession, string>;
  dailyProgress!: Table<DailyProgress, string>;
  documentRevisions!: Table<DocumentRevision, string>;
  namedSnapshots!: Table<NamedSnapshot, string>;
  deletedItems!: Table<DeletedItem, string>;
  aiConversations!: Table<AIConversation, string>;
  aiMessages!: Table<AIMessage, string>;
  aiFindings!: Table<AIFinding, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  dailyBaselines!: Table<DailyBaseline, string>;

  constructor() {
    super("inkwell");
    this.version(1).stores({
      localUser: "id",
      series: "id, userId",
      projects: "id, userId, seriesId, status, deletedAt",
      parts: "id, projectId, sortOrder",
      chapters: "id, projectId, partId, sortOrder",
      scenes: "id, projectId, chapterId, sortOrder",
      storyBibleEntries: "id, projectId, entryType",
      relationships: "id, projectId, fromEntryId, toEntryId",
      storyThreads: "id, projectId",
      storyboardCards: "id, projectId, column, sortOrder",
      timelineEvents: "id, projectId, sortOrder",
      goals: "id, projectId, kind",
      writingSessions: "id, projectId, startedAt",
      dailyProgress: "id, projectId, date",
      documentRevisions: "id, sceneId, revision",
      namedSnapshots: "id, projectId, createdAt",
      deletedItems: "id, projectId, userId, purgeAfter",
      aiConversations: "id, projectId, updatedAt",
      aiMessages: "id, conversationId, createdAt",
      aiFindings: "id, projectId, status",
      syncQueue: "id, table, createdAt",
      dailyBaselines: "id, projectId, date",
    });
  }
}

export const db = new InkwellDB();

const LOCAL_USER_KEY = "inkwell.localUserId";

/** Stable pseudo-user id for local-only mode, persisted so a page refresh doesn't orphan data. */
export async function getOrCreateLocalUser(): Promise<LocalUser> {
  const existing = await db.localUser.toCollection().first();
  if (existing) return existing;
  const user: LocalUser = {
    id: localStorage.getItem(LOCAL_USER_KEY) ?? crypto.randomUUID(),
    displayName: "Author",
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(LOCAL_USER_KEY, user.id);
  await db.localUser.put(user);
  return user;
}

export function nowIso(): string {
  return new Date().toISOString();
}
