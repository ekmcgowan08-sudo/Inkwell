# Inkwell — Decisions Log

Running log of material decisions made autonomously, per the minimum-touch protocol. Newest first.

---

### 2026-09-09 — Playwright browser launch pinned to the pre-installed Chromium path
The sandbox has no writable path for Playwright's own browser download and ships a pre-installed Chromium at `/opt/pw-browsers/chromium`. `tests/e2e/playwright.config.ts` hardcodes `launchOptions.executablePath` to that path (overridable via `PLAYWRIGHT_CHROMIUM_PATH`). On a normal dev machine or CI runner, unset that env var and let Playwright manage its own browser binaries instead — the pinned path is a sandbox accommodation, not a production requirement.

### 2026-09-09 — RLS test suite supports a local-Postgres fallback backend
`tests/rls/run.ts` defaults to spinning up a disposable Docker Postgres container (works in CI and normal dev machines). This sandbox has a Docker *client* but no running daemon, so a `RLS_TEST_BACKEND=local` mode was added that uses the system's already-installed `postgresql` service via `pg_ctlcluster`/`psql` against a throwaway database instead. Both paths run the exact same migrations and assertions — only container orchestration differs. All 13 isolation tests pass under the local backend; verify the Docker path too before trusting it blindly in a fresh CI environment.

### 2026-09-09 — Local-only mode as the zero-config default
Rather than requiring Supabase credentials before the app does anything, `apps/web` detects an unconfigured `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and runs fully offline: a stable pseudo-user id, IndexedDB-only persistence (Dexie), and the AI assistant backed by the deterministic test provider instead of a real Anthropic call. This satisfies the brief's "documented mock mode when production credentials are unavailable" requirement and made it possible to build and Playwright-verify the entire golden path (dashboard → write → story bible → storyboard → timeline → AI → findings → export) with zero backend running. Trade-off: local-only mode is genuinely single-device — there is no sync, by design, and the UI says so.

### 2026-09-09 — No Prisma; hand-written SQL migrations instead
The historical handoff doc suggested Prisma. Supabase's own CLI migration model (plain numbered `.sql` files) was used instead, because RLS policies are the actual security boundary here and need to live next to (and be reviewed alongside) the `CREATE TABLE` statements — an ORM layer on top would just be indirection between the tables and the policies protecting them, with no corresponding benefit since there's a single Postgres database, not a multi-backend story.

### 2026-09-09 — CHECK constraints call small STABLE SQL functions instead of inline subqueries
Postgres forbids a bare `exists (select ...)` inside a `CHECK` constraint, but allows calling a function that does the same query. Every cross-table "same project" invariant (a chapter's part belongs to the same project, a scene's chapter belongs to the same project, a project's series belongs to the same user) is implemented this way (`inkwell.part_belongs_to_project`, `inkwell.chapter_belongs_to_project`, `inkwell.user_owns_series`). Discovered by the RLS test suite actually failing on this exact issue on first run — see `tests/rls/run.ts` history.

### 2026-09-09 — Architecture: Tauri 2 for desktop, Expo/React Native for mobile
Full rationale in `docs/ARCHITECTURE.md`. Short version: Tauri 2 mobile's webview-based text editing, OAuth deep-linking, and in-app-purchase ecosystem are all materially less mature than Expo's for exactly the features this product needs (a serious long-form text editor, Supabase Auth's PKCE redirect flow, Apple/Google billing) — this is the documented fallback shape the brief explicitly allowed for.

### 2026-09-09 — AI: bracket-citation parsing over a second model call
Rather than asking the model to return structured JSON citations (extra complexity, another failure mode) or trusting free-text citations, the system prompt asks the model to reference context using bracketed ids already present in the context bundle it was given (e.g. `[chapter:uuid]`), and the client/edge function parses those out of the plain response text into structured `Citation` objects. Cheap, deterministic, and testable without a model call (see the deterministic test provider path).

### 2026-09-09 — Word-goal "words written today" uses a lazily-captured daily baseline, not a running total column
Persisting a `words_written` delta per day (rather than a cumulative total) needs a baseline to diff against. Rather than a server-computed "total as of local midnight" (needs a scheduled job and timezone handling server-side), the client captures "total word count the first time this project is opened today" into a local-only Dexie table (`dailyBaselines`) and diffs future saves against it. Documented limitation in `docs/EDITOR_AND_AUTOSAVE.md`: if a device is opened for the first time on a given day only after some writing already happened elsewhere that day, that first-open baseline is late and under-counts. Acceptable for v1; revisit if it proves confusing in practice.

### 2026-09-09 — Findings: a real deterministic rule-based scanner ships now; the model-backed scanner is designed but not wired to a background job
`runLocalConsistencyScan` (duplicate story-bible names, orphaned open story threads, same-day/different-location timeline conflicts) is genuinely rule-based, not a placeholder — it runs with zero AI cost and works in local-only mode. The AI Assistant's `consistency_check` mode reasons over prose the rules can't, but nothing yet automatically converts an AI Assistant answer into a persisted `ai_findings` row in the background — that would need a scheduled Edge Function job, out of scope for this pass. Documented as a gap in `docs/IMPLEMENTATION_STATUS.md`, not silently omitted.

### 2026-09-09 — Export formats: DOCX, TXT, Markdown, and Inkwell JSON backup ship now; EPUB does not; PDF is via the browser print dialog
`docx` (an actively maintained, browser-compatible library) generates real `.docx` files client-side. "Print-ready PDF" is implemented as a dedicated print stylesheet plus `window.print()` rather than a PDF-generation library — legitimate and testable, but requires the user's own "Save as PDF" step in their browser's print dialog rather than producing a `.pdf` file directly. EPUB was not implemented in this pass (a from-scratch EPUB is a non-trivial zip+XML structure); see `docs/IMPORT_EXPORT.md` for the concrete follow-up plan. No fake buttons exist for any of these — every export in the UI produces a real file or does not exist yet.
