# Inkwell

An all-in-one writing studio for long-form fiction authors — manuscript, story bible, storyboard, timeline,
and a project-scoped AI assistant that remembers your story, in one trusted workspace, across web, desktop,
and (in progress) mobile.

See `PRODUCT.md` for the product vision, `docs/ARCHITECTURE.md` for the technical architecture and why it was
chosen, and `docs/IMPLEMENTATION_STATUS.md` for an honest, phase-by-phase account of what's actually built and
verified today vs. planned.

## Quick start

```bash
pnpm install
pnpm --filter @inkwell/web dev
```

Open <http://localhost:5173>. No configuration needed — with no `.env` file, the app runs in **local-only
mode**: everything persists to IndexedDB in your browser, no account required, and the AI Assistant runs
against a deterministic test provider instead of a real model. Every feature works in this mode; it's a real
app, not a limited demo.

To connect a real backend (Supabase + a real Anthropic-backed AI Assistant), see `docs/DEPLOYMENT.md`.

## Repository layout

```
apps/web/       React + TypeScript + Vite — the shared frontend (browser/PWA, and what desktop wraps)
apps/desktop/   Tauri 2 desktop shell around apps/web (macOS, Windows, Linux)
apps/mobile/    Expo/React Native (iOS, Android) — v0 scaffold, see docs/IMPLEMENTATION_STATUS.md
packages/       Shared TypeScript: domain types+validation, design tokens, AI contracts, Supabase client
supabase/       Postgres migrations (with Row Level Security) and Deno Edge Functions
tests/          RLS isolation proof suite (tests/rls/) and Playwright e2e (tests/e2e/)
docs/           Architecture, security, AI design, testing, deployment, cost, and legal-draft documentation
```

## Testing

```bash
pnpm --filter @inkwell/web test        # unit tests
pnpm test:rls                          # RLS isolation proof suite (needs Docker — see docs/DECISIONS.md)
npx playwright test --config tests/e2e/playwright.config.ts   # full golden-path browser test
```

Full detail, including exactly what has and hasn't been verified in what way: `docs/TESTING.md`.

## Continuing development

Start with `CLAUDE.md`. If you're picking this up fresh: read `docs/IMPLEMENTATION_STATUS.md` for exact
current state, `docs/DECISIONS.md` for why things are the way they are, and `docs/OWNER_ACTIONS_REQUIRED.md`
for the (short) list of things that need a human with real credentials rather than more engineering.
