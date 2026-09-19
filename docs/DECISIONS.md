# Inkwell — Decisions Log

Running log of material decisions made autonomously, per the minimum-touch protocol. Newest first.

---

### 2026-09-19 — Found another false doc claim: `account-delete` had no unit tests despite the doc saying it did
`docs/IMPLEMENTATION_STATUS.md` claimed "Deno Edge Function typecheck + unit tests (`ai-assistant`,
`account-delete`) — real, passing," but only `ai-assistant/index.test.ts` existed; `account-delete` had zero
test coverage. Also found the CI workflow's Edge Function test step (`.github/workflows/ci.yml`) only ran
`ai-assistant/index.test.ts` and two `_shared` tests — real coverage gaps that a green CI badge would have
hidden.

Rather than writing a token test just to make the doc line true, found real value to extract:
`account-delete/index.ts` and `ai-assistant/index.ts` both had the exact same `AssistantErrorCode` → HTTP
status mapping object copy-pasted verbatim in their catch blocks. Extracted it into
`supabase/functions/_shared/errors.ts` (`statusForErrorCode`), now imported by both instead of duplicated, and
added `_shared/errors.test.ts` — including a test that iterates `errorCodeSchema.options` so a new error code
added without a status mapping fails loudly instead of falling through to `undefined`. Updated the CI workflow
to run it. `account-delete`'s actual request-handling flow (auth → audit insert → `deleteUser`) still isn't
unit-tested — it isn't dependency-injected for it, and there isn't much pure logic left to extract from three
sequential calls — so the doc now says that precisely rather than claiming more than what's true.

### 2026-09-18 — Preferences sync: localStorage stays authoritative for paint timing, Supabase is best-effort reconciliation
Third and (for this pass) last hit from the unused-table audit: `preferences` (theme, reduced_motion) has
existed since early in the project specifically for cross-device sync, but `ThemeProvider` only ever touched
`localStorage`. `ThemeProvider` sits outside `AuthProvider` in `main.tsx` deliberately, so theme applies
before auth resolves and there's no flash of the wrong theme on load — that ordering can't change without
reintroducing that flash, so `ThemeProvider` can't consume `useAuth()`'s context. Instead
`loadRemotePreferences`/`saveRemotePreferences` call `getSupabase()` and `isLocalOnlyMode` directly, the same
standalone utilities every non-React repo file already uses, sidestepping the provider-order constraint
entirely rather than restructuring the tree.

Sequence on mount: paint immediately from `localStorage` (unchanged, zero added latency), then fetch the
remote row in the background and reconcile if it differs — a second, later state update, same trade-off every
other "local-first, then sync" flow in this app already makes (e.g. the daily-progress baseline, the sync
queue). On every `setTheme`/`setReducedMotion` call, write `localStorage` synchronously as before and push to
Supabase fire-and-forget alongside it. Local-only mode short-circuits both functions immediately — no account,
nothing to sync.

### 2026-09-18 — Parts: assignment via a select dropdown, not drag-and-drop across groups
Continuing the "unused Dexie table" audit that caught `writing_sessions`, `parts` was the same shape of gap,
just silent rather than documented: schema, migration, RLS policies, and a Zod type existed since early in the
project (`chapterSchema.partId` is nullable — an optional grouping, per `PRODUCT.md`'s `parts → chapters →
scenes` hierarchy), but nothing in `apps/web` ever created, read, or displayed a part. Unlike
`writing_sessions`, this one wasn't even flagged in `docs/IMPLEMENTATION_STATUS.md` — it just wasn't there.

Implemented parts management (create/rename/reorder/delete) and a per-chapter assignment control. The one
deliberate scope cut: chapter-to-part assignment is a `<select>` dropdown (mirroring the storyboard's
column-select pattern for moving a card between columns without dragging), not drag-and-drop across visual
part groups. The existing chapter reordering already uses a single flat `dnd-kit` `SortableContext` over the
whole chapter list; making drag-and-drop work across visually-grouped part sections would mean multiple
`SortableContext`s with cross-container drop handling — a materially bigger rewrite of already-working,
tested reordering code for a convenience feature (moving a chapter into a part) that a plain select already
serves correctly. If part-grouped visual sections with drag-and-drop become a real ask, that's a separate,
larger piece of work, not a follow-up to this fix.

Deleting a part ungroups its chapters (`partId` → `null`) rather than deleting them, matching the "never
overwrite/destroy content silently" spirit — a part is an organizational label, not a container. No
`deletedItems` recovery-bin entry for a deleted part itself (unlike chapters/story-bible entries), following
the same precedent as `deleteRelationship`: lightweight structural/organizational rows get a plain delete, not
a 30-day recovery window, reserving that for actual authored content.

Verified with a real Playwright browser run (not part of the committed suite): created a part, assigned a
chapter to it via the select, reloaded the page, and confirmed the assignment survived — proving it actually
persisted to IndexedDB and wasn't just React state.

### 2026-09-18 — Found and fixed another real false claim: `writing_sessions` was documented as "real persisted" but was dead code
While closing out the appearances gap, went looking for the same failure pattern elsewhere: a Dexie table
declared in `db.ts` with zero reads/writes anywhere else in `apps/web`. Found `writingSessions` — and
`docs/IMPLEMENTATION_STATUS.md` Phase 6 had it listed under "Real persisted daily writing-progress and
streaks (`daily_progress`, `writing_sessions`) ... **Verified: Browser**." That verification claim was false:
the table had a schema, RLS policies (isolation-tested in the earlier RLS audit this session), and a Zod
type, but no Dexie table, no repo, and nothing in the UI ever touched it. This is the third instance this
session of the same shape of bug — UI copy or doc claims ahead of what the code actually does (rest-days
streak math, appearances, now this) — worth calling out as a pattern: an unused schema table with a
plausible-sounding doc line next to it is a cheap, repeatable thing to audit for.

Implemented it for real: `startWritingSession`/`endWritingSession`
(`apps/web/src/lib/repos/writingSessions.ts`) track one row per continuous editing visit, separate from the
daily word-count baseline (`daily_progress` is per-calendar-day; a session is per-visit — "you wrote for 22
minutes and added 340 words just now"). Start is lazy, wired into `ManuscriptPage`'s existing `onUpdate`
handler — a session begins on the first real edit, not merely on opening the manuscript page, so browsing
without writing never creates an empty session. End is best-effort: `visibilitychange` to `hidden` (tab
switched away or closed) or component unmount (navigating to another page within the app), whichever comes
first. Deliberately not tied to scene/chapter switches within the same visit — those stay part of the same
continuous session, which matches how a real writing session feels.

One limitation accepted rather than engineered around: a hard crash, force-quit, or killed tab with no
`visibilitychange` event leaves a session with `endedAt: null` forever. A heartbeat-write scheme (periodically
touching the row to prove liveness) would close that gap but directly conflicts with the "never wire a DB
write to every keystroke" rule in spirit — trading a cosmetic annoyance (one orphaned row, never shown since
`listRecentSessions` filters to `endedAt !== null`) for exactly the write-amplification pattern that rule
exists to prevent isn't a good trade. Documented in the code and here rather than silently shipped as solved.

A small "Recent Sessions" card on the Timeline & Goals page (last 5, date/duration/word delta) is the only UI
surface for now — no session-editing, no deletion, no pace analytics. Verified with a real Playwright browser
run (not part of the committed suite): wrote a scene, navigated to Timeline, confirmed a session with a
duration and a "+N words" delta actually appeared.

### 2026-09-18 — Suggested appearances: a rule-based scan instead of the originally-envisioned AI job
`docs/IMPLEMENTATION_STATUS.md` had flagged "AI-suggested appearances" as not built, framed as needing "an AI
Assistant `scene_analysis`-adjacent job." Building that would mean either a background job (rejected outright —
see the "findings needs a scheduled job" reversal above, and the standing "no provider request without user
initiation" rule) or spending AI credits on every manuscript edit just to notice a character's name showed up
in a scene. Neither was warranted: whether a story-bible entry's name appears in a scene's text is a plain
string-matching question, not a reasoning one — no model call adds anything a `RegExp` doesn't already answer.

Implemented `detectAppearances` (`apps/web/src/lib/repos/appearances.ts`) as a deterministic, local,
zero-cost scan matching every entry's name/aliases (whole-word, case-insensitive, names under 3 characters
skipped to cut noise like matching "Jo" inside "enjoy") against every scene's plain text, creating an
unconfirmed `ai_suggested` appearance for any (entry, scene) pair not already recorded — mirrors
`findingsScanner.ts`'s `runLocalConsistencyScan` almost exactly, including being explicitly user-triggered (a
"Scan manuscript for appearances" button on the Story Bible page) rather than automatic. This also meant
wiring the `appearances` table into the client for the first time — it had a schema, RLS policies, and a
Zod type, but no Dexie table, no repo, and no UI existed anywhere before this.

One real gap accepted rather than solved: "dismissing" a suggestion deletes the row, because the schema's
`confirmed: boolean` has no third "rejected, don't resuggest" state — a dismissed mention can resurface on the
next scan. Fixing that would mean a schema change (a new migration, RLS re-verification, a new enum value) for
a minor annoyance in an explicitly opt-in, re-runnable scan; not worth it here. Documented in both the code
comment and `docs/IMPLEMENTATION_STATUS.md` rather than silently shipped as if solved.

Verified with a real Playwright browser run (not part of the committed suite — a one-off manual check for this
change): wrote a scene mentioning a name, created a matching character entry, ran the scan, confirmed the
suggestion appeared and moved into "confirmed" after clicking Confirm. Also unit-tested (`appearances.test.ts`)
and confirmed the existing smoke/accessibility Playwright specs still pass with the new Story Bible UI.

### 2026-09-18 — Built the real Terms/Privacy acceptance flow; sourced the document text from docs/legal/ directly rather than copying it
`docs/IMPLEMENTATION_STATUS.md` had flagged this honestly: the schema had `profiles.terms_accepted_at`/
`privacy_accepted_at`, but signup only showed a plain-text "by continuing you agree..." sentence that wrote
nothing anywhere — an aspirational disclaimer, not a real acceptance flow. Built `LegalAcceptancePage`
(`/legal/accept`): two scrollable panes with the actual Terms of Service and Privacy Policy text, two explicit
checkboxes (not a single "I agree to both"), and a `profiles` update on accept. New cloud signups route
through it before onboarding; `RequireAuth` also gates already-authenticated cloud users who haven't accepted
(covers an account created before this shipped), preserving where they were headed via router state so they
land back there after accepting rather than always at the dashboard.

The document text is imported straight from `docs/legal/TERMS_OF_SERVICE.md`/`PRIVACY_POLICY.md` via Vite's
`?raw` query (`apps/web/src/features/auth/LegalAcceptancePage.tsx`), not copy-pasted into the client — the
alternative (duplicating the text into a TS string or a second copy under `apps/web/public/`) would drift from
the source of truth the moment either changed. Confirmed both that Rollup bundles it (grepped the production
`dist/` output for the draft text) and that Vite's dev server actually serves a file living outside
`apps/web`'s own directory (`/@fs/...` resolution, not blocked by `server.fs.allow` — this is a pnpm workspace,
so Vite auto-detects the monorepo root and allows it). This only applies to cloud accounts: local-only mode
has no `profiles` row and nothing leaves the browser, so it's treated as always-accepted, matching the same
`isLocalOnly` short-circuit used everywhere else cloud-only behavior is gated.

Deliberately did not touch the "drafts pending professional legal review" framing already on these documents
— see `docs/OWNER_ACTIONS_REQUIRED.md` for that separate, owner-specific gate. Building the acceptance *flow*
and getting the drafts *legally reviewed* are two different gaps; this closes only the first one, and the
acceptance page says so prominently rather than implying the documents are final.

### 2026-09-18 — Found and fixed a real CLAUDE.md hard-rule violation: most tables had RLS policies but no isolation test
CLAUDE.md is explicit: "every project-scoped table needs RLS, and it needs to actually be tested in
`tests/rls/run.ts`, not just asserted in a comment." Started by auditing `public.appearances` (migration
`0005_story_bible.sql`) after noticing it had four real policies (`app_select`/`app_insert`/`app_update`/
`app_delete`) but zero coverage in `tests/rls/run.ts`. That turned into a full audit: diffing every
`create table public.*` across `supabase/migrations/*.sql` against every table name actually referenced in
`tests/rls/run.ts` turned up 17 more tables in the same state — real policies, declared and correct, never
once exercised by a test: `canon_facts`, `custom_field_defs`, `daily_progress`, `document_revisions`,
`export_jobs`, `generation_jobs`, `goals`, `import_jobs`, `integration_connections`, `media_assets`,
`named_snapshots`, `parts`, `relationships`, `story_threads`, `storyboard_cards`, `timeline_events`,
`writing_sessions`, plus the server-only-write table `ai_usage`.

Rather than hand-writing ~20 near-identical 20-line tests, added a `testTableIsolation` helper that covers the
mechanical majority — insert as user A, then prove user B gets 0 rows on select/update/delete and user A's row
is unchanged — parameterized per table by its insert columns/values and which of update/delete it actually
grants. The two server-only-write tables (`ai_usage`, `generation_jobs`) needed the different shape already
established for `ai_messages`/`ai_findings`/`ai_rate_limit_events`: client insert rejected, service-role insert
succeeds, only the owning user (not other users) can read it back. Every table that exists in the schema now
has a real cross-user isolation test — this was purely closing a test-coverage gap, no policy or schema
changed, since every policy found was already correct; it was just unproven. 53/53 RLS tests now pass (was 16
at the start of this audit); stale counts elsewhere in `docs/IMPLEMENTATION_STATUS.md` were corrected to match.

### 2026-09-09 — Playwright browser launch pinned to the pre-installed Chromium path
The sandbox has no writable path for Playwright's own browser download and ships a pre-installed Chromium at `/opt/pw-browsers/chromium`. `tests/e2e/playwright.config.ts` hardcodes `launchOptions.executablePath` to that path (overridable via `PLAYWRIGHT_CHROMIUM_PATH`). On a normal dev machine or CI runner, unset that env var and let Playwright manage its own browser binaries instead — the pinned path is a sandbox accommodation, not a production requirement.

### 2026-09-09 — RLS test suite supports a local-Postgres fallback backend
`tests/rls/run.ts` defaults to spinning up a disposable Docker Postgres container (works in CI and normal dev machines). This sandbox has a Docker *client* but no running daemon, so a `RLS_TEST_BACKEND=local` mode was added that uses the system's already-installed `postgresql` service via `pg_ctlcluster`/`psql` against a throwaway database instead. Both paths run the exact same migrations and assertions — only container orchestration differs. All 53 isolation tests pass under the local backend; verify the Docker path too before trusting it blindly in a fresh CI environment.

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

### 2026-09-18 — Auto-converting AI Assistant answers into findings turned out not to need a scheduled job at all
Revisiting the gap above: a scheduled job would only be needed for *proactive* background scanning (running the model without the author asking) — which the "no provider request without user initiation" rule already rules out. Converting an answer from a check the author *just ran* (`consistency_check`, `character_continuity`, `timeline_analysis`, `plot_thread_tracking`, `dropped_thread_detection`, `canon_extraction`) into `ai_findings` rows is pure post-processing of a response that already exists in the same request — no new provider call, no background job. `promptBuilder.ts` (`FINDINGS_ELIGIBLE_MODES`) asks the model, only for those modes, to append a delimited JSON block after its conversational answer; `extractFindings` (`packages/ai-contracts/src/findingsExtraction.ts`) strips it from what the author sees and validates it against the same `ai_findings` schema the rule-based scanner uses, so a malformed block never breaks the chat response, it just yields zero findings. Both the Edge Function and local-only mode (against the deterministic test provider's `TEST_SCENARIO:findings`/`TEST_SCENARIO:findings-empty`) now do this. See `docs/AI_ARCHITECTURE.md`.

### 2026-09-18 — Found and fixed a real bug while wiring up findings: cloud-mode AI Assistant chat never wrote anything to the local store
Building the findings-mirroring path above required tracing exactly what `askAssistantCloud` did with the Edge Function's response, and it turned out to be: nothing. Every page that shows AI Assistant output (`AIAssistantPage`'s message list, `FindingsPage`) reads exclusively from Dexie via `useLiveQuery` — that's true in local-only mode by necessity, but it was *also* true for the "cloud" path, which only ever wrote to Postgres via the Edge Function's service-role client and never mirrored anything back into IndexedDB. A signed-in author on a real Supabase project would send a question, the Edge Function would answer it and bill their token allowance correctly, and the chat UI would show... nothing, forever, because nothing was watching Postgres. This was never caught because it requires a live Supabase project + a signed-in session, the one combination this sandbox has never been able to produce, and the e2e smoke test only exercises local-only mode.

Fixed by extending `AssistantResponse` (contracts.ts) to include the findings the Edge Function created, and having `askAssistantCloud` mirror the conversation record, both messages, and any findings into Dexie after a successful response — the same shape `askAssistantLocal` already writes, just sourced from the server's response instead of a local provider call. This is the same "server response becomes the local cache" pattern already used everywhere else in this codebase; it just hadn't been applied to this one code path. Regression-tested in `apps/web/src/lib/aiClientCloud.test.ts` (mocks `supabase.functions.invoke`, asserts Dexie actually gets written).

### 2026-09-18 — Found and fixed a real bug: "flexible rest days" was UI copy for a feature the code never implemented
The Timeline & Goals page has said "Rest days don't break a streak you've marked as flexible in Book Settings" since it was written. Investigating it turned up two gaps: Book Settings had no UI to set a rest day at all (only the daily word target), and even if `goals.rest_days` had somehow been populated directly in the database, `getStreak` never read the field — it broke the streak on any gap greater than one calendar day, full stop. Fixed both: a weekday toggle picker (Sun–Sat) in Book Settings now writes `goals.rest_days` via a new `setRestDays`, and `getStreak` walks each gap between goal-met days, only preserving the streak when every skipped day's weekday is in `restDays`. A gap over a day that isn't marked as a rest day still breaks the streak exactly as before. This is the same "UI claims a behavior the code doesn't implement" pattern as the `askAssistantCloud` bug above, just smaller in blast radius since nothing was billed or lost — a streak just silently reset for anyone using the feature as described. Regression-tested in `apps/web/src/lib/repos/storyboardTimeline.test.ts`.

### 2026-09-09 — Export formats: DOCX, TXT, Markdown, and Inkwell JSON backup ship now; EPUB does not; PDF is via the browser print dialog
`docx` (an actively maintained, browser-compatible library) generates real `.docx` files client-side. "Print-ready PDF" is implemented as a dedicated print stylesheet plus `window.print()` rather than a PDF-generation library — legitimate and testable, but requires the user's own "Save as PDF" step in their browser's print dialog rather than producing a `.pdf` file directly. EPUB was not implemented in this pass (a from-scratch EPUB is a non-trivial zip+XML structure); see `docs/IMPORT_EXPORT.md` for the concrete follow-up plan. No fake buttons exist for any of these — every export in the UI produces a real file or does not exist yet.
