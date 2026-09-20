# Inkwell — Privacy & Data Flow

Accurate description of where data goes, not a legal privacy policy (see `docs/legal/PRIVACY_POLICY.md` for
the draft, which still needs professional legal review before publication).

## What Inkwell stores, and where

| Data                                          | Where                                                 | Encrypted in transit | Encrypted at rest                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Manuscript text, story bible, timeline, goals | Supabase Postgres (project's own database)            | Yes (TLS)            | Yes, by Supabase's infrastructure-level disk encryption — **not** end-to-end; Inkwell's backend can technically read it |
| Local working copy (autosave, offline queue)  | IndexedDB in the browser/desktop webview              | N/A (device-local)   | Depends on OS-level disk encryption, not app-controlled                                                                 |
| Session/refresh tokens (web/desktop)          | `localStorage`                                        | N/A (device-local)   | Not specially encrypted — standard browser storage                                                                      |
| Session/refresh tokens (mobile)               | OS Keychain/Keystore via `expo-secure-store`          | N/A (device-local)   | Yes, by the OS                                                                                                          |
| Uploaded media (portraits, covers)            | Supabase Storage                                      | Yes (TLS)            | Yes, infrastructure-level                                                                                               |
| AI conversation history                       | Supabase Postgres (`ai_conversations`, `ai_messages`) | Yes (TLS)            | Yes, infrastructure-level                                                                                               |

**Do not describe Inkwell as "end-to-end encrypted."** It is not. If that becomes a real requirement later,
it needs a genuine client-side encryption design (keys the server never sees) — a significant architecture
change, not a documentation change.

## What leaves Inkwell's own infrastructure, and to whom

1. **Anthropic** (`api.anthropic.com`), only when: (a) the author actively uses the AI Assistant, and (b) a
   real API key is configured (otherwise the deterministic test provider runs instead and nothing is sent
   anywhere). What's sent: the bounded context described in `docs/AI_ARCHITECTURE.md` (chapter summaries,
   retrieved scene excerpts, story-bible digest, timeline, canon facts, the author's question) — never the
   full manuscript, never another user's or another project's content. Per Anthropic's own API terms as of
   this writing, API inputs/outputs are not used to train Anthropic's models by default; verify this against
   Anthropic's current terms before publishing anything to users, since terms can change.
2. **Google Drive** (optional integration, not yet built — see `docs/IMPORT_EXPORT.md`): only manuscript
   content the author explicitly chooses to back up or export, only after the author explicitly connects the
   integration with minimum-necessary OAuth scopes.
3. **Media generation providers** (optional, not yet built — see media section of the product spec): only the
   specific description/context the author selects and explicitly requests be sent, never automatically.
4. **Crash reporting** (not yet configured — `SENTRY_DSN` in `.env.example` is a placeholder): when configured,
   must be verified to exclude manuscript text and other prose from crash payloads before enabling in
   production. This is a concrete pre-launch checklist item, not something to assume is safe by default.
5. **Nothing else.** No analytics vendor is wired into this codebase as of this document. If one is added
   later, it must not receive manuscript prose — see the checklist in `docs/LEGAL_REVIEW_CHECKLIST.md`.

## AI training opt-in

`profiles.ai_training_opt_in` exists in the schema, defaulting to `false`. **No UI currently reads or writes
this field** — there is no mechanism today by which a user's manuscript could be used for training even if
they wanted to opt in, because the opt-in flow itself isn't built. This is stated for accuracy: the column
existing is not the same as the feature being live. Do not represent "explicit, revocable opt-in" as
implemented until an actual opt-in UI, and a corresponding backend check gating any hypothetical
training-data export, both exist.

## Cross-project and cross-user isolation

Every table an AI request touches (`document_chunks`, `ai_conversations`, `ai_messages`) carries both
`project_id` and `user_id`, and Postgres RLS enforces both, proven in `tests/rls/run.ts`. This means a bug in
application code that forgets to filter by project would still be blocked by the database — isolation isn't
resting on "the code remembered to check," which is the property this section exists to document honestly.

## Data the author controls directly

- **Export**: DOCX/TXT/Markdown/complete-project-JSON-backup, all real generated files (`docs/IMPORT_EXPORT.md`).
- **Account-wide export**: Account Settings → "Export all my data" bundles every owned project's backup into
  one JSON file (`apps/web/src/features/settings/AccountSettingsPage.tsx`).
- **Deletion**: project deletion is soft (30-day recovery window, `deleted_items`), then presumed permanently
  purged after that window (the actual purge job/cron is not yet built — see `docs/OWNER_ACTIONS_REQUIRED.md`
  if this needs to be automated before launch). Account deletion (`supabase/functions/account-delete`) is
  immediate and cascades through every owned row via `ON DELETE CASCADE`.

## Retention

No automated retention/purge job exists yet for `deleted_items` past its `purge_after` timestamp, or for
`ai_usage`/`audit_events` past any particular age. Until one is built and scheduled (e.g., a `pg_cron` job or
a scheduled Edge Function), soft-deleted rows persist indefinitely rather than being hard-deleted after 30
days as the UI copy implies. Tracked as a concrete pre-launch item.
