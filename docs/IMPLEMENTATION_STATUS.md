# Inkwell — Implementation Status

Last updated: 2026-09-09, end of session. This is the authoritative "what's actually true" doc — if it disagrees with a comment somewhere in code, this file wins. Update it before ending any work session on this repo.

Legend: ✅ done and verified · 🟡 real but partial · ⚪ scaffolded/designed, not built · ❌ not started

## Verification levels used below
- **Auto** — covered by an automated test that ran and passed in this environment.
- **Browser** — exercised in a real Chromium browser (Playwright or manual) against the local-only dev build.
- **Desktop** — run as a packaged Tauri app.
- **Sim/Emulator** — run in an iOS Simulator / Android Emulator.
- **Device** — run on physical hardware.
- **Prod creds** — requires real production credentials this environment doesn't have; unverified beyond code review.

---

## Phase 0 — Repository & attachment audit
✅ Read `Inkwell App Product Spec.md`, `Inkwell App Prototype.jsx`, `Inkwell Handoff.md` in full. Repo was empty (README only) at session start.

## Phase 1 — Architecture, design system, local environment
✅ `docs/ARCHITECTURE.md` written with evidence before implementation began.
✅ pnpm workspace: `packages/shared-types`, `packages/design-tokens`, `packages/api-client`, `packages/ai-contracts`, `apps/web`.
✅ Design tokens (colors, type, spacing, motion) as both TS constants and CSS custom properties; dark ("Writer's Den") and light themes both fully defined, `prefers-color-scheme` + explicit `[data-theme]` override, reduced-motion support. **Verified: Browser.**
🟡 Component library covers what the built pages use (Button, form fields, Card, Badge, ProgressBar, EmptyState, Dialog/ConfirmDialog, Toast, AI-thinking indicator, sync-status pill) — not an exhaustively documented standalone library/storybook.

## Phase 2 — Auth, database, project isolation, dashboard
✅ Full SQL schema, `supabase/migrations/0001`–`0010`, every table RLS-enabled with explicit select/insert/update/delete policies (or deliberately none, for server-only tables — see `docs/DATA_MODEL.md`).
✅ **53/53 automated RLS isolation tests pass** against real Postgres (`pnpm test:rls`, `RLS_TEST_BACKEND=local` in this sandbox — see `docs/DECISIONS.md`): cross-user project/chapter/scene/story-bible access denied, `appearances` records isolated per project+user (added 2026-09-18 — the table had policies but no test, a hard-rule gap), AI conversations/messages/document_chunks isolated per project+user, the ranked full-text search functions respect RLS, `ai_rate_limit_events` is unreadable/unwritable by any client, `ai_findings` can't be created by a client directly (but the owning user can update status/author_note), a client cannot self-grant a paid entitlement, series-ownership IDOR blocked by a CHECK constraint, soft-delete recovery bin is private. **Verified: Auto.**
✅ Supabase Auth wiring in `apps/web` (signup/login/logout/password reset/session persistence/protected routes) — code complete, cannot be verified end-to-end without a real Supabase project (**Prod creds** required for that half).
✅ Local-only mode (no Supabase configured): stable pseudo-user, full app functionality, zero backend. **Verified: Browser**, including a full Playwright golden-path test (`tests/e2e/smoke.spec.ts`).
✅ Dashboard: grid/list views, search, sort (recent/title/progress), favorites, archive, duplicate, soft-delete with recovery, new-book dialog (with series create/select), import dialog (TXT/MD). **Verified: Browser.**
⚪ Apple/Google OAuth sign-in: schema and architecture accommodate it (Supabase Auth supports it natively); no client-side OAuth buttons wired up yet, and it requires **Prod creds** (Apple/Google developer accounts) regardless.
✅ Onboarding: writing-style choice, blank book, sample project (fully seeded "The Lighthouse Keeps" — matches the original prototype's demo content), and a pointer to the dashboard's import flow. Terms/Privacy acceptance is now real: `LegalAcceptancePage` (`/legal/accept`) renders the actual draft documents from `docs/legal/TERMS_OF_SERVICE.md`/`PRIVACY_POLICY.md` (bundled via a Vite `?raw` import, so it's the same text as the source of truth, never a copy that can drift), gates on two explicit checkboxes, and writes `profiles.terms_accepted_at`/`privacy_accepted_at` on accept. New cloud signups are routed through it before onboarding; `RequireAuth` also gates every protected route for a cloud user who hasn't accepted yet (e.g. an account that pre-dates this feature), redirecting back to where they were headed once they accept. Cloud-only by design — local-only mode has no account and nothing leaves the browser, so it's treated as always-accepted. The documents themselves are still drafts pending professional legal review (`docs/OWNER_ACTIONS_REQUIRED.md`) — that's a separate, owner-specific gate from whether the acceptance *flow* is built, and the page says so prominently. **Verified: Auto** (`profiles.test.ts` against a mocked Supabase client; production build confirmed to bundle the real draft text) and **Browser** (`vite dev` confirmed the raw import resolves and serves through Vite's dev server, not just the Rollup build). Not exercised against a live Supabase project — the actual profile row read/write is code-reviewed but **Prod creds** required to confirm end-to-end.
✅ Installable PWA: `vite-plugin-pwa` generates a manifest + Workbox service worker on every production build, precaching only the app's own build output (no `runtimeCaching`, so Supabase requests are never intercepted/cached). **Verified: Browser** — a real Chromium instance against a real `vite preview` build confirms the manifest resolves and the service worker registers/activates. Icons are the same placeholder mark used for desktop/mobile, not final branding. See `docs/DEPLOYMENT.md`.

## Phase 3 — Local-first manuscript editor, autosave, sync, recovery
✅ Tiptap-based rich text editor: bold/italic/underline/blockquote/scene-break(hr)/text-align, undo/redo, Find & Replace (find-next + replace-all, scoped to the open scene).
✅ Debounced autosave (1.5s idle) writing to IndexedDB first, bumping a per-scene `revision` counter and appending an append-only `document_revisions` row on every save — **not** a write per keystroke. **Verified: Auto** (`src/lib/repos/manuscript.test.ts`) and **Browser** (word count + "Saved" status confirmed live in Playwright).
✅ Version history UI: list revisions per scene, preview, restore (creates a *new* revision rather than rewriting history).
🟡 Cloud sync: real code path exists (`src/lib/sync.ts` — best-effort push, retry queue in IndexedDB, online/offline listeners, periodic flush), with per-row optimistic concurrency via the `revision` column now actually enforced: `pushUpsert` does a revision-gated conditional update, not a plain `upsert()`, and a losing write is recorded (never silently dropped) and surfaced to the author via `SyncStatusPill` → `SyncConflictsDialog` with a "keep mine / keep theirs" choice. **Verified: Auto** (`src/lib/sync.test.ts` exercises gating, conflict recording, and both resolution paths against a mocked Supabase client). **Not verified against a live Supabase project with two real devices** (no project deployed in this environment) — see `docs/SYNC_AND_CONFLICTS.md` for exactly what is and isn't proven.
✅ Focus mode, live word/page/reading-time estimates, chapter/scene add-rename-delete(soft), multi-scene-per-chapter model.
✅ Drag-and-drop chapter reordering in the manuscript sidebar, mirroring the storyboard's dnd-kit pattern (pointer drag + keyboard-accessible up/down buttons). **Verified: Auto** (typecheck + `manuscript.test.ts`).
✅ Tested "at least 100,000 words" responsiveness requirement: `tests/e2e/performance.spec.ts` generates a deterministic 40-chapter/~100,203-word fixture, imports it through the real UI, and measures import/chapter-switch/typing+autosave latency in a real Chromium browser. **Verified: Browser** — see `docs/TESTING.md` for the actual numbers. Scene-level documents and cached plain-text/word-count columns hold up in practice, not just in architecture description.
✅ Parts — the optional grouping level above chapters described in `PRODUCT.md`'s manuscript hierarchy (`parts → chapters → scenes`). Had a schema, migration, RLS policies, and a Zod type since early in the project, but `db.parts` was never wired into `apps/web` at all — no repo functions, no UI, silently absent rather than honestly flagged as a gap. Found via the same "unused Dexie table" audit that caught `writing_sessions`. Now real: `createPart`/`renamePart`/`reorderParts`/`deletePart`/`assignChapterToPart` (`apps/web/src/lib/repos/manuscript.ts`), a "Parts" management section above the chapter list (add, inline rename, delete), and a per-chapter "Part" `<select>` (mirrors the storyboard's column-select pattern — assignment without drag-and-drop) rather than extending drag-and-drop reordering across part groups, which would need a much larger cross-container dnd-kit rewrite; scoped out deliberately, not silently skipped. Deleting a part ungroups its chapters (`partId` → `null`) rather than deleting them — a part is purely an organizational label. **Verified: Auto** (`manuscript.test.ts` — create/rename/reorder/assign/delete-ungroups) and **Browser** (a real Playwright run: created a part, assigned a chapter to it via the select, reloaded the page, confirmed the assignment persisted to IndexedDB — not part of the committed suite, a one-off manual verification for this change).

## Phase 4 — Story bible, relationships, appearances, search
✅ Characters (full structured field set from the spec), locations/lore/objects/organizations/custom (summary + notes + tags — intentionally less rigidly structured, per "don't over-structure" guidance), canon status, tags, search/filter.
✅ Relationships: list view + a real (SVG, not decorative) visual map, with the list serving as the required accessible alternative.
✅ Suggested appearances requiring author confirmation: `detectAppearances` (`apps/web/src/lib/repos/appearances.ts`) is a deterministic, local, rule-based scan — NOT a model call, same philosophy as `findingsScanner.ts` — matching each story-bible entry's name/aliases (whole-word, case-insensitive, ≥3 chars to cut noise) against every scene's plain text and creating an unconfirmed `ai_suggested` appearance for any (entry, scene) pair not already recorded. Explicitly user-initiated via a "Scan manuscript for appearances" button on the Story Bible page (never runs automatically), with a per-entry "Appearances" section to confirm or dismiss suggestions. Dismissing deletes the row rather than tracking a separate "rejected" state — the schema doesn't have one, and re-scanning can resurface a dismissed mention; documented as a known, accepted limitation rather than engineered around. **Verified: Auto** (`appearances.test.ts` — detection, alias matching, word-boundary matching, no-duplicate-resuggestion, confirm, dismiss) and **Browser** (a real Playwright run: wrote a scene mentioning a name, created a matching character entry, ran the scan, confirmed the suggestion appeared and moved to "confirmed" — not part of the committed suite, a one-off manual verification for this change).
❌ Custom user-defined field *definitions* (`custom_field_defs` table exists, RLS-protected) have no UI yet — today "custom fields" means freeform notes/tags only, not admin-defined structured fields per project.

## Phase 5 — AI memory, assistant, findings
✅ All 14 AI modes from the spec available in the assistant UI, each with a distinct system-prompt instruction (`packages/ai-contracts/src/promptBuilder.ts`).
✅ Context budgeting: chapter summaries + a bounded set of retrieved scene excerpts + story-bible digest + open threads + timeline, never the raw full manuscript. Scene and story-bible retrieval is now ranked by relevance to the question via `ts_rank` over the existing `tsvector`/GIN `search_vector` columns (`search_scenes_ranked`/`search_story_bible_entries_ranked`, migration 0011), falling back to the old recency slice when nothing matches. **Verified: Auto** (`supabase/functions/_shared/buildContext.test.ts`, plus an RLS isolation proof for both functions in `tests/rls/run.ts`); not yet exercised against a live project with real content. See `docs/AI_ARCHITECTURE.md`.
✅ Citations: the model is asked to reference bracketed ids already in its context; both the local test-provider path and the (unverified, no live project) cloud path parse those into structured, clickable citations.
✅ Deterministic local test provider (`createTestProvider`) — the whole AI Assistant UI, findings, and citation rendering were built and verified against this, spending zero API credits. **Verified: Auto + Browser.**
🟡 Server-side Anthropic call: `supabase/functions/ai-assistant/` is written (Deno-compatible, model id from `ANTHROPIC_MODEL` env var, never hardcoded, JWT-verified caller, usage/cost tracking, rate/allowance check before calling out) — **cannot be deployed or invoked in this environment** (no Supabase project, no `supabase` CLI network access verified). Code-reviewed, not integration-tested against a live model. **Prod creds required.** A real bug in the client-side half of this path — `askAssistantCloud` never wrote the Edge Function's response into the local Dexie cache the chat UI actually reads from, so a real cloud-connected author would get billed and see nothing happen — was found and fixed while building the findings-mirroring feature below; see `docs/DECISIONS.md` (2026-09-18).
✅ AI Findings workspace: real rule-based scanner (duplicate names, orphaned open threads, timeline conflicts) runs with zero AI cost; accept/dismiss/snooze/convert-to-task/mark-intentional all persist. The model-backed consistency-check family of AI Assistant modes now also feeds this same table: the system prompt asks for a trailing structured findings block (only for modes where that's meaningful — `consistency_check`, `character_continuity`, `timeline_analysis`, `plot_thread_tracking`, `dropped_thread_detection`, `canon_extraction`), which `extractFindings` strips out of the visible answer and persists as real `ai_findings` rows with resolved citations — no background job needed, since it's post-processing of a response the author's own request already produced. **Verified: Auto** (`findingsExtraction.test.ts`, `aiClient.test.ts` covering the full local pipeline; RLS proven). See `docs/AI_ARCHITECTURE.md` and `docs/DECISIONS.md`.
✅ Cross-project AI isolation is enforced at the database layer and proven by the RLS test suite, not merely by client-side care.
✅ Series-level continuity scope: a checkbox on the AI Assistant page ("Also consider the other books in this series"), shown only when the active book has a series, sets `seriesScope: true`. Server-side, `fetchSeriesContext` (`supabase/functions/_shared/buildContext.ts`) pulls a small, book-labeled slice (`"[Book Two] ..."`) of chapter summaries, approved canon facts, and story bible entries from up to 4 other books in the series — RLS-scoped exactly like everything else, so this can only ever see the caller's own projects. The local-only mode (`aiLocalContext.ts`) mirrors this from Dexie, minus canon facts (not implemented client-side at all, a pre-existing gap). Off by default; the assistant never reads outside the active project unless explicitly asked. **Verified: Auto** (`buildContext.test.ts`, `aiLocalContext.test.ts`); not exercised against a live Supabase project.

## Phase 6 — Storyboard, timeline, goals, progress
✅ Storyboard: cards grouped into columns, structure overlays (Three-Act / Save the Cat / Hero's Journey / none) as **non-restrictive** relabeling, pointer drag-and-drop reorder (dnd-kit) *and* a fully keyboard-operable up/down-arrow alternative plus a column `<select>` for moving between columns without dragging.
✅ In-story timeline: freeform + optional exact date, duration, linked characters/location/scenes, a real (if simple) same-day/different-location conflict detector.
✅ Real persisted daily writing-progress and streaks (`daily_progress`) — replaces the prototype's session-only "words today" entirely. **Verified: Browser** (goal card, progress bars, and a mini 7-day history all update live off real IndexedDB data).
✅ Writing sessions (`writing_sessions`) — this line previously claimed the table was "real persisted," which was false: the schema, RLS policies, and Zod type existed, but nothing in `apps/web` ever read or wrote to it; the table was entirely dead. Found while auditing for exactly this pattern after fixing the rest-days streak bug. Now real: `startWritingSession`/`endWritingSession` (`apps/web/src/lib/repos/writingSessions.ts`) track one row per continuous editing visit — start is lazy (the first real edit, not merely opening the manuscript page), end is best-effort (`visibilitychange` to hidden, or component unmount on navigating away), so a hard crash/force-quit leaves a session with `endedAt: null` forever, an accepted, harmless, documented limitation rather than something worth a heartbeat-write scheme to avoid. A "Recent Sessions" card on the Timeline & Goals page shows the last 5 (date, duration, words written). **Verified: Auto** (`writingSessions.test.ts`) and **Browser** (a real Playwright run: wrote a scene, navigated away, confirmed a session with a duration and word delta appeared — a one-off manual verification for this change, not part of the committed suite).
✅ Flexible rest days: a weekday picker (Sun–Sat toggles) in Book Settings writes to `goals.rest_days` via `setRestDays`. `getStreak` now walks any gap between goal-met days and only preserves the streak if every skipped calendar day's weekday is in `restDays`; a gap over a non-rest day still breaks it, same as before. Makes the pre-existing "Rest days don't break a streak" copy on the Timeline & Goals page actually true instead of aspirational. **Verified: Auto** (`storyboardTimeline.test.ts` — rest-day gap preserves streak, non-rest-day gap still breaks it, `setRestDays` persists and creates-if-missing); not yet exercised in a real browser across actual multi-day usage.

## Phase 7 — Import, export, backups, Drive
✅ Import: TXT/Markdown/DOCX with real heading-detection, preview, warnings (duplicate titles, no-headings-found), confirm step — never a silent overwrite (always creates a new project). DOCX goes through `mammoth.js` client-side, mapping Word's Heading 1/2/3 styles into the same markdown-heading detection path TXT/MD already use. **Verified: Auto** (`importManuscript.test.ts`, `importDocx.test.ts` — the latter against a mocked mammoth, since Vitest's SSR module resolution doesn't apply mammoth's `"browser"` package.json field the way the real client build does; confirmed separately by inspecting the built bundle) **+ Browser** for TXT/MD only — DOCX has not been manually tried against a real Word file in a browser in this pass.
✅ Export: DOCX (real, via the `docx` library — title page, heading styles, scene breaks, indentation), TXT, Markdown, complete Inkwell JSON backup — all real generated files via browser download, none are fake buttons. Print-ready PDF via a dedicated print stylesheet + `window.print()`.
✅ EPUB export: hand-built EPUB 3 (OCF container with `mimetype` first/uncompressed, OPF manifest/spine, XHTML nav document, one XHTML file per chapter) via `jszip`, reusing the same `plainText` extraction every other export format uses. **Verified: Auto** (`exportProject.test.ts`, inspecting the in-memory `JSZip`) **and validated against the real official W3C `epubcheck` 5.1.0** — 0 fatals/errors/warnings/infos on a generated two-chapter file. Not yet opened in an actual e-reader app (Apple Books, Calibre, an e-ink device).
❌ Google Drive integration: not started (correctly sequenced after core sync — per the spec's own phase ordering — and requires **Prod creds**, a Google Cloud OAuth client, regardless).

## Phase 8/9 — Mobile & desktop
See `docs/ARCHITECTURE.md` for the decision (Tauri 2 desktop, Expo mobile).

**Desktop (`apps/desktop`)**: ✅ Tauri 2 shell wrapping `apps/web` — native File/Edit/View/Window/Help menu
(forwarded to the webview as DOM events, `apps/web/src/lib/desktopBridge.ts`), a real prevent-accidental-close
guard, dialog/fs/os/shell/updater/process plugins with an explicit capabilities file. **Verified: Auto** —
`cargo check` passes cleanly (zero warnings) against the real Tauri v2 + webkit2gtk toolchain installed in
this environment. `tauri dev`/`tauri build` (needs a display server and, for installers, bundler tooling) were
**not** run — compile-verified only, not run as an app.

**Mobile (`apps/mobile`)**: 🟡 Real but deliberately v0-scoped. Expo Router app reusing
`@inkwell/shared-types`/`design-tokens`/`api-client`: login, a Library tab with real RLS-protected Supabase
queries, a plain-text (not rich-text) manuscript editor with debounced autosave, a story bible screen
(`book/[id]/story-bible.tsx` — flat list of entries with inline name/summary editing and debounced autosave,
a "+ New Character" button; no per-type tabs, relationships, tags, or appearances UI yet), a timeline
screen (`book/[id]/timeline.tsx` — ordered list of events with inline label/when/detail editing and
debounced autosave, a "+ New Event" button; no fictional calendars, conflict detection, or linked
scenes/characters UI yet), an AI Assistant screen (`book/[id]/ai-assistant.tsx` — a single "ask"
conversation per book, no mode picker, no series scope, no citation rendering; unlike the other screens it
has no local cache to keep in sync, since mobile has no local-first store at all — it just re-reads
`ai_conversations`/`ai_messages` from Postgres after every exchange), and a storyboard screen
(`book/[id]/storyboard.tsx` — cards grouped into columns/sections, with move-up/move-down buttons as the
real alternative to drag-and-drop rather than an afterthought, inline title/summary/column editing with
debounced autosave; no POV/location/character/thread linking UI yet), secure token storage
(`expo-secure-store`, not AsyncStorage), AppState-aware token refresh. An on-device local-first store is
**not** built for mobile yet — mobile currently requires a configured Supabase backend (no local-only
fallback the way web has). Every core module from the product spec now has *some* mobile screen, each
honestly narrower than its web counterpart. **Verified: Auto (typecheck only)** —
`pnpm --filter @inkwell/mobile typecheck` now passes cleanly and runs in CI; it didn't in earlier passes
because `apps/mobile`'s `node_modules` had never actually been installed in this environment (fixed simply by
running `pnpm install`), plus two real gaps this pass fixed: `apps/mobile/tsconfig.json` was missing
`moduleResolution: "bundler"` / `allowImportingTsExtensions` (needed for the shared packages' `.ts`-extension
imports, same as `apps/web`'s tsconfig — Metro's own runtime bundling is unaffected, this is tsc-only), and
`@supabase/supabase-js` wasn't a direct dependency even though `lib/supabase.ts`/`lib/auth.tsx` import its
types directly. **Still not run as an app** — no Expo/React Native toolchain beyond `tsc`, no simulator,
emulator, or physical device was available in this environment. A clean typecheck is real signal (it wasn't
achievable before) but is not the same claim as "runs correctly on a device" — treat it as exactly that much
verification, no more.

## Phase 10 — Media, subscriptions
⚪ Not started. Schema (`media_assets`, `generation_jobs`, `entitlements`) exists and is RLS-protected, with
`entitlements` proven (in `tests/rls/run.ts`) to reject a client granting itself a paid plan — but no UI, no
media-provider interface code, and no payment integration exist yet. Correctly out of scope for this pass per
the brief's own phase ordering (media/subscriptions after core product).

## Phase 11 — Security, accessibility, performance, tests
✅ RLS/security isolation tests (53/53, see Phase 2) — the load-bearing security evidence for this whole project.
✅ Deno Edge Function typecheck + unit tests (`ai-assistant`, `account-delete`) — real, passing.
✅ Full-stack CI workflow written (`.github/workflows/ci.yml`): typecheck/unit-tests/build/secret-scan, the RLS
suite (Docker-based, as CI runners have a real daemon unlike this sandbox), Deno function typecheck+tests, the
Playwright e2e suite, and a Rust `cargo check` job with the exact Tauri Linux dependencies this repo verified
work. **Not run on an actual GitHub Actions runner** in this pass — YAML-validated and modeled directly on the
commands verified locally, but CI executing it for real is the first genuine test of the workflow itself.
✅ Accessibility: semantic landmarks, labeled form fields, focus-visible styling, accessible dialogs (focus
trap, Escape-to-close, restore focus), keyboard-operable storyboard reordering (a real alternative to
drag-and-drop, not just a nod to the requirement), non-color status indicators, reduced-motion support.
Now also machine-checked: `tests/e2e/accessibility.spec.ts` runs `@axe-core/playwright` against every core
screen. **Verified: Browser** — first run found and this pass fixed two real violations (an unlabeled Tiptap
editor region, an unlabeled icon-only send button); passing with 0 violations now. Does not replace real
screen-reader testing, which wasn't done. See `docs/TESTING.md`.
❌ Formal unit/integration coverage is real but partial — nowhere near exhaustive across every module in the
brief's testing matrix (two-device conflict against a live project, expired session, etc.). See
`docs/TESTING.md` for the itemized "what was and wasn't run" list.

## Phase 12 — Release, store materials, cost model
✅ `docs/DEPLOYMENT.md` (local dev through production deploy for web/desktop/mobile), `docs/STORE_SUBMISSION.md`
(Apple/Google/Windows checklists), `docs/COSTS.md` (dated, sourced, explicitly-hypothesis cost estimates
across local/beta/production/growth scenarios), `docs/OWNER_ACTIONS_REQUIRED.md` (the single consolidated
non-delegable checklist), `docs/LEGAL_REVIEW_CHECKLIST.md` + eight legal drafts in `docs/legal/` (privacy
policy, terms of service, AI data-use disclosure, copyright/ownership, subscription disclosure,
account-deletion policy, data-retention policy, acceptable-use policy) — every draft explicitly labeled as
requiring real legal review, none claims compliance with anything.
⚪ App icons (`apps/desktop/src-tauri/icons/`, `apps/mobile/assets/`) are programmatically-generated
placeholders (an ink-navy square with a gold mark) — real, valid PNG files so the build tooling has something
to load, explicitly not final branding.

---

## The honest one-paragraph summary
Inkwell today is a **real, working, local-first writing studio** for web and desktop — clone the repo, run one
command, and get a fully functional app with manuscript editing (Tiptap, real debounced autosave and revision
history), story bible, storyboard, timeline/goals, an AI assistant (14 modes, citations, test-mode by
default), a real rule-based findings scanner, and working DOCX/TXT/Markdown/print/backup exports, with zero
configuration. The desktop shell (Tauri 2) compiles cleanly against a real toolchain. The database schema and
its security model are complete and proven by 53 automated isolation tests against a real Postgres instance,
not just asserted. A full CI workflow, deployment/testing/security/privacy/cost documentation, and
professional-review-pending legal drafts all exist. What's honestly *not* yet true: no live Supabase project
has ever actually run this schema in production (Prod creds required to verify that), the real
(non-test) Anthropic-backed AI path is written and Deno-typechecked/unit-tested but not exercised against a
live model, sync is local-first-with-best-effort-push with revision-gated writes and a real conflict-resolution
UI now in place but unproven against a live multi-device session (only mocked-network unit tests so far — see
`docs/SYNC_AND_CONFLICTS.md`), and mobile is a genuine but narrow v0 (login + library + plain-text editor) that
now typechecks cleanly (a real gap this pass fixed — missing dependencies, a tsconfig mismatch) but has still
never been run as an app in this environment (no Expo toolchain, simulator, or device). Every one of those
gaps is stated specifically, above, with a concrete next step — not glossed over.

## Final verification pass (most recent: 2026-09-18)
Re-run immediately before this update, all green: `apps/web` typecheck (`tsc --noEmit`), `apps/web` unit tests
(34 tests, vitest), the RLS isolation suite (53/53, local-Postgres backend), and the production web build.
Earlier in the same overall effort: shared-types/design-tokens/api-client/ai-contracts typecheck, the Deno
Edge Function typecheck + unit tests, the full Playwright golden-path e2e test, and `cargo check` on the
desktop shell — not all re-run in this specific pass, so treat those as last-verified rather than re-confirmed
today. Commands are listed in `docs/TESTING.md`.
