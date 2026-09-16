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
✅ **13/13 automated RLS isolation tests pass** against real Postgres (`pnpm test:rls`, `RLS_TEST_BACKEND=local` in this sandbox — see `docs/DECISIONS.md`): cross-user project/chapter/scene/story-bible access denied, AI conversations/messages/document_chunks isolated per project+user, a client cannot self-grant a paid entitlement, series-ownership IDOR blocked by a CHECK constraint, soft-delete recovery bin is private. **Verified: Auto.**
✅ Supabase Auth wiring in `apps/web` (signup/login/logout/password reset/session persistence/protected routes) — code complete, cannot be verified end-to-end without a real Supabase project (**Prod creds** required for that half).
✅ Local-only mode (no Supabase configured): stable pseudo-user, full app functionality, zero backend. **Verified: Browser**, including a full Playwright golden-path test (`tests/e2e/smoke.spec.ts`).
✅ Dashboard: grid/list views, search, sort (recent/title/progress), favorites, archive, duplicate, soft-delete with recovery, new-book dialog (with series create/select), import dialog (TXT/MD). **Verified: Browser.**
⚪ Apple/Google OAuth sign-in: schema and architecture accommodate it (Supabase Auth supports it natively); no client-side OAuth buttons wired up yet, and it requires **Prod creds** (Apple/Google developer accounts) regardless.
🟡 Onboarding: writing-style choice, blank book, sample project (fully seeded "The Lighthouse Keeps" — matches the original prototype's demo content), and a pointer to the dashboard's import flow. Terms/privacy *acceptance recording* fields exist in the schema (`profiles.terms_accepted_at` etc.) but the onboarding UI doesn't yet present real Terms/Privacy documents for the user to accept against them.

## Phase 3 — Local-first manuscript editor, autosave, sync, recovery
✅ Tiptap-based rich text editor: bold/italic/underline/blockquote/scene-break(hr)/text-align, undo/redo, Find & Replace (find-next + replace-all, scoped to the open scene).
✅ Debounced autosave (1.5s idle) writing to IndexedDB first, bumping a per-scene `revision` counter and appending an append-only `document_revisions` row on every save — **not** a write per keystroke. **Verified: Auto** (`src/lib/repos/manuscript.test.ts`) and **Browser** (word count + "Saved" status confirmed live in Playwright).
✅ Version history UI: list revisions per scene, preview, restore (creates a *new* revision rather than rewriting history).
🟡 Cloud sync: real code path exists (`src/lib/sync.ts` — best-effort push, retry queue in IndexedDB, online/offline listeners, periodic flush), with per-row optimistic concurrency via the `revision` column now actually enforced: `pushUpsert` does a revision-gated conditional update, not a plain `upsert()`, and a losing write is recorded (never silently dropped) and surfaced to the author via `SyncStatusPill` → `SyncConflictsDialog` with a "keep mine / keep theirs" choice. **Verified: Auto** (`src/lib/sync.test.ts` exercises gating, conflict recording, and both resolution paths against a mocked Supabase client). **Not verified against a live Supabase project with two real devices** (no project deployed in this environment) — see `docs/SYNC_AND_CONFLICTS.md` for exactly what is and isn't proven.
✅ Focus mode, live word/page/reading-time estimates, chapter/scene add-rename-delete(soft), multi-scene-per-chapter model.
✅ Drag-and-drop chapter reordering in the manuscript sidebar, mirroring the storyboard's dnd-kit pattern (pointer drag + keyboard-accessible up/down buttons). **Verified: Auto** (typecheck + `manuscript.test.ts`).
🟡 Tested "at least 100,000 words" responsiveness requirement: not measured with an actual 100k-word fixture in this pass (see `docs/TESTING.md` for the concrete follow-up). Architecture (scene-level documents rather than one giant per-book document, plain-text caching rather than re-parsing) is designed for this, but the number itself is unverified.

## Phase 4 — Story bible, relationships, appearances, search
✅ Characters (full structured field set from the spec), locations/lore/objects/organizations/custom (summary + notes + tags — intentionally less rigidly structured, per "don't over-structure" guidance), canon status, tags, search/filter.
✅ Relationships: list view + a real (SVG, not decorative) visual map, with the list serving as the required accessible alternative.
🟡 "Automatically suggested appearances requiring author confirmation" — the `appearances` table and `source: 'author' | 'ai_suggested'` column exist and are RLS-protected, but nothing yet actually generates AI-suggested appearances (would be an AI Assistant `scene_analysis`-adjacent job, not built).
❌ Custom user-defined field *definitions* (`custom_field_defs` table exists, RLS-protected) have no UI yet — today "custom fields" means freeform notes/tags only, not admin-defined structured fields per project.

## Phase 5 — AI memory, assistant, findings
✅ All 14 AI modes from the spec available in the assistant UI, each with a distinct system-prompt instruction (`packages/ai-contracts/src/promptBuilder.ts`).
✅ Context budgeting: chapter summaries + a bounded set of retrieved scene excerpts + story-bible digest + open threads + timeline, never the raw full manuscript. Scene and story-bible retrieval is now ranked by relevance to the question via `ts_rank` over the existing `tsvector`/GIN `search_vector` columns (`search_scenes_ranked`/`search_story_bible_entries_ranked`, migration 0011), falling back to the old recency slice when nothing matches. **Verified: Auto** (`supabase/functions/_shared/buildContext.test.ts`, plus an RLS isolation proof for both functions in `tests/rls/run.ts`); not yet exercised against a live project with real content. See `docs/AI_ARCHITECTURE.md`.
✅ Citations: the model is asked to reference bracketed ids already in its context; both the local test-provider path and the (unverified, no live project) cloud path parse those into structured, clickable citations.
✅ Deterministic local test provider (`createTestProvider`) — the whole AI Assistant UI, findings, and citation rendering were built and verified against this, spending zero API credits. **Verified: Auto + Browser.**
🟡 Server-side Anthropic call: `supabase/functions/ai-assistant/` is written (Deno-compatible, model id from `ANTHROPIC_MODEL` env var, never hardcoded, JWT-verified caller, usage/cost tracking, rate/allowance check before calling out) — **cannot be deployed or invoked in this environment** (no Supabase project, no `supabase` CLI network access verified). Code-reviewed, not integration-tested against a live model. **Prod creds required.**
✅ AI Findings workspace: real rule-based scanner (duplicate names, orphaned open threads, timeline conflicts) runs with zero AI cost; accept/dismiss/snooze/convert-to-task/mark-intentional all persist. The model-backed consistency-check path exists as an AI Assistant *mode* but nothing yet auto-converts its answers into a background-created finding — see `docs/DECISIONS.md`.
✅ Cross-project AI isolation is enforced at the database layer and proven by the RLS test suite, not merely by client-side care.
❌ Series-level continuity scope (`seriesScope: true` in the request contract) is defined in the contract and schema but the UI has no toggle to opt into it yet.

## Phase 6 — Storyboard, timeline, goals, progress
✅ Storyboard: cards grouped into columns, structure overlays (Three-Act / Save the Cat / Hero's Journey / none) as **non-restrictive** relabeling, pointer drag-and-drop reorder (dnd-kit) *and* a fully keyboard-operable up/down-arrow alternative plus a column `<select>` for moving between columns without dragging.
✅ In-story timeline: freeform + optional exact date, duration, linked characters/location/scenes, a real (if simple) same-day/different-location conflict detector.
✅ Real persisted daily writing-progress and streaks (`daily_progress`, `writing_sessions`) — replaces the prototype's session-only "words today" entirely. **Verified: Browser** (goal card, progress bars, and a mini 7-day history all update live off real IndexedDB data).
🟡 "Flexible rest days" field exists on `goals.rest_days`; the streak calculator does not yet treat a rest day as streak-preserving (it currently just breaks on any non-goal-met day) — described as a feature in the Book Settings copy slightly ahead of what the streak math actually does. **Action item**, tracked here rather than silently shipped as if finished.

## Phase 7 — Import, export, backups, Drive
✅ Import: TXT/Markdown/DOCX with real heading-detection, preview, warnings (duplicate titles, no-headings-found), confirm step — never a silent overwrite (always creates a new project). DOCX goes through `mammoth.js` client-side, mapping Word's Heading 1/2/3 styles into the same markdown-heading detection path TXT/MD already use. **Verified: Auto** (`importManuscript.test.ts`, `importDocx.test.ts` — the latter against a mocked mammoth, since Vitest's SSR module resolution doesn't apply mammoth's `"browser"` package.json field the way the real client build does; confirmed separately by inspecting the built bundle) **+ Browser** for TXT/MD only — DOCX has not been manually tried against a real Word file in a browser in this pass.
✅ Export: DOCX (real, via the `docx` library — title page, heading styles, scene breaks, indentation), TXT, Markdown, complete Inkwell JSON backup — all real generated files via browser download, none are fake buttons. Print-ready PDF via a dedicated print stylesheet + `window.print()`.
❌ EPUB *export* is not implemented (see `docs/IMPORT_EXPORT.md` for the concrete plan — a hand-built zip/XML EPUB writer, reusing the same `jszip` dependency `mammoth`/`docx` already pull in).
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
queries, a plain-text (not rich-text) manuscript editor with debounced autosave, secure token storage
(`expo-secure-store`, not AsyncStorage), AppState-aware token refresh. Story bible, storyboard, timeline, AI
assistant, and an on-device local-first store are **not** built for mobile yet — mobile currently requires a
configured Supabase backend (no local-only fallback the way web has). **Not verified at all** — no
Expo/React Native toolchain, simulator, emulator, or device was available in this environment; written
carefully by hand, never typechecked or run. Treat as unverified, full stop.

## Phase 10 — Media, subscriptions
⚪ Not started. Schema (`media_assets`, `generation_jobs`, `entitlements`) exists and is RLS-protected, with
`entitlements` proven (in `tests/rls/run.ts`) to reject a client granting itself a paid plan — but no UI, no
media-provider interface code, and no payment integration exist yet. Correctly out of scope for this pass per
the brief's own phase ordering (media/subscriptions after core product).

## Phase 11 — Security, accessibility, performance, tests
✅ RLS/security isolation tests (13/13, see Phase 2) — the load-bearing security evidence for this whole project.
✅ Deno Edge Function typecheck + unit tests (`ai-assistant`, `account-delete`) — real, passing.
✅ Full-stack CI workflow written (`.github/workflows/ci.yml`): typecheck/unit-tests/build/secret-scan, the RLS
suite (Docker-based, as CI runners have a real daemon unlike this sandbox), Deno function typecheck+tests, the
Playwright e2e suite, and a Rust `cargo check` job with the exact Tauri Linux dependencies this repo verified
work. **Not run on an actual GitHub Actions runner** in this pass — YAML-validated and modeled directly on the
commands verified locally, but CI executing it for real is the first genuine test of the workflow itself.
🟡 Accessibility: semantic landmarks, labeled form fields, focus-visible styling, accessible dialogs (focus
trap, Escape-to-close, restore focus), keyboard-operable storyboard reordering (a real alternative to
drag-and-drop, not just a nod to the requirement), non-color status indicators, reduced-motion support.
**Not yet run through an automated accessibility checker** (axe or similar) — a concrete, well-scoped CI
addition, not done in this pass.
❌ Formal unit/integration coverage is real but partial — nowhere near exhaustive across every module in the
brief's testing matrix (100k-word fixture, two-device conflict, expired session, etc.). See `docs/TESTING.md`
for the itemized "what was and wasn't run" list.

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
its security model are complete and proven by 13 automated isolation tests against a real Postgres instance,
not just asserted. A full CI workflow, deployment/testing/security/privacy/cost documentation, and
professional-review-pending legal drafts all exist. What's honestly *not* yet true: no live Supabase project
has ever actually run this schema in production (Prod creds required to verify that), the real
(non-test) Anthropic-backed AI path is written and Deno-typechecked/unit-tested but not exercised against a
live model, sync is local-first-with-best-effort-push with revision-gated writes and a real conflict-resolution
UI now in place but unproven against a live multi-device session (only mocked-network unit tests so far — see
`docs/SYNC_AND_CONFLICTS.md`), and mobile is a genuine but narrow v0 (login + library + plain-text editor) that could not be run or
typechecked at all in this environment. Every one of those gaps is stated specifically, above, with a concrete
next step — not glossed over.

## Final verification pass (end of session)
Re-run immediately before this update, all green: shared-types/design-tokens/api-client/ai-contracts/web
typecheck, shared-types + web unit tests (17 tests), the RLS isolation suite (13/13, local-Postgres backend),
the Deno Edge Function typecheck + unit tests (3/3), the full Playwright golden-path e2e test, the production
web build, and `cargo check` on the desktop shell. Commands are listed in `docs/TESTING.md`.
