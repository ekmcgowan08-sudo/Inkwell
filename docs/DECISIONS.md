# Inkwell — Decisions Log

Running log of material decisions made autonomously, per the minimum-touch protocol. Newest first.

---

### 2026-09-22 — Locked in the live-word-count fix with a real regression test, not a component test

The manuscript editor's live-word-count staleness bug (fixed 2026-09-19, see below) had no permanent regression
guard — the pre-existing smoke-test assertion couldn't catch it because Playwright's default `toContainText`
auto-retry window is longer than the 1.5s autosave debounce, letting autosave finish and mask the lag. That's
exactly how the bug shipped unnoticed in the first place.

First tried a component-level test (`@testing-library/react` + Tiptap/ProseMirror directly in jsdom): a basic
render spike worked, but driving real keystrokes through ProseMirror's contenteditable view in jsdom is a known
fragile path (it depends on `Range`/`Selection`/`getClientRects` support jsdom only partially provides), and
`ManuscriptPage.tsx` doesn't expose its internal editor instance or context providers for easy test construction
(`ProjectContext`/`AuthContext` aren't exported). Rather than force that — or export internals purely to make a
risky test possible — used the technique that actually found the bug originally: a Playwright assertion with a
short, deliberate timeout (`tests/e2e/wordCountLive.spec.ts`, 400ms, well under the 1500ms `AUTOSAVE_IDLE_MS`
debounce).

Verified this is a real regression guard, not just a plausible-looking one: checked out `ManuscriptPage.tsx`
from the commit before the fix (`2a86e0d`, parent of `fe0184f`) into the working tree, ran the new test against
it, and confirmed it fails exactly as expected (`"0 words this scene · Saving…"` instead of `"7 words"`), then
restored the fixed file (verified zero diff after restoring) and confirmed the test passes again. Added to CI's
existing Playwright step (already runs the whole `tests/e2e/` directory, no CI change needed beyond the step's
descriptive name) and `docs/TESTING.md`.

Verified: Browser — full 4-spec Playwright suite (smoke, performance, accessibility, new live-word-count test)
passing; new test independently confirmed to fail against the pre-fix code and pass against the current code.

### 2026-09-19 — `AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE` didn't reach what it claimed to control; corrected the docs and gave it the one real effect it can have

Auditing `.env.example` against what the code actually reads (the same audit style as the `pnpm lint`/format-check fixes) turned up `docs/OWNER_ACTIONS_REQUIRED.md` telling the owner to "decide and set `AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE` ... for your actual cost tolerance," while `ai-assistant/index.ts`'s allowance check hardcoded `?? 200_000` directly, never reading the env var at all.

Chasing it further turned up something more interesting than a one-line fix: `entitlements` rows are created automatically for every new signup (`handle_new_user_entitlement`, migration `0010_billing.sql`), with `ai_monthly_token_allowance` defaulting to 200,000 **in the SQL schema itself**. A Postgres trigger cannot read this Deno Edge Function's environment variables — there is no runtime bridge between them — so `AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE` can never influence what a new signup gets, no matter how it's wired in application code. The only thing an env var read in `ai-assistant/index.ts` can affect is the narrow fallback case of a caller with no `entitlements` row at all (pre-migration data, or a local/test environment missing that migration) — previously a bare `200_000` literal with no override at all, even for that case.

Extracted that literal into `defaultMonthlyAllowance()`, now reading the env var with a sane fallback, and unit-tested (`index.test.ts`) for unset/valid/invalid/non-positive inputs. More importantly, rewrote `docs/OWNER_ACTIONS_REQUIRED.md` and `.env.example`'s comments to say the true mechanism: to change what new signups actually get, edit migration `0010_billing.sql`'s `default 200000` before first deploying, or run an `alter table ... set default` against an already-deployed project — the env var is a minor, secondary lever, not the primary one the original doc line implied. `AI_AUTHOR_PLAN_MONTHLY_TOKEN_ALLOWANCE` remains genuinely unwired — nothing creates a paid-plan `entitlements` row yet, since no billing integration exists (see `ROADMAP.md`) — and both files now say so plainly instead of listing it as an actionable setting.

### 2026-09-19 — Format check was another `|| true`-masked no-op; added a real `.prettierrc.json` and reformatted the whole repo once

Same shape of gap as `pnpm lint`, found while auditing the rest of CI for the same pattern: `docs/DEPLOYMENT.md`'s CI job runs `npx prettier --check ... || true`, so it could never fail the build regardless of how much drift accumulated — and there was no `.prettierrc` at all, meaning "drift" meant _everything_, since Prettier's bare defaults (`printWidth: 80`) don't match this codebase's actual practiced style (dense, long lines with inline context, matching how every file in this repo has been hand-written all along). 121 files disagreed with Prettier's defaults.

Rather than either leaving the check permanently decorative or forcing 121 files into 80-column wrapping (which would have made the code meaningfully harder to read, fighting the style everything was written in), added `.prettierrc.json` with `printWidth: 150` — close to this repo's real average line length — then ran `prettier --write .` once across the whole tree and fixed the one file that didn't converge (`docs/OWNER_ACTIONS_REQUIRED.md` had an inline code span wrapped across a soft line break inside a list item, which is a genuinely unstable case for Prettier's markdown formatter — reformatting non-deterministically on repeated runs; fixed by keeping that one code span on a single line). Removed `|| true` from CI now that the check is real and passing.

This is purely a whitespace/line-break/quote-style change — Prettier never touches semantics. Verified nothing broke: full monorepo typecheck, `pnpm lint` (still 0 errors/warnings), the full unit test suite (68 tests across 3 packages), `pnpm test:rls` (53/53), the Deno Edge Function tests (15/15), the production build, and the full Playwright suite (smoke, performance, accessibility) — all still green after the reformat.

### 2026-09-19 — `pnpm lint` was completely broken; fixing it surfaced a real, previously-invisible bug (live word count silently lagging by a full autosave cycle)

Every package's `lint` script called `eslint`, but there was no `eslint.config.js` anywhere in the repo and
`eslint` wasn't even a declared dependency in any `package.json` — it only appeared to work in this sandbox
because a global `eslint` install happened to be on `PATH`. On a clean machine or in CI, `pnpm lint` would
fail immediately with "ESLint couldn't find an eslint.config.js file." CI's own job is even named
`lint-typecheck-test` but never actually ran `pnpm lint` — so this had been silently broken for a while
without a green CI badge ever catching it.

Fixed properly rather than removing the dead scripts: added `eslint`, `typescript-eslint`, and
`eslint-plugin-react-hooks` as real root devDependencies, and a root `eslint.config.js` (flat config) covering
`apps/web`, `apps/mobile`, and every `packages/*` — `@typescript-eslint/recommended` plus
`react-hooks`'s recommended rules for the two React apps. Excludes `supabase/functions` (Deno has its own
linter, `deno lint`, and Deno's globals/import style don't fit a Node ESLint config) and
`apps/desktop/src-tauri` (Rust, covered by `cargo check`). Wired into every package's `lint` script and into
CI's `lint-typecheck-test` job, which finally does what its name says.

Running it for the first time against the real codebase, rather than a token/empty pass, found real things:

- **The headline bug**: `ManuscriptPage.tsx`'s "words this scene" counter was computed with
  `useMemo(() => countWords(...), [editor, activeScene?.content])` — but the memo body reads
  `editor.getJSON()`, not `activeScene.content`, and `activeScene.content` is a value from Dexie that only
  updates _after_ the debounced autosave writes it back (~1.5s later). `react-hooks/exhaustive-deps` flagged
  the dependency as "unnecessary" since the callback doesn't read it, and chasing that mismatch (verified with
  a real Playwright run, checking the DOM 300ms after typing — a length so short Playwright's own
  auto-retrying assertions couldn't have papered over the gap the way the existing `smoke.spec.ts` assertion
  incidentally did) confirmed the counter genuinely showed "0 words" immediately after typing five words, only
  updating once autosave caught up. Nobody had noticed because the existing e2e assertion for this text used
  `toContainText`, which polls for up to its default timeout — it happened to still pass, just not for the
  reason it looked like it did. Fixed by tracking word count as real component state, updated live from
  `onUpdate` (every keystroke) and reset to the scene's own cached `wordCount` on scene switch (adjusted
  directly during render, not via a second effect — see below).
- **The same "sync state from a prop in an effect" anti-pattern, four more times**: `App.tsx`'s
  `RequireAuth` legal-acceptance gate, and three mobile detail-view screens
  (`story-bible.tsx`/`storyboard.tsx`/`timeline.tsx`) all called `setState` synchronously inside a `useEffect`
  purely to copy a derived value (the selected item's fields) into local editable state. `react-hooks/set-state-in-effect`
  (a rule from the newer "React Compiler" rule family in `eslint-plugin-react-hooks`) flagged all of them.
  Fixed each with React's own documented pattern — adjust the state directly during the render body, guarded
  by comparing against a "synced for this id" tracker — which avoids both the lint violation and the extra
  render+commit cycle an effect would cost.
- **Real dead code**: an unused `db` import in `ExportsPage.tsx`, an unused `createChapter` import in a test
  file, an unused `View` import in two mobile screens, and a genuinely-dead `let sentence: string[] = []`
  initializer in `generateManuscriptFixture.ts` (always overwritten before being read).
- **A lost error cause**: `tests/rls/run.ts` caught a migration failure and rethrew a new `Error` with just
  the message text, discarding the original error's stack and any Postgres-specific detail (`code`/`hint`/
  `position`). Fixed with `{ cause: err }`.
- **Fifteen `useLiveQuery(...) ?? []` call sites**, across nearly every page component: this allocates a new
  empty array on every render while a Dexie live query is still resolving, which makes any effect/memo
  depending on the result see a "changed" dependency every single render even though it's conceptually the
  same empty list. `dexie-react-hooks`'s `useLiveQuery` actually supports a third `defaultResult` argument for
  exactly this; added a shared, stable `EMPTY_ARRAY` constant (`apps/web/src/lib/db.ts`) and switched every
  call site to it.
- **A second dangling script**: while auditing `package.json` scripts for other "declared but never wired up"
  gaps in the same vein, found `"seed": "tsx scripts/seed.ts"` pointing at a file that had never been created
  — `pnpm seed` failed with `ERR_MODULE_NOT_FOUND` for anyone who ran it. Wrote a real
  `scripts/seed.ts` that seeds "The Lighthouse Keeps" (the same sample content local-only mode's onboarding
  already seeds into IndexedDB) into a real Supabase Postgres database for an existing signed-up dev account,
  connecting directly via `pg` (already a root devDependency, same approach `tests/rls/run.ts` uses) rather
  than through PostgREST. Verified end to end against a real local Postgres carrying the RLS suite's
  migrations + auth shim (created a user row, ran the script, confirmed the project/chapters/scenes/story-bible
  entries/timeline events all landed correctly with real word counts) — not run against an actual
  `supabase start` stack, since no Supabase CLI is installed in this sandbox.

None of this changed what the product does for an author — every fix here is either a correctness bug no one
had a way to notice (the word count), a cleaner/cheaper way to reach the identical rendered output (the
render-time state adjustments, the stable empty array), or dead weight (unused imports, a broken script no
one could have been relying on). Verified: full monorepo typecheck, `pnpm --filter @inkwell/web test` (54/54),
`pnpm test:rls` (53/53), the full Playwright suite (smoke, performance, accessibility), and `pnpm lint` itself,
all clean.

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
— see `docs/OWNER_ACTIONS_REQUIRED.md` for that separate, owner-specific gate. Building the acceptance _flow_
and getting the drafts _legally reviewed_ are two different gaps; this closes only the first one, and the
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

`tests/rls/run.ts` defaults to spinning up a disposable Docker Postgres container (works in CI and normal dev machines). This sandbox has a Docker _client_ but no running daemon, so a `RLS_TEST_BACKEND=local` mode was added that uses the system's already-installed `postgresql` service via `pg_ctlcluster`/`psql` against a throwaway database instead. Both paths run the exact same migrations and assertions — only container orchestration differs. All 53 isolation tests pass under the local backend; verify the Docker path too before trusting it blindly in a fresh CI environment.

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

Revisiting the gap above: a scheduled job would only be needed for _proactive_ background scanning (running the model without the author asking) — which the "no provider request without user initiation" rule already rules out. Converting an answer from a check the author _just ran_ (`consistency_check`, `character_continuity`, `timeline_analysis`, `plot_thread_tracking`, `dropped_thread_detection`, `canon_extraction`) into `ai_findings` rows is pure post-processing of a response that already exists in the same request — no new provider call, no background job. `promptBuilder.ts` (`FINDINGS_ELIGIBLE_MODES`) asks the model, only for those modes, to append a delimited JSON block after its conversational answer; `extractFindings` (`packages/ai-contracts/src/findingsExtraction.ts`) strips it from what the author sees and validates it against the same `ai_findings` schema the rule-based scanner uses, so a malformed block never breaks the chat response, it just yields zero findings. Both the Edge Function and local-only mode (against the deterministic test provider's `TEST_SCENARIO:findings`/`TEST_SCENARIO:findings-empty`) now do this. See `docs/AI_ARCHITECTURE.md`.

### 2026-09-18 — Found and fixed a real bug while wiring up findings: cloud-mode AI Assistant chat never wrote anything to the local store

Building the findings-mirroring path above required tracing exactly what `askAssistantCloud` did with the Edge Function's response, and it turned out to be: nothing. Every page that shows AI Assistant output (`AIAssistantPage`'s message list, `FindingsPage`) reads exclusively from Dexie via `useLiveQuery` — that's true in local-only mode by necessity, but it was _also_ true for the "cloud" path, which only ever wrote to Postgres via the Edge Function's service-role client and never mirrored anything back into IndexedDB. A signed-in author on a real Supabase project would send a question, the Edge Function would answer it and bill their token allowance correctly, and the chat UI would show... nothing, forever, because nothing was watching Postgres. This was never caught because it requires a live Supabase project + a signed-in session, the one combination this sandbox has never been able to produce, and the e2e smoke test only exercises local-only mode.

Fixed by extending `AssistantResponse` (contracts.ts) to include the findings the Edge Function created, and having `askAssistantCloud` mirror the conversation record, both messages, and any findings into Dexie after a successful response — the same shape `askAssistantLocal` already writes, just sourced from the server's response instead of a local provider call. This is the same "server response becomes the local cache" pattern already used everywhere else in this codebase; it just hadn't been applied to this one code path. Regression-tested in `apps/web/src/lib/aiClientCloud.test.ts` (mocks `supabase.functions.invoke`, asserts Dexie actually gets written).

### 2026-09-18 — Found and fixed a real bug: "flexible rest days" was UI copy for a feature the code never implemented

The Timeline & Goals page has said "Rest days don't break a streak you've marked as flexible in Book Settings" since it was written. Investigating it turned up two gaps: Book Settings had no UI to set a rest day at all (only the daily word target), and even if `goals.rest_days` had somehow been populated directly in the database, `getStreak` never read the field — it broke the streak on any gap greater than one calendar day, full stop. Fixed both: a weekday toggle picker (Sun–Sat) in Book Settings now writes `goals.rest_days` via a new `setRestDays`, and `getStreak` walks each gap between goal-met days, only preserving the streak when every skipped day's weekday is in `restDays`. A gap over a day that isn't marked as a rest day still breaks the streak exactly as before. This is the same "UI claims a behavior the code doesn't implement" pattern as the `askAssistantCloud` bug above, just smaller in blast radius since nothing was billed or lost — a streak just silently reset for anyone using the feature as described. Regression-tested in `apps/web/src/lib/repos/storyboardTimeline.test.ts`.

### 2026-09-09 — Export formats: DOCX, TXT, Markdown, and Inkwell JSON backup ship now; EPUB does not; PDF is via the browser print dialog

`docx` (an actively maintained, browser-compatible library) generates real `.docx` files client-side. "Print-ready PDF" is implemented as a dedicated print stylesheet plus `window.print()` rather than a PDF-generation library — legitimate and testable, but requires the user's own "Save as PDF" step in their browser's print dialog rather than producing a `.pdf` file directly. EPUB was not implemented in this pass (a from-scratch EPUB is a non-trivial zip+XML structure); see `docs/IMPORT_EXPORT.md` for the concrete follow-up plan. No fake buttons exist for any of these — every export in the UI produces a real file or does not exist yet.
