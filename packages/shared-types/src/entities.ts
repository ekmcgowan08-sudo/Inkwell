/**
 * Inkwell domain model.
 *
 * This file is the single hand-maintained source of truth for shared TypeScript
 * types + runtime validation (zod) used by every client (web, desktop, mobile)
 * and by the Supabase Edge Functions. It mirrors `supabase/migrations` — when
 * one changes, update the other. See docs/DATA_MODEL.md for the full ERD and
 * rationale.
 */
import { z } from "zod";
import { uuidSchema } from "./common.ts";

const timestamp = z.string().datetime();
const nullableText = z.string().nullable().default(null);

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  id: uuidSchema, // == auth.users.id
  displayName: z.string().min(1).max(120),
  avatarUrl: nullableText,
  onboardingStyle: z.enum(["plotter", "discovery", "custom", "unset"]).default("unset"),
  termsAcceptedAt: timestamp.nullable().default(null),
  privacyAcceptedAt: timestamp.nullable().default(null),
  aiTrainingOptIn: z.boolean().default(false),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Profile = z.infer<typeof profileSchema>;

export const preferencesSchema = z.object({
  userId: uuidSchema,
  theme: z.enum(["dark", "light", "system"]).default("system"),
  reducedMotion: z.boolean().default(false),
  editorFontScale: z.number().min(0.75).max(2).default(1),
  grammarProvider: z.enum(["none", "languagetool", "test"]).default("none"),
  aiModel: z.string().nullable().default(null), // null = server default
  updatedAt: timestamp,
});
export type Preferences = z.infer<typeof preferencesSchema>;

// ---------------------------------------------------------------------------
// Projects & Series
// ---------------------------------------------------------------------------

export const seriesSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  title: z.string().min(1).max(200),
  description: nullableText,
  coverColor: z.string().default("#8B3A3A"),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable().default(null),
});
export type Series = z.infer<typeof seriesSchema>;

export const projectStatusSchema = z.enum(["active", "archived", "deleted"]);

export const projectSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  seriesId: uuidSchema.nullable().default(null),
  seriesOrder: z.number().int().nonnegative().nullable().default(null),
  title: z.string().min(1).max(200),
  genre: z.string().max(80).default(""),
  coverColor: z.string().default("#8B3A3A"),
  coverImageUrl: nullableText,
  goalWords: z.number().int().nonnegative().default(80000),
  dailyGoalWords: z.number().int().nonnegative().default(500),
  writingStyle: z.enum(["plotter", "discovery", "custom", "unset"]).default("unset"),
  status: projectStatusSchema.default("active"),
  isFavorite: z.boolean().default(false),
  revision: z.number().int().nonnegative().default(0),
  createdAt: timestamp,
  updatedAt: timestamp,
  lastEditedAt: timestamp,
  deletedAt: timestamp.nullable().default(null),
});
export type Project = z.infer<typeof projectSchema>;

// ---------------------------------------------------------------------------
// Manuscript: parts, chapters, scenes
// ---------------------------------------------------------------------------

export const partSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  title: z.string().min(1).max(200),
  sortOrder: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable().default(null),
});
export type Part = z.infer<typeof partSchema>;

export const chapterStatusSchema = z.enum(["drafting", "needs_revision", "final"]);

export const chapterSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  partId: uuidSchema.nullable().default(null),
  title: z.string().min(1).max(200),
  sortOrder: z.number().int().nonnegative(),
  status: chapterStatusSchema.default("drafting"),
  summary: nullableText,
  revision: z.number().int().nonnegative().default(0),
  wordCount: z.number().int().nonnegative().default(0),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable().default(null),
});
export type Chapter = z.infer<typeof chapterSchema>;

/**
 * A scene's `content` is a canonical JSON document (ProseMirror-style node
 * tree) so formatting survives export/import round-trips; `plainText` is a
 * derived cache used for word counts, search, and AI context so we never
 * re-parse the document tree on the hot path. See docs/EDITOR_AND_AUTOSAVE.md.
 */
export const sceneSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  chapterId: uuidSchema,
  title: z.string().min(1).max(200),
  sortOrder: z.number().int().nonnegative(),
  content: z.unknown(), // canonical rich-text document (JSON)
  plainText: z.string().default(""),
  wordCount: z.number().int().nonnegative().default(0),
  povCharacterId: uuidSchema.nullable().default(null),
  locationId: uuidSchema.nullable().default(null),
  inWorldTime: nullableText,
  storyThreadId: uuidSchema.nullable().default(null),
  status: chapterStatusSchema.default("drafting"),
  revisionPriority: z.enum(["low", "medium", "high"]).nullable().default(null),
  colorLabel: nullableText,
  notes: nullableText,
  revision: z.number().int().nonnegative().default(0),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable().default(null),
});
export type Scene = z.infer<typeof sceneSchema>;

// ---------------------------------------------------------------------------
// Story Bible
// ---------------------------------------------------------------------------

export const storyBibleEntryTypeSchema = z.enum(["character", "location", "lore", "object", "organization", "custom"]);

export const canonStatusSchema = z.enum(["canon", "draft", "speculative"]);

/** Shared envelope for every story-bible entry type; type-specific data lives in `fields`. */
export const storyBibleEntrySchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  entryType: storyBibleEntryTypeSchema,
  customTypeLabel: nullableText, // used when entryType === "custom"
  name: z.string().min(1).max(200),
  aliases: z.array(z.string()).default([]),
  summary: nullableText,
  canonStatus: canonStatusSchema.default("draft"),
  firstAppearanceSceneId: uuidSchema.nullable().default(null),
  latestAppearanceSceneId: uuidSchema.nullable().default(null),
  imageUrl: nullableText,
  tags: z.array(z.string()).default([]),
  /** Freeform notes, always available regardless of how structured the fields are. */
  notes: nullableText,
  /** Structured, type-specific fields — see characterFieldsSchema etc. below. */
  fields: z.record(z.string(), z.unknown()).default({}),
  revision: z.number().int().nonnegative().default(0),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable().default(null),
});
export type StoryBibleEntry = z.infer<typeof storyBibleEntrySchema>;

/** Recommended shape of `StoryBibleEntry.fields` when entryType === "character". Not enforced by the DB — advisory for the UI. */
export const characterFieldsSchema = z.object({
  role: z.string().optional(),
  pronouns: z.string().optional(),
  ageOrBirth: z.string().optional(),
  appearance: z.string().optional(),
  eyes: z.string().optional(),
  hair: z.string().optional(),
  build: z.string().optional(),
  clothing: z.string().optional(),
  distinguishingMarks: z.string().optional(),
  voice: z.string().optional(),
  mannerisms: z.string().optional(),
  personality: z.string().optional(),
  motivations: z.string().optional(),
  fears: z.string().optional(),
  backstory: z.string().optional(),
  secrets: z.string().optional(),
  arc: z.string().optional(),
});
export type CharacterFields = z.infer<typeof characterFieldsSchema>;

export const customFieldDefSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  entryType: storyBibleEntryTypeSchema,
  label: z.string().min(1).max(80),
  fieldType: z.enum(["text", "textarea", "number", "date", "select", "tags"]).default("text"),
  options: z.array(z.string()).default([]),
  sortOrder: z.number().int().nonnegative(),
});
export type CustomFieldDef = z.infer<typeof customFieldDefSchema>;

export const relationshipStatusSchema = z.enum(["alliance", "conflict", "neutral", "romantic", "familial", "mixed"]);

export const relationshipSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  fromEntryId: uuidSchema,
  toEntryId: uuidSchema,
  relationshipType: z.string().min(1).max(80), // e.g. "sibling", "rival", "mentor"
  direction: z.enum(["one_way", "mutual"]).default("mutual"),
  description: nullableText,
  status: relationshipStatusSchema.default("neutral"),
  changesOverTime: z.array(z.object({ when: z.string(), note: z.string() })).default([]),
  linkedSceneIds: z.array(uuidSchema).default([]),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Relationship = z.infer<typeof relationshipSchema>;

/** An AI-suggested or author-confirmed appearance of a story-bible entry in a scene. */
export const appearanceSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  entryId: uuidSchema,
  sceneId: uuidSchema,
  source: z.enum(["author", "ai_suggested"]).default("author"),
  confirmed: z.boolean().default(true),
  createdAt: timestamp,
});
export type Appearance = z.infer<typeof appearanceSchema>;

export const canonFactSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  entryId: uuidSchema.nullable().default(null),
  statement: z.string().min(1),
  sourceSceneId: uuidSchema.nullable().default(null),
  approvedByAuthor: z.boolean().default(false),
  createdBy: z.enum(["author", "ai"]).default("author"),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type CanonFact = z.infer<typeof canonFactSchema>;

// ---------------------------------------------------------------------------
// Storyboard
// ---------------------------------------------------------------------------

export const storyThreadSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  title: z.string().min(1).max(160),
  color: z.string().default("#C9A227"),
  status: z.enum(["open", "resolved", "abandoned_intentionally"]).default("open"),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type StoryThread = z.infer<typeof storyThreadSchema>;

export const storyboardCardSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  sceneId: uuidSchema.nullable().default(null), // null = planning-only card, not yet drafted
  title: z.string().min(1).max(200),
  summary: nullableText,
  column: z.string().default("Act 1"), // chapter/act/custom column label
  sortOrder: z.number().int().nonnegative(),
  povCharacterId: uuidSchema.nullable().default(null),
  charactersPresent: z.array(uuidSchema).default([]),
  locationId: uuidSchema.nullable().default(null),
  inWorldTime: nullableText,
  storyThreadId: uuidSchema.nullable().default(null),
  status: chapterStatusSchema.default("drafting"),
  revisionPriority: z.enum(["low", "medium", "high"]).nullable().default(null),
  colorLabel: nullableText,
  notes: nullableText,
  collapsed: z.boolean().default(false),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type StoryboardCard = z.infer<typeof storyboardCardSchema>;

export const structureOverlaySchema = z.enum(["three_act", "save_the_cat", "heros_journey", "custom", "none"]);

// ---------------------------------------------------------------------------
// Timeline (in-story) & Goals (real-world)
// ---------------------------------------------------------------------------

export const timelineEventSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  label: z.string().min(1).max(200),
  detail: nullableText,
  whenLabel: z.string().default(""), // freeform ("Day 1", "9 years ago")
  whenDate: timestamp.nullable().default(null), // exact date if the author supplies one
  fictionalCalendarId: uuidSchema.nullable().default(null),
  durationMinutes: z.number().int().nonnegative().nullable().default(null),
  locationId: uuidSchema.nullable().default(null),
  characterIds: z.array(uuidSchema).default([]),
  linkedSceneIds: z.array(uuidSchema).default([]),
  dependsOnEventIds: z.array(uuidSchema).default([]),
  plotlineTag: nullableText,
  sortOrder: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const goalSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  kind: z.enum(["daily", "weekly", "deadline"]),
  targetWords: z.number().int().nonnegative(),
  deadline: timestamp.nullable().default(null),
  restDays: z.array(z.number().int().min(0).max(6)).default([]), // 0=Sunday
  active: z.boolean().default(true),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Goal = z.infer<typeof goalSchema>;

export const writingSessionSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  userId: uuidSchema,
  startedAt: timestamp,
  endedAt: timestamp.nullable().default(null),
  wordsStart: z.number().int().nonnegative(),
  wordsEnd: z.number().int().nonnegative(),
  createdAt: timestamp,
});
export type WritingSession = z.infer<typeof writingSessionSchema>;

export const dailyProgressSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  userId: uuidSchema,
  date: z.string(), // YYYY-MM-DD in the author's local timezone at write time
  wordsWritten: z.number().int(), // signed: can be negative on heavy edit/cut days
  goalMet: z.boolean().default(false),
});
export type DailyProgress = z.infer<typeof dailyProgressSchema>;

// ---------------------------------------------------------------------------
// Versions, snapshots, recovery
// ---------------------------------------------------------------------------

export const documentRevisionSchema = z.object({
  id: uuidSchema,
  sceneId: uuidSchema,
  projectId: uuidSchema,
  revision: z.number().int().nonnegative(),
  content: z.unknown(),
  plainText: z.string(),
  wordCount: z.number().int().nonnegative(),
  createdAt: timestamp,
  createdBy: z.enum(["autosave", "manual_snapshot", "restore", "import"]).default("autosave"),
});
export type DocumentRevision = z.infer<typeof documentRevisionSchema>;

export const namedSnapshotSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  name: z.string().min(1).max(160),
  description: nullableText,
  createdAt: timestamp,
  /** Full project export payload captured at snapshot time (see ImportExport). */
  storagePath: z.string(),
});
export type NamedSnapshot = z.infer<typeof namedSnapshotSchema>;

export const deletedItemSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema.nullable(),
  userId: uuidSchema,
  entityType: z.string(),
  entityId: uuidSchema,
  snapshot: z.record(z.string(), z.unknown()),
  deletedAt: timestamp,
  purgeAfter: timestamp,
});
export type DeletedItem = z.infer<typeof deletedItemSchema>;

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export const aiModeSchema = z.enum([
  "ask",
  "consistency_check",
  "character_continuity",
  "timeline_analysis",
  "plot_thread_tracking",
  "dropped_thread_detection",
  "pacing_feedback",
  "structure_feedback",
  "scene_analysis",
  "brainstorming",
  "dialogue_alternatives",
  "revision_planning",
  "canon_extraction",
  "chapter_summary",
  "series_continuity",
]);
export type AIMode = z.infer<typeof aiModeSchema>;

export const aiConversationSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  userId: uuidSchema,
  scope: z.enum(["project", "series"]).default("project"),
  title: z.string().default("New conversation"),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type AIConversation = z.infer<typeof aiConversationSchema>;

export const citationSchema = z.object({
  kind: z.enum(["scene", "chapter", "story_bible_entry", "timeline_event", "canon_fact"]),
  id: uuidSchema,
  label: z.string(),
  excerpt: z.string().optional(),
});
export type Citation = z.infer<typeof citationSchema>;

export const aiMessageSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  role: z.enum(["user", "assistant"]),
  mode: aiModeSchema.default("ask"),
  content: z.string(),
  citations: z.array(citationSchema).default([]),
  contextSummary: z.array(z.string()).default([]), // human-readable "what context was used"
  isEstablishedVsInference: z.enum(["established", "inference", "not_established", "mixed"]).nullable().default(null),
  tokensInput: z.number().int().nonnegative().default(0),
  tokensOutput: z.number().int().nonnegative().default(0),
  createdAt: timestamp,
});
export type AIMessage = z.infer<typeof aiMessageSchema>;

export const findingTypeSchema = z.enum([
  "contradiction",
  "character_inconsistency",
  "timeline_conflict",
  "geographic_conflict",
  "dropped_thread",
  "unresolved_setup",
  "repeated_information",
  "pacing_observation",
  "possible_canon_fact",
]);

export const findingStatusSchema = z.enum(["open", "accepted", "dismissed", "snoozed", "converted_to_task", "marked_intentional"]);

export const aiFindingSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  findingType: findingTypeSchema,
  severity: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  title: z.string().min(1).max(200),
  explanation: z.string(),
  evidence: z.array(citationSchema).default([]),
  status: findingStatusSchema.default("open"),
  authorNote: nullableText,
  snoozedUntil: timestamp.nullable().default(null),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type AIFinding = z.infer<typeof aiFindingSchema>;

export const aiUsageSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  projectId: uuidSchema.nullable(),
  periodMonth: z.string(), // "2026-09"
  tokensInput: z.number().int().nonnegative(),
  tokensOutput: z.number().int().nonnegative(),
  estimatedCostUsdMicros: z.number().int().nonnegative(), // cost in millionths of a dollar, avoids float drift
  requestCount: z.number().int().nonnegative(),
});
export type AIUsage = z.infer<typeof aiUsageSchema>;

export const documentChunkSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  userId: uuidSchema,
  sourceType: z.enum(["scene", "chapter_summary", "story_bible_entry", "timeline_event", "canon_fact"]),
  sourceId: uuidSchema,
  chunkIndex: z.number().int().nonnegative().default(0),
  content: z.string(),
  updatedAt: timestamp,
});
export type DocumentChunk = z.infer<typeof documentChunkSchema>;

// ---------------------------------------------------------------------------
// Integrations, media, import/export
// ---------------------------------------------------------------------------

export const integrationProviderSchema = z.enum(["google_drive", "dropbox", "onedrive"]);

export const integrationConnectionSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  provider: integrationProviderSchema,
  status: z.enum(["connected", "disconnected", "error"]).default("disconnected"),
  scopes: z.array(z.string()).default([]),
  externalAccountLabel: nullableText, // e.g. connected email, never the token itself
  connectedAt: timestamp.nullable().default(null),
  lastError: nullableText,
});
export type IntegrationConnection = z.infer<typeof integrationConnectionSchema>;

export const mediaKindSchema = z.enum(["character_portrait", "location_concept", "cover_concept", "scene_previs_clip"]);

export const mediaAssetSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  kind: mediaKindSchema,
  linkedEntryId: uuidSchema.nullable().default(null),
  storagePath: nullableText,
  provider: z.string(), // e.g. "test", "stability", "runway" — pluggable
  promptUsed: z.string(),
  sourceContext: z.array(citationSchema).default([]),
  rightsNotice: z.string(),
  status: z.enum(["queued", "generating", "ready", "failed"]).default("queued"),
  errorMessage: nullableText,
  createdAt: timestamp,
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const generationJobSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  mediaAssetId: uuidSchema,
  provider: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]).default("queued"),
  startedAt: timestamp.nullable().default(null),
  finishedAt: timestamp.nullable().default(null),
  errorMessage: nullableText,
});
export type GenerationJob = z.infer<typeof generationJobSchema>;

export const exportFormatSchema = z.enum(["docx", "pdf", "epub", "txt", "markdown", "inkwell_backup"]);

export const exportJobSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  format: exportFormatSchema,
  preset: z.enum(["manuscript_submission", "review_copy", "paperback", "ebook", "custom"]).default("custom"),
  options: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["queued", "running", "succeeded", "failed"]).default("queued"),
  storagePath: nullableText,
  errorMessage: nullableText,
  createdAt: timestamp,
  finishedAt: timestamp.nullable().default(null),
});
export type ExportJob = z.infer<typeof exportJobSchema>;

export const importSourceSchema = z.enum(["docx", "markdown", "txt", "inkwell_backup"]);

export const importJobSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema.nullable(), // null until the author confirms target project (may be new)
  userId: uuidSchema,
  source: importSourceSchema,
  originalFilename: z.string(),
  status: z.enum(["pending_review", "importing", "succeeded", "failed", "partially_failed"]).default("pending_review"),
  detectedChapters: z.number().int().nonnegative().default(0),
  formatWarnings: z.array(z.string()).default([]),
  errorMessage: nullableText,
  createdAt: timestamp,
  finishedAt: timestamp.nullable().default(null),
});
export type ImportJob = z.infer<typeof importJobSchema>;

// ---------------------------------------------------------------------------
// Billing (architecture only — see docs/COSTS.md, no live payment integration)
// ---------------------------------------------------------------------------

export const planIdSchema = z.enum(["free", "author", "author_plus_ai"]);

export const entitlementSchema = z.object({
  userId: uuidSchema,
  planId: planIdSchema.default("free"),
  status: z.enum(["active", "trialing", "grace_period", "expired", "canceled"]).default("active"),
  aiMonthlyTokenAllowance: z.number().int().nonnegative(),
  renewsAt: timestamp.nullable().default(null),
  store: z.enum(["web_stripe", "apple_iap", "google_play"]).nullable().default(null),
  updatedAt: timestamp,
});
export type Entitlement = z.infer<typeof entitlementSchema>;

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const auditEventSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema.nullable(),
  action: z.string(), // e.g. "project.delete", "export.create", "integration.connect"
  targetType: z.string().nullable().default(null),
  targetId: uuidSchema.nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  ipHash: nullableText, // hashed, never raw IP
  createdAt: timestamp,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
