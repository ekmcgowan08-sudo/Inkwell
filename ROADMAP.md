# Inkwell — Roadmap

Ordered roughly by leverage: highest-value, best-scoped next steps first. See `docs/IMPLEMENTATION_STATUS.md`
for the full current-state detail behind each item.

## Next up (well-scoped, no open design questions)

1. ~~**Revision-gated sync writes + conflict-resolution UI.**~~ **Done.** `pushUpsert` now does a
   revision-gated conditional update (falling back to plain insert for a row's first push or one that isn't
   on the server yet), records a genuine conflict instead of silently overwriting, and
   `SyncConflictsDialog` lets the author pick "keep mine" or "keep theirs". Unit-tested against a mocked
   Supabase client (`apps/web/src/lib/sync.test.ts`); not yet exercised against a live two-device session.
   See `docs/SYNC_AND_CONFLICTS.md`.
2. ~~**Full-text-search-ranked AI retrieval.**~~ **Done.** `search_scenes_ranked` /
   `search_story_bible_entries_ranked` (migration 0011, `SECURITY INVOKER`) rank matches with `ts_rank`
   against the author's question, falling back to the old recency sample when nothing matches. Unit-tested
   against a mocked Supabase client and proven RLS-safe in `tests/rls/run.ts`; not yet exercised against a
   live project with real manuscript content. See `docs/AI_ARCHITECTURE.md`.
3. ~~**DOCX import**~~ **Done.** `mammoth.js` converts to HTML client-side; Word's Heading 1/2/3 styles map
   to `#`/`##`/`###` and feed the existing `detectChapters` pipeline unchanged, so a DOCX chapter is caught
   by either its Word heading style or its heading text. Unit-tested against a mocked mammoth (see
   `docs/IMPORT_EXPORT.md` for exactly why real docx parsing isn't re-verified in the test); not yet manually
   tried against a real Word file in a browser.
4. ~~**EPUB export**~~ **Done.** Hand-built EPUB 3 (OCF container, OPF manifest/spine, nav document) via
   `jszip`, reusing the same `plainText` extraction every other export format uses. Unit-tested and validated
   against the real official `epubcheck` 5.1.0 — 0 errors/warnings on a generated file. Not yet opened in an
   actual e-reader app.
5. ~~**A real ≥100k-word fixture manuscript**~~ **Done.** `tests/e2e/fixtures/generateManuscriptFixture.ts`
   generates a deterministic 40-chapter/~100,203-word manuscript; `tests/e2e/performance.spec.ts` imports it
   through the real UI in a real Chromium browser and measures import/chapter-switch/typing+autosave latency.
   Passing, with real numbers in `docs/TESTING.md` — chapter-switch and autosave settle time stay flat
   regardless of book size, as the architecture intended.
6. ~~**Manuscript chapter drag-and-drop reordering**~~ **Done.** Mirrors the storyboard's dnd-kit pattern
   (pointer drag + keyboard-accessible up/down buttons), wired to the previously-unused `reorderChapters`.
7. **Deploy a real Supabase project** and run every currently-code-reviewed-but-unexercised path (auth
   flows, cloud sync, both Edge Functions) against it for the first time.

## Medium-term

- Series-level AI continuity scope (contract and schema exist; no UI toggle yet).
- Automated conversion of AI Assistant consistency-check answers into persisted `ai_findings` (needs a
  scheduled job).
- Sliding-window AI rate limiting beyond the current monthly-allowance check.
- Google Drive integration (backup/export/import to a connected Drive folder).
- Media generation (character portraits, location concepts, cover concepts) — schema and architecture are
  ready; needs a provider decision and UI.
- Mobile: story bible, storyboard, timeline, and AI assistant screens (only Library + a plain-text manuscript
  editor exist today); an on-device local-first store for offline mobile writing.
- Subscription/entitlement UI and real payment integration (Stripe, Apple IAP, Google Play Billing) — schema
  supports it, nothing is wired to a real payment processor.
- ~~Automated accessibility scanning (axe-core) in CI.~~ **Done.** `tests/e2e/accessibility.spec.ts`
  (`@axe-core/playwright`) scans every core screen; found and fixed two real violations (unlabeled Tiptap
  editor, unlabeled send button), now passing with 0 violations. Runs automatically in the existing e2e CI
  job. Doesn't replace real screen-reader testing.
- ~~PWA manifest/service worker for installable-web-app support.~~ **Done.** `vite-plugin-pwa`
  (`generateSW`, `registerType: "autoUpdate"`), a manifest, and reused desktop/mobile-matching icons.
  Deliberately precaches only the app's own build output (no `runtimeCaching`, confirmed by inspecting the
  generated service worker), so Supabase auth/API traffic is untouched. Verified against a real production
  build with a real Chromium instance — manifest resolves, service worker registers and activates.

## Longer-term / needs a product decision first, not just engineering

- Real-time collaboration (multiple authors on one project) — no current requirement for this, not
  architected either way.
- Custom user-defined field *definitions* per project (the `custom_field_defs` table exists; freeform
  notes/tags cover the "don't over-structure" need today, but true admin-defined structured fields are a
  separate feature).
- Automated dropped-plot-thread suggestions surfaced proactively (today, findings require the author to click
  "Run consistency scan" or ask the AI Assistant directly — nothing runs unprompted, which is a deliberate
  choice per the "no provider request without user initiation" requirement, but a lighter-weight local nudge
  could be designed without violating that).

## Explicitly not planned

- End-to-end encryption is not on this roadmap as a near-term item — it's a significant architecture change
  (client-side key management) that should follow a real product decision, not be assumed.
