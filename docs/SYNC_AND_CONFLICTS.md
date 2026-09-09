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

## Conflict detection (what exists) vs. conflict resolution (what doesn't, yet)

Every syncable row that can be edited concurrently carries a `revision` integer, bumped on every local write.
**The mechanism for detecting a losing write exists at the schema level** — a real production sync
implementation would do `UPDATE ... WHERE id = ? AND revision = ?` and check whether zero rows were affected
(meaning someone else's write landed first), the standard optimistic-concurrency pattern.

**What's honestly not built in this pass**: `pushUpsert` today does a plain `upsert()`, not a
revision-gated conditional update — so as implemented, the *last* write to reach Supabase wins, silently. The
`revision` column is populated correctly and would support the real check without a schema change, but the
actual gated-write logic and the "someone else changed this — here's their version vs. yours, pick one" UI
are not implemented. This is the single most significant honestly-stated gap in the sync story — do not claim
two-device conflict resolution works. See `docs/IMPLEMENTATION_STATUS.md`.

**Concrete next step**: change `pushUpsert`'s Supabase call to `.update(row).eq("id", id).eq("revision",
row.revision - 1)`, check the returned row count, and on a zero-row result, fetch the server's current row
and surface a conflict dialog (options: keep mine as a new revision, take theirs, or view both side-by-side)
rather than silently overwriting.

## What was actually tested

- Offline writing: **Browser-verified** — the local-only mode itself proves writes succeed and persist with
  zero network at all (it's the permanent state of that mode, not a temporary offline condition).
- Reconnecting after offline: the queue-drain mechanism (`flushSyncQueue`) is implemented and unit-testable in
  isolation, but was not exercised end-to-end against a live Supabase project in this pass (no deployed
  project in this environment) — **Prod creds required** for that verification.
- Two-device conflicting edits: **not tested**, and per the gap above, not really meaningfully testable yet
  since the resolution UI doesn't exist — there's nothing to observe beyond "last write wins."

## Offline indicator

`SyncStatusPill` (`apps/web/src/components/ui/Feedback.tsx`) renders in the project sidebar
(`ProjectLayout.tsx`), driven by `onSyncStatusChange` — four states: synced, syncing, offline (saved locally),
error. This is real and reflects actual queue/network state, not a decorative placeholder.
