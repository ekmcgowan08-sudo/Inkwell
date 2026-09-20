# Inkwell — Editor & Autosave

## The write path

1. Tiptap (`apps/web/src/features/manuscript/ManuscriptPage.tsx`) holds the live document in memory.
2. On every edit, `onUpdate` fires — this does **not** write to storage. It sets a "Saving…" indicator and
   (re)starts a 1.5s idle debounce timer.
3. When the timer fires (or the author switches scenes/chapters, which calls `flushNow()` immediately),
   `autosaveScene` (`apps/web/src/lib/repos/manuscript.ts`) runs:
   - Extracts plain text (`extractPlainText`) and a word count from the ProseMirror JSON.
   - Writes the scene row to IndexedDB (Dexie) — **this is the actual "save"**, and it's local, synchronous
     with the debounce, and doesn't depend on any network.
   - Bumps `scene.revision` by 1.
   - Appends a row to `documentRevisions` (Dexie table mirroring `document_revisions` in Postgres) with the
     new content, tagged `createdBy: "autosave"`.
   - Recomputes the parent chapter's cached word count.
   - Fires a best-effort push to Supabase (`pushUpsert`, `apps/web/src/lib/sync.ts`) — see
     `docs/SYNC_AND_CONFLICTS.md` for what happens if that fails.

**Never a write per keystroke.** The debounce is the whole point — verified in
`apps/web/src/lib/repos/manuscript.test.ts` and live in the Playwright golden-path test (types a full
sentence, waits for the debounce, then asserts on the persisted word count and revision number).

## Crash / bad-connection recovery

Because the debounced write lands in IndexedDB regardless of network state, a crash or connection loss can
only ever lose the last <1.5s of unsaved keystrokes — never anything already through one debounce cycle. On
reopening the app, the editor reads the current scene row straight from Dexie, which already has the last
autosaved state.

`document_revisions` is **append-only** (no client update/delete policy in Postgres, see `docs/DATA_MODEL.md`)
— every autosave is a recoverable point in history, not just the current state. The Versions & Backups page
(`apps/web/src/features/project/VersionsPage.tsx`) lists these, lets the author preview any prior revision's
plain text, and restore it — which itself creates a **new** revision rather than rewriting history, so a bad
restore is itself recoverable.

## Word/page/reading-time estimates

`packages/shared-types/src/text.ts` — `countWords`, `estimatePageCount` (275 words/page, standard manuscript
format), `estimateReadingMinutes` (238 wpm silent reading average). Used identically by the editor's live
counters, the dashboard's progress bars, and the AI context budgeter, so the numbers agree everywhere.

## "Words written today" — the daily baseline mechanism

Replaces the prototype's session-only calculation entirely. See `apps/web/src/lib/repos/storyboardTimeline.ts`
`recordWordsWrittenToday`: the first time a given calendar day (local timezone) sees this project — called on
project open _and_ after every autosave — the current total word count is captured as that day's baseline in
a local-only Dexie table (`dailyBaselines`, never synced). "Words today" is then always `currentTotal -
baseline`.

**Known limitation, stated plainly**: if a device isn't opened for a project until partway through a writing
session that started elsewhere that same day, the baseline is captured late and under-counts. Acceptable for
v1 (see `docs/DECISIONS.md`); revisit if it proves confusing.

## Responsiveness at scale

The architecture is designed for large manuscripts: each **scene** (not the whole book) is its own document
and its own debounce/save cycle, so editing chapter 40 of a 100k-word book never re-serializes chapters 1–39.
Plain-text extraction and word counts are cached (`plainText`, `wordCount` columns), never recomputed by
re-parsing the whole document tree on the hot path.

**Measured**: `tests/e2e/performance.spec.ts` builds a real 40-chapter/~100,203-word fixture, imports it
through the actual import UI in a real Chromium browser, and times chapter-switching and typing/autosave —
both stay flat regardless of total book size (switching to chapter 40 of 40 costs about the same as chapter
1; autosave settle time tracks the fixed debounce, not manuscript length). See `docs/TESTING.md` for the
actual numbers and what this measurement does and doesn't cover.

## Focus mode

A pure UI state toggle (`ManuscriptPage`'s `focusMode`) that hides the chapter sidebar, app sidebar, and
toolbars via a CSS class (`.iw-ms-focus`, `apps/web/src/styles/manuscript.css`) — no data-layer implications.

## What's not built yet

- **Chapter drag-and-drop reordering** in the manuscript sidebar specifically (storyboard has this in full;
  the manuscript chapter list does not — a real, stated gap).
- **Conflict-resolution UI** for a losing concurrent write from a second device — the underlying
  optimistic-concurrency mechanism (`revision` column) exists and is used server-side, but nothing in the UI
  yet surfaces "someone else changed this, pick a version" to the author. See `docs/SYNC_AND_CONFLICTS.md`.
