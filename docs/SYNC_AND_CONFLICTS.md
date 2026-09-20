# Inkwell — Sync & Conflicts

## Local-first, always

IndexedDB (Dexie, `apps/web/src/lib/db.ts`) is the source of truth the app reads from and writes to
immediately. Supabase is a sync target the app pushes to and pulls from, never something the UI blocks on.
This is true for every entity, not just the manuscript — projects, story bible, storyboard, timeline, goals
all follow the same pattern via their respective repo files in `apps/web/src/lib/repos/`.

## The push path

`apps/web/src/lib/sync.ts`:

1. A repo function writes to Dexie (always succeeds, local, synchronous).
2. It calls `pushUpsert(table, id, row)`, which:
   - No-ops entirely in local-only mode (nothing configured to sync to).
   - Converts the camelCase row to snake_case (`toSnakeRow`, `@inkwell/shared-types`) and attempts
     `supabase.from(table).upsert(row)`.
   - On success: sync status → `"synced"`.
   - On failure (offline, or a real error): the mutation is written to a local `syncQueue` Dexie table and
     sync status → `"offline"` or `"error"`.
3. `flushSyncQueue()` drains that queue — called on the browser's `online` event, and every 30 seconds as a
   fallback. Each queued item is retried; successes are removed, failures get an incremented `attempts`
   counter and stay queued.

## Conflict detection and resolution (implemented)

Every syncable row that can be edited concurrently carries a `revision` integer. `pushUpsert` now does a
revision-gated conditional write, not a plain `upsert()`:

1. A row's first-ever push (`revision === 0`, nothing to gate against yet) is a plain upsert.
2. Every later push does `.update(row).eq("id", id).eq("revision", row.revision - 1).select("id")` — the
   standard optimistic-concurrency check. If that matches a row, the write succeeded and nobody else's write
   landed first.
3. A zero-row result is ambiguous on its own — it could mean the row simply isn't on the server yet (e.g. it
   was queued while offline before its first sync), or that another device's write landed first. `sync.ts`
   tells the two apart with a follow-up `select("*")`: no server row → plain insert; a server row whose
   revision has moved on → a real conflict.
4. A real conflict is recorded in the local `syncConflicts` Dexie table (never silently overwritten) and
   surfaced to the author via `SyncStatusPill` (status `"conflict"`) → `SyncConflictsDialog`
   (`apps/web/src/components/sync/SyncConflictsDialog.tsx`), which shows the fields that actually differ
   between "this device" and "the other device" and offers **Keep this device's version** or **Keep the
   other version**.
   - _Keep mine_ (`resolveConflictKeepMine`) re-pushes the local row one revision past the server's current
     revision (so the gated write succeeds this time) and updates the local Dexie copy's revision to match,
     so the next local edit stays correctly numbered.
   - _Keep theirs_ (`resolveConflictKeepTheirs`) overwrites the local Dexie row with the server's version and
     drops the now-superseded queued write.
5. `flushSyncQueue` runs the same gated logic for queued retries, so a conflict discovered on reconnect is
   recorded exactly the same way as one discovered on a live push.

Rows whose schema doesn't carry a `revision` field (e.g. `relationships`, `storyboard_cards`,
`timeline_events`, `goals`, `daily_progress` — see `packages/shared-types/src/entities.ts`) fall back to a
plain upsert, same as before; gating only applies where the schema actually tracks a revision
(`projects`, `chapters`, `scenes`, `story_bible_entries`).

**A prerequisite this pass also had to fix**: `revision` was populated at creation but was only ever bumped
for `scenes` (via `autosaveScene`/`restoreRevision`) — `updateProject`, `updateEntry` (story bible),
`renameChapter`, and `reorderChapters` wrote back the full row without incrementing it, which would have made
gating a no-op for every entity except scenes. All four now bump `revision` on every mutation; see
`apps/web/src/lib/repos/projects.test.ts`, `storyBible.test.ts`, and the rename/reorder case in
`manuscript.test.ts`.

## What was actually tested

- Offline writing: **Browser-verified** — the local-only mode itself proves writes succeed and persist with
  zero network at all (it's the permanent state of that mode, not a temporary offline condition).
- Revision gating and conflict recording/resolution: **Auto-verified** — `apps/web/src/lib/sync.test.ts`
  exercises `pushUpsert`/`conditionalUpsert` against a mocked Supabase client covering first-push (ungated),
  gated success, a genuine conflict (zero rows matched + server row present), the "not synced yet" case (zero
  rows matched + no server row), and both resolution paths. This proves the logic against a mocked network
  boundary, not a live two-device session.
- Reconnecting after offline: the queue-drain mechanism (`flushSyncQueue`) is implemented and unit-testable in
  isolation, but was not exercised end-to-end against a live Supabase project in this pass — **Prod creds
  required** for that verification.
- Two real devices editing the same row concurrently against a live Supabase project: **not tested** — this
  needs a live deployed project and two real sessions, which this environment cannot produce. The logic and
  UI are real and unit-tested against a simulated conflict, not observed end-to-end on live infrastructure.

## Offline indicator

`SyncStatusPill` (`apps/web/src/components/ui/Feedback.tsx`) renders in the project sidebar
(`ProjectLayout.tsx`), driven by `onSyncStatusChange` — four states: synced, syncing, offline (saved locally),
error. This is real and reflects actual queue/network state, not a decorative placeholder.
