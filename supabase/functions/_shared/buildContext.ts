import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextBundle } from "@inkwell/ai-contracts";

const MAX_CHAPTERS = 30;
const MAX_RETRIEVED_SCENES = 12;
const MAX_STORY_BIBLE_ENTRIES = 40;
const MAX_TIMELINE_EVENTS = 20;
const RETRIEVED_SCENE_CHARS = 800;

/**
 * Builds the same bounded context shape the web app's local-only mode
 * builds from IndexedDB (apps/web/src/lib/aiLocalContext.ts), but reads
 * from Postgres through a client authenticated AS THE CALLER — every query
 * here is subject to the same RLS policies proven in tests/rls/run.ts, so
 * this function structurally cannot pull another user's or another
 * project's content into the prompt. See docs/AI_ARCHITECTURE.md.
 *
 * Retrieval today is a bounded recency sample, not yet ranked against the
 * question via full-text search — `scenes.search_vector` and
 * `story_bible_entries.search_vector` exist and are indexed for exactly
 * this upgrade. Documented as a known simplification in
 * docs/IMPLEMENTATION_STATUS.md, not silently shipped as "smart retrieval."
 */
export async function buildContextFromSupabase(
  userClient: SupabaseClient,
  projectId: string,
  projectTitle: string,
  conversationId: string | null,
): Promise<ContextBundle> {
  const [chaptersRes, scenesRes, entriesRes, canonRes, threadsRes, eventsRes, messagesRes] = await Promise.all([
    userClient
      .from("chapters")
      .select("id, title, summary")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("sort_order")
      .limit(MAX_CHAPTERS),
    userClient
      .from("scenes")
      .select("id, chapter_id, title, plain_text, updated_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .not("plain_text", "eq", "")
      .order("updated_at", { ascending: false })
      .limit(MAX_RETRIEVED_SCENES),
    userClient
      .from("story_bible_entries")
      .select("id, name, entry_type, summary, fields")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .limit(MAX_STORY_BIBLE_ENTRIES),
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

  for (const [name, res] of Object.entries({ chaptersRes, scenesRes, entriesRes, canonRes, threadsRes, eventsRes, messagesRes })) {
    if (res.error) throw new Error(`Failed to load ${name} for AI context: ${res.error.message}`);
  }

  const chapters = chaptersRes.data ?? [];
  const chapterTitleById = new Map(chapters.map((c) => [c.id as string, c.title as string]));

  return {
    projectTitle,
    chapterSummaries: chapters.map((c) => ({
      chapterId: c.id as string,
      title: c.title as string,
      summary: (c.summary as string | null) ?? "(no chapter summary yet)",
    })),
    retrievedChunks: (scenesRes.data ?? []).map((s) => ({
      sourceType: "scene",
      sourceId: s.id as string,
      label: chapterTitleById.get(s.chapter_id as string) ?? (s.title as string),
      content: ((s.plain_text as string) ?? "").slice(0, RETRIEVED_SCENE_CHARS),
    })),
    approvedCanonFacts: (canonRes.data ?? []).map((f) => ({ id: f.id as string, statement: f.statement as string })),
    storyBibleDigest: (entriesRes.data ?? []).map((e) => ({
      id: e.id as string,
      name: e.name as string,
      entryType: e.entry_type as string,
      digest: (e.summary as string | null) ?? JSON.stringify(e.fields ?? {}).slice(0, 200),
    })),
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
