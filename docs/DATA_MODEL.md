# Inkwell — Data Model

Source of truth: `supabase/migrations/*.sql` (numbered, applied in order). This
document is a human-readable map of it — if the two disagree, the SQL wins.
Mirrored in TypeScript at `packages/shared-types/src/entities.ts`.

## Ownership chain

```
auth.users (Supabase-managed)
 └─ profiles (1:1)         └─ preferences (1:1)         └─ entitlements (1:1)
 └─ series (0..n)
 └─ projects (0..n)  -- may reference a series it owns (checked, see below)
     ├─ parts (0..n)
     ├─ chapters (0..n) → part (optional)
     │   └─ scenes (0..n) → chapter, optional pov_character/location/story_thread
     ├─ story_bible_entries (0..n: character/location/lore/object/organization/custom)
     │   ├─ custom_field_defs (per-project, per entry_type)
     │   ├─ relationships (entry ↔ entry)
     │   ├─ appearances (entry ↔ scene, author or ai_suggested)
     │   └─ canon_facts (approved_by_author gate before AI treats as ground truth)
     ├─ story_threads → storyboard_cards, scenes, timeline_events
     ├─ storyboard_cards (may or may not be linked to a drafted scene)
     ├─ timeline_events (in-world chronology; independent of writing_sessions)
     ├─ goals, writing_sessions, daily_progress (real-world writing progress)
     ├─ document_revisions (append-only, per scene), named_snapshots
     ├─ ai_conversations → ai_messages, ai_findings, ai_usage, document_chunks
     ├─ integration_connections (Drive/Dropbox/OneDrive — user-level, not project-level)
     ├─ media_assets → generation_jobs
     └─ export_jobs, import_jobs
 └─ deleted_items (soft-delete recovery bin, 30-day purge_after)
 └─ audit_events (security-sensitive action log)
```

## Root-of-trust functions

Nearly every RLS policy on a project-scoped table reduces to one call:

```sql
inkwell.user_owns_project(project_id)  -- exists(select 1 from projects where id = $1 and user_id = auth.uid())
inkwell.user_owns_series(series_id)    -- same shape, for series
```

Both are `LANGUAGE sql STABLE`, not `SECURITY DEFINER` — they run with the
caller's own RLS-filtered view of `projects`/`series`, so a cross-user probe
correctly resolves to `false` rather than leaking whether a row exists.
Cross-table "same project" invariants (a chapter's part belongs to the same
project, a scene's chapter belongs to the same project) use similar small
STABLE functions, because Postgres `CHECK` constraints cannot contain a bare
subquery — only a function call.

## Canonical manuscript content

`scenes.content` is a `jsonb` ProseMirror-shaped document (the same one the
editor's Tiptap instance produces) — this is what exports and future
migrations read. `scenes.plain_text` is a derived, indexed cache (word
counts, full-text search, AI retrieval) recomputed by the application layer
on every save; it is never hand-edited and never the source of truth.

## Full-text search

`scenes.search_vector` and `story_bible_entries.search_vector` are generated
`tsvector` columns with GIN indexes — used for in-app project search, and by
the AI assistant's context builder, which ranks matches against the
author's question with `ts_rank` via two `SECURITY INVOKER` SQL functions,
`search_scenes_ranked` and `search_story_bible_entries_ranked`
(`supabase/migrations/0011_ranked_search.sql`). Being `SECURITY INVOKER`
(the default — neither function declares `security definer`), RLS on
`scenes`/`story_bible_entries` applies to a call through these functions
exactly as it would to a plain `select`; proven in `tests/rls/run.ts`. AI
retrieval also separately goes through `document_chunks`, a distinct
indexed table carrying `project_id` **and** `user_id` on every row (defense
in depth: even if application code forgets one filter, RLS still enforces
the other).

## Server-only write paths

Some tables intentionally have no `INSERT`/`UPDATE` policy for the
`authenticated` role at all — they are written exclusively by Edge Functions
using the Supabase service-role key, which bypasses RLS:

- `ai_messages`, `ai_findings` (written after a verified model call)
- `ai_usage` (so a client can't erase or forge its own usage/allowance)
- `ai_rate_limit_events` (the AI assistant's sliding-window rate limiter — no policies at all, so a
  client can't read its own history or clear it to dodge the limit; see `docs/AI_ARCHITECTURE.md`)
- `document_chunks` (written during (re)indexing)
- `entitlements` (a client cannot grant itself a paid plan — proven in `tests/rls/run.ts`)
- `generation_jobs` (written by the media-generate function)

`document_revisions` is append-only for the client too (`INSERT` yes,
`UPDATE`/`DELETE` no) — it is the audit trail behind version history and
crash recovery, and even the owning author can't rewrite it.

## What's intentionally NOT in Postgres

- OAuth tokens for Drive/Dropbox/OneDrive — `integration_connections` stores
  connection _status_ and a human-readable label only; real tokens belong in
  Supabase Vault or the Edge Function's own secret store (see
  `docs/SECURITY.md`).
- The Anthropic API key and system-prompt internals — configuration only
  (`docs/AI_ARCHITECTURE.md`), never a table.
