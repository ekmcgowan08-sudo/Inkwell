# CLAUDE.md — instructions for Claude Code working in this repo

Read this fully before making changes. Also read `docs/IMPLEMENTATION_STATUS.md` (what's actually done vs not),
`docs/DECISIONS.md` (why things are the way they are), and `docs/ARCHITECTURE.md` (the big picture) before starting
non-trivial work.

## What this is

Inkwell — an all-in-one writing studio for long-form fiction authors. See `PRODUCT.md` for the product vision.

## Repo layout

```
apps/
  web/         React + TypeScript + Vite. The shared frontend — runs standalone in a browser/PWA,
               and is what apps/desktop wraps with Tauri. Mobile (apps/mobile, not yet scaffolded
               as of writing) will be Expo/React Native, reusing packages/* but not apps/web's UI.
  desktop/     Tauri 2 shell around apps/web's build output (once scaffolded).
packages/
  shared-types/   Zod schemas + TS types mirroring supabase/migrations. Source of truth for the
                  domain model on the client side.
  design-tokens/  Colors/type/spacing as both TS constants and CSS custom properties.
  ai-contracts/   AI request/response contracts, prompt builder, pricing table, the LLMProvider
                  interface, the deterministic test provider, and (server-only) the Anthropic
                  provider. NEVER import the Anthropic provider from apps/web or apps/mobile.
  api-client/     Thin Supabase client factory shared by web/desktop/mobile.
supabase/
  migrations/     Numbered SQL files, source of truth for the schema and RLS policies.
  functions/      Edge Functions (Deno). This is the ONLY place the Anthropic API key may live.
tests/
  rls/    Automated RLS isolation proof suite — spins up a real Postgres, applies real migrations,
          proves cross-user/cross-project isolation. Run with `pnpm test:rls`.
  e2e/    Playwright end-to-end tests against the local-only build.
docs/     Everything else you need — see the list in the repo root instructions / README.
```

## Before you touch the schema

1. Every new table needs RLS enabled and explicit policies (or a documented reason it has none, like
   server-only-write tables — see the comments in `supabase/migrations/0008_ai.sql` for the pattern).
2. Add a matching zod schema + type to `packages/shared-types/src/entities.ts`.
3. Add or update the local Dexie table in `apps/web/src/lib/db.ts` if the web app needs to read/write it.
4. Re-run `pnpm test:rls` (or `RLS_TEST_BACKEND=local pnpm test:rls` — see below) and add isolation
   assertions for the new table if it's project- or user-scoped.
5. Update `docs/DATA_MODEL.md`.

## Running things

```bash
pnpm install
pnpm --filter @inkwell/web dev          # http://localhost:5173, local-only mode (no .env needed)
pnpm --filter @inkwell/web build        # production build
pnpm --filter @inkwell/web test         # vitest unit tests
pnpm test:rls                           # RLS isolation suite (needs Docker) — see below for sandboxes
npx playwright test --config tests/e2e/playwright.config.ts   # e2e smoke test
```

### RLS tests without a Docker daemon
Some sandboxed environments have a `docker` client but no running daemon. `tests/rls/run.ts` falls back to a
locally-installed Postgres server when `RLS_TEST_BACKEND=local` is set (needs `postgresql` + `psql` on PATH,
listening on 5432 with a `postgres`/`postgres` superuser). CI and normal dev machines should just use the
Docker default. Don't "fix" this by weakening the test — see `docs/DECISIONS.md` for why both paths exist.

### Playwright browser path
If `/opt/pw-browsers/chromium` doesn't exist in your environment, either run `npx playwright install chromium`
normally, or set `PLAYWRIGHT_CHROMIUM_PATH` before running the e2e config.

## Hard rules (do not weaken these to make something "work")

- **No Anthropic API key, Supabase service-role key, or system prompt internals in any client bundle**
  (`apps/web`, `apps/desktop`, `apps/mobile`). Server-side only, inside `supabase/functions/`.
- **No hardcoded historical model id.** Read `ANTHROPIC_MODEL` from env; the fallback constant in
  `packages/ai-contracts/src/providers/anthropicProvider.ts` should be updated only after checking current
  Anthropic docs, not from memory.
- **Every project-scoped table needs RLS**, and it needs to actually be tested in `tests/rls/run.ts`, not just
  asserted in a comment.
- **Local-first, debounced persistence in the editor.** Never wire a database write to every keystroke — see
  `docs/EDITOR_AND_AUTOSAVE.md` before changing autosave behavior.
- **Never overwrite an existing project silently on import.** Import always creates a new project (or, if you
  build "import into existing project" later, requires an explicit confirm step).
- **Don't claim something works if it wasn't verified in this environment.** Use the verification-level
  language from `docs/IMPLEMENTATION_STATUS.md` (Auto / Browser / Desktop / Sim / Device / Prod creds) and be
  precise about which one applies. If you can't run it, say so.

## Continuing this work

`docs/IMPLEMENTATION_STATUS.md` has an exact phase-by-phase breakdown of what's done, partial, or not started,
plus the honest gaps within things marked "done". `docs/OWNER_ACTIONS_REQUIRED.md` lists the handful of things
that need the human owner specifically (accounts, credentials, payment, legal review) — everything else, keep
going autonomously and update these docs as you land material changes.
