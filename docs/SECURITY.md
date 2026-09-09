# Inkwell — Security

This document describes what is actually implemented and verified, distinct from what is planned. If you're
deciding whether to trust a claim in here, check `docs/IMPLEMENTATION_STATUS.md` for its verification level.

## Row Level Security

Every table in `supabase/migrations/` that holds user- or project-owned data has RLS enabled with explicit
`select`/`insert`/`update`/`delete` policies (or, for a handful of server-only-write tables, deliberately no
client insert/update policy at all — see `docs/DATA_MODEL.md` "Server-only write paths"). There is no table
with RLS enabled and zero policies by accident, and no table holding user data with RLS disabled.

**This is proven, not just asserted.** `tests/rls/run.ts` applies the real migrations to a real Postgres
instance and runs 13 assertions impersonating two different users via `request.jwt.claims` (the same mechanism
PostgREST uses in production):

- User B cannot `SELECT` user A's project, chapters, scenes, or story-bible entries.
- User B's `UPDATE`/`DELETE` against user A's rows silently affect 0 rows (not an error — RLS makes them
  invisible, which is the correct default-deny behavior for those verbs).
- User B cannot attach their own project to user A's series (closes an IDOR path via a `CHECK` constraint, not
  just RLS).
- AI conversations, messages, and indexed `document_chunks` for one project are invisible to a different user
  entirely, even when both carry `project_id` — proven with two different users, not just two different
  projects owned by the same person.
- A client cannot insert directly into `ai_messages` (server-only write path) or grant itself a paid
  `entitlements` row (no client insert/update policy exists for that table at all).
- Deleted-item recovery entries (`deleted_items`) are private per user.

Run it yourself: `pnpm test:rls` (or `RLS_TEST_BACKEND=local pnpm test:rls` in a Docker-less sandbox — see
`docs/DECISIONS.md`).

## No privileged key ever reaches a client

- The Anthropic API key lives only in `supabase/functions/.env` / the deployed function's secrets. It is never
  referenced from `apps/web`, `apps/desktop`, or `apps/mobile`. `packages/ai-contracts/src/providers/anthropicProvider.ts`
  is not re-exported from that package's public barrel, specifically to make it awkward to accidentally import
  from a client.
- The Supabase **service-role** key (which bypasses RLS) is used only inside Edge Functions
  (`supabase/functions/_shared/supabaseClients.ts` → `createServiceClient`), never in any client bundle. Every
  service-role write in `ai-assistant/index.ts` is preceded by an explicit ownership check performed through a
  separate, RLS-scoped client authenticated as the caller — the service role is never trusted to "just know"
  a write is safe.
- The Supabase **anon** key is safe to ship in `apps/web`'s bundle (`VITE_SUPABASE_ANON_KEY`) — it identifies
  the project, not a privileged principal; RLS is what actually protects data, per Supabase's own security
  model.

## Token storage

- **Web/desktop**: `window.localStorage`, via the Supabase JS SDK's own session-persistence mechanism
  (`packages/api-client/src/client.ts`). This is standard for a web session but is not hardware-backed —
  acceptable for a browser context, and no different from how most web apps handle sessions.
- **Mobile**: `expo-secure-store` (`apps/mobile/lib/supabase.ts`), which uses the iOS Keychain / Android
  Keystore — explicitly chosen over AsyncStorage (which stores in the clear) for exactly this reason.

## Rate limiting, usage control, and abuse prevention

- The AI Edge Function checks a monthly token allowance (`entitlements.ai_monthly_token_allowance` vs. summed
  `ai_usage`) before calling the provider. **This is a coarse control, not a sliding-window rate limiter** —
  documented explicitly in `docs/AI_ARCHITECTURE.md` as a known gap, not silently omitted.
- Request bodies are validated with zod (`assistantRequestSchema`) before any processing — rejects malformed
  input rather than passing it through.
- File imports are limited to `.txt`/`.md` today (see `docs/IMPORT_EXPORT.md`); there is no arbitrary file
  execution path anywhere in the import flow (plain text is read and parsed, never evaluated).

## What is explicitly NOT implemented yet (be honest about this)

- **A sliding-window / per-minute rate limiter** for the AI Edge Function beyond the monthly allowance check.
- **Multi-factor authentication.** Supabase Auth supports TOTP MFA natively; the UI in `apps/web` does not yet
  expose it.
- **Biometric app lock on mobile.** Planned (spec requirement), not built in this pass.
- **A formal, tooled accessibility audit** (e.g., automated `axe-core` scan in CI). Manual accessibility
  practices are followed (see `docs/TESTING.md`) but not yet machine-verified.
- **End-to-end encryption of manuscript content.** Data is encrypted in transit (TLS to Supabase) and at rest
  by Supabase's underlying Postgres/Storage encryption — this is standard "encrypted at rest by the
  infrastructure provider," not client-side/end-to-end encryption where Inkwell itself cannot read the
  plaintext. **Do not describe this product as "end-to-end encrypted" anywhere** (marketing copy, App Store
  listing, etc.) unless that changes — see `docs/PRIVACY_DATA_FLOW.md`.

## Audit logging

`audit_events` (RLS: read-your-own only, written exclusively via `SECURITY DEFINER`/service-role paths) is the
audit trail for security-sensitive actions. `account-delete` writes to it before deleting the account (so the
record survives the user row itself, via `ON DELETE SET NULL`). Other security-sensitive actions (export
creation, integration connect/disconnect) have the table ready to receive audit rows; not every one of those
call sites writes to it yet in this pass — a concrete follow-up, not a design gap.

## Reporting a vulnerability

This is a project repository, not yet a live product with a public security-disclosure process. Once a
production deployment exists, add a `SECURITY.md` disclosure contact and update this section — track it in
`docs/OWNER_ACTIONS_REQUIRED.md` until then.
