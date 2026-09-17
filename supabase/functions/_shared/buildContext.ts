import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_SERIES_BOOKS,
  MAX_SERIES_CANON_FACTS_PER_BOOK,
  MAX_SERIES_CHAPTERS_PER_BOOK,
  MAX_SERIES_STORY_BIBLE_PER_BOOK,
  type ContextBundle,
} from "@inkwell/ai-contracts";

const MAX_CHAPTERS = 30;
const MAX_RETRIEVED_SCENES = 12;
const MAX_STORY_BIBLE_ENTRIES = 40;
const MAX_TIMELINE_EVENTS = 20;
const RETRIEVED_SCENE_CHARS = 800;

type RankedScene = { id: string; chapter_id: string; title: string; plain_text: string; updated_at: string };
type RankedEntry = { id: string; name: string; entry_type: string; summary: string | null; fields: unknown };

/**
 * Scenes relevant to the author's question, ranked by `ts_rank` against
 * `scenes.search_vector` via the `search_scenes_ranked` SQL function
 * (supabase/migrations/0011_ranked_search.sql — SECURITY INVOKER, so RLS
 * applies exactly as it would to a plain select). Falls back to the old
 * recency-bounded sample when the question doesn't share any keywords with
 * anything written yet (a generic "how's it going?" question, or a
 * brand-new project) — an empty ranked result shouldn't mean an empty
 * context bundle if there's *any* manuscript to summarize.
 */
async function retrieveRankedScenes(userClient: SupabaseClient, projectId: string, question: string): Promise<RankedScene[]> {
  const trimmed = question.trim();
  if (trimmed) {
    const { data, error } = await userClient.rpc("search_scenes_ranked", {
      p_project_id: projectId,
      p_query: trimmed,
      p_limit: MAX_RETRIEVED_SCENES,
    });
    if (error) throw new Error(`Ranked scene search failed: ${error.message}`);
    if (data && (data as RankedScene[]).length > 0) return data as RankedScene[];
  }
  const { data, error } = await userClient
    .from("scenes")
    .select("id, chapter_id, title, plain_text, updated_at")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .not("plain_text", "eq", "")
    .order("updated_at", { ascending: false })
    .limit(MAX_RETRIEVED_SCENES);
  if (error) throw new Error(`Failed to load scenes for AI context: ${error.message}`);
  return (data as RankedScene[]) ?? [];
}

/** Same ranked-with-fallback approach as `retrieveRankedScenes`, for story bible entries. */
async function retrieveRankedStoryBibleEntries(userClient: SupabaseClient, projectId: string, question: string): Promise<RankedEntry[]> {
  const trimmed = question.trim();
  if (trimmed) {
    const { data, error } = await userClient.rpc("search_story_bible_entries_ranked", {
      p_project_id: projectId,
      p_query: trimmed,
      p_limit: MAX_STORY_BIBLE_ENTRIES,
    });
    if (error) throw new Error(`Ranked story bible search failed: ${error.message}`);
    if (data && (data as RankedEntry[]).length > 0) return data as RankedEntry[];
  }
  const { data, error } = await userClient
    .from("story_bible_entries")
    .select("id, name, entry_type, summary, fields")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .limit(MAX_STORY_BIBLE_ENTRIES);
  if (error) throw new Error(`Failed to load story bible entries for AI context: ${error.message}`);
  return (data as RankedEntry[]) ?? [];
}

type SeriesContext = {
  chapterSummaries: ContextBundle["chapterSummaries"];
  approvedCanonFacts: ContextBundle["approvedCanonFacts"];
  storyBibleDigest: ContextBundle["storyBibleDigest"];
};

/**
 * Explicit opt-in only (`AssistantRequest.seriesScope`) — never pulled in unless the author asked
 * for it AND the project actually belongs to a series. For each other book in the series (RLS
 * still applies: this can only ever see the caller's own projects), pulls a small, clearly
 * labeled slice of chapter summaries, approved canon facts, and story bible entries — each
 * prefixed with that book's title (`"[Book Two] ..."`) so the model — and the author reading the
 * context summary — can tell which book a fact came from. Separately and more tightly bounded
 * than the single-project budget above, since this can multiply across several sibling books.
 */
async function fetchSeriesContext(userClient: SupabaseClient, seriesId: string, excludeProjectId: string): Promise<SeriesContext> {
  const { data: siblings, error: siblingsError } = await userClient
    .from("projects")
    .select("id, title")
    .eq("series_id", seriesId)
    .neq("id", excludeProjectId)
    .eq("status", "active")
    .order("series_order")
    .limit(MAX_SERIES_BOOKS);
  if (siblingsError) throw new Error(`Failed to load series books for AI context: ${siblingsError.message}`);
  if (!siblings || siblings.length === 0) return { chapterSummaries: [], approvedCanonFacts: [], storyBibleDigest: [] };

  const perBook = await Promise.all(
    siblings.map(async (book) => {
      const [chaptersRes, canonRes, entriesRes] = await Promise.all([
        userClient
          .from("chapters")
          .select("id, title, summary")
          .eq("project_id", book.id)
          .is("deleted_at", null)
          .order("sort_order")
          .limit(MAX_SERIES_CHAPTERS_PER_BOOK),
        userClient
          .from("canon_facts")
          .select("id, statement")
          .eq("project_id", book.id)
          .eq("approved_by_author", true)
          .limit(MAX_SERIES_CANON_FACTS_PER_BOOK),
        userClient
          .from("story_bible_entries")
          .select("id, name, entry_type, summary, fields")
          .eq("project_id", book.id)
          .is("deleted_at", null)
          .limit(MAX_SERIES_STORY_BIBLE_PER_BOOK),
      ]);
      for (const [name, res] of Object.entries({ chaptersRes, canonRes, entriesRes })) {
        if (res.error) throw new Error(`Failed to load series ${name} for AI context: ${res.error.message}`);
      }
      const prefix = `[${book.title as string}] `;
      return {
        chapterSummaries: (chaptersRes.data ?? []).map((c) => ({
          chapterId: c.id as string,
          title: `${prefix}${c.title as string}`,
          summary: (c.summary as string | null) ?? "(no chapter summary yet)",
        })),
        approvedCanonFacts: (canonRes.data ?? []).map((f) => ({ id: f.id as string, statement: `${prefix}${f.statement as string}` })),
        storyBibleDigest: (entriesRes.data ?? []).map((e) => ({
          id: e.id as string,
          name: `${prefix}${e.name as string}`,
          entryType: e.entry_type as string,
          digest: (e.summary as string | null) ?? JSON.stringify(e.fields ?? {}).slice(0, 200),
        })),
      };
    }),
  );

  return {
    chapterSummaries: perBook.flatMap((b) => b.chapterSummaries),
    approvedCanonFacts: perBook.flatMap((b) => b.approvedCanonFacts),
    storyBibleDigest: perBook.flatMap((b) => b.storyBibleDigest),
  };
}

/**
 * Builds the same bounded context shape the web app's local-only mode
 * builds from IndexedDB (apps/web/src/lib/aiLocalContext.ts), but reads
 * from Postgres through a client authenticated AS THE CALLER — every query
 * here is subject to the same RLS policies proven in tests/rls/run.ts, so
 * this function structurally cannot pull another user's or another
 * project's content into the prompt. See docs/AI_ARCHITECTURE.md.
 *
 * Scene and story-bible retrieval is ranked against the author's question
 * via full-text search (`ts_rank` on the generated `search_vector` columns),
 * not just a recency sample — see `retrieveRankedScenes` /
 * `retrieveRankedStoryBibleEntries` above.
 *
 * `series.seriesScope` opts into also including a bounded, book-labeled slice of the other books
 * in the same series — see `fetchSeriesContext` above. Off by default; the assistant never reads
 * outside the active project unless the author explicitly asks.
 */
export async function buildContextFromSupabase(
  userClient: SupabaseClient,
  projectId: string,
  projectTitle: string,
  conversationId: string | null,
  question: string,
  series: { seriesId: string | null; seriesScope: boolean } = { seriesId: null, seriesScope: false },
): Promise<ContextBundle> {
  const [chaptersRes, scenesRes, entriesRes, canonRes, threadsRes, eventsRes, messagesRes] = await Promise.all([
    userClient
      .from("chapters")
      .select("id, title, summary")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("sort_order")
      .limit(MAX_CHAPTERS),
    retrieveRankedScenes(userClient, projectId, question),
    retrieveRankedStoryBibleEntries(userClient, projectId, question),
    userClient.from("canon_facts").select("id, statement").eq("project_id", projectId).eq("approved_by_author", true).limit(30),
    userClient.from("story_threads").select("id, title").eq("project_id", projectId).eq("status", "open").limit(20),
    userClient
      .from("timeline_events")
      .select("id, label, when_label")
      .eq("project_id", projectId)
      .order("sort_order")
      .limit(MAX_TIMELINE_EVENTS),
    conversationId
      ? userClient
          .from("ai_messages")
          .select("role, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const [name, res] of Object.entries({ chaptersRes, canonRes, threadsRes, eventsRes, messagesRes })) {
    if (res.error) throw new Error(`Failed to load ${name} for AI context: ${res.error.message}`);
  }

  const chapters = chaptersRes.data ?? [];
  const chapterTitleById = new Map(chapters.map((c) => [c.id as string, c.title as string]));

  const seriesContext =
    series.seriesScope && series.seriesId
      ? await fetchSeriesContext(userClient, series.seriesId, projectId)
      : { chapterSummaries: [], approvedCanonFacts: [], storyBibleDigest: [] };

  return {
    projectTitle,
    chapterSummaries: [
      ...chapters.map((c) => ({
        chapterId: c.id as string,
        title: c.title as string,
        summary: (c.summary as string | null) ?? "(no chapter summary yet)",
      })),
      ...seriesContext.chapterSummaries,
    ],
    retrievedChunks: scenesRes.map((s) => ({
      sourceType: "scene",
      sourceId: s.id,
      label: chapterTitleById.get(s.chapter_id) ?? s.title,
      content: (s.plain_text ?? "").slice(0, RETRIEVED_SCENE_CHARS),
    })),
    approvedCanonFacts: [
      ...(canonRes.data ?? []).map((f) => ({ id: f.id as string, statement: f.statement as string })),
      ...seriesContext.approvedCanonFacts,
    ],
    storyBibleDigest: [
      ...entriesRes.map((e) => ({
        id: e.id,
        name: e.name,
        entryType: e.entry_type,
        digest: e.summary ?? JSON.stringify(e.fields ?? {}).slice(0, 200),
      })),
      ...seriesContext.storyBibleDigest,
    ],
    openThreads: (threadsRes.data ?? []).map((t) => ({ id: t.id as string, title: t.title as string })),
    recentTimelineEvents: (eventsRes.data ?? []).map((e) => ({
      id: e.id as string,
      label: e.label as string,
      whenLabel: e.when_label as string,
    })),
    recentMessages: (messagesRes.data ?? [])
      .slice()
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string })),
  };
}
