# Inkwell — Testing

## What actually runs, today

| Suite | Command | What it proves | Verified |
|---|---|---|---|
| Shared-types unit tests | `pnpm --filter @inkwell/shared-types test` | Word/page/reading-time math, plain-text extraction from rich-text docs | ✅ Auto, passing |
| Web unit tests | `pnpm --filter @inkwell/web test` | Import chapter-detection, autosave/revision-history flow (via `fake-indexeddb`) | ✅ Auto, passing |
| RLS isolation suite | `pnpm test:rls` | 13 assertions proving cross-user/cross-project isolation against a real Postgres instance running the real migrations | ✅ Auto, passing (both Docker and local-Postgres backends — see `docs/DECISIONS.md`) |
| Edge Function tests | `deno test --config supabase/functions/deno.json --allow-env supabase/functions/ai-assistant/index.test.ts` | Provider fallback logic, period-month formatting | ✅ Auto, passing |
| Edge Function typecheck | `deno check --config supabase/functions/deno.json supabase/functions/ai-assistant/index.ts` (and `account-delete`) | Both functions typecheck against the real npm dependency graph Deno would actually run | ✅ Auto, passing |
| Playwright e2e | `npx playwright test --config tests/e2e/playwright.config.ts` | The full golden path in a real Chromium browser: create book → write → autosave → story bible → storyboard → timeline/goals → AI assistant → findings scan → exports → back to dashboard | ✅ Browser, passing |
| Desktop Rust compile | `cd apps/desktop/src-tauri && cargo check` | The Tauri 2 shell (menu, plugins, close guard) compiles cleanly against the real toolchain | ✅ Auto, passing, zero warnings |

## What was NOT run, and why (be specific, don't hand-wave)

- **A ≥100,000-word fixture manuscript.** Never created or loaded. The architecture (per-scene documents,
  cached plain-text/word-count columns, no whole-book re-serialization) is designed for this scale — see
  `docs/EDITOR_AND_AUTOSAVE.md` — but "designed for" is not the same claim as "measured at." Concrete next
  step: generate a realistic fixture (e.g., 40 chapters × 2,500 words) and profile editor input latency and
  autosave duration against it.
- **Two-device conflicting edits.** Requires the revision-gated conditional update this pass didn't implement
  — see `docs/SYNC_AND_CONFLICTS.md`. There's currently nothing to observe beyond "last write wins," so a test
  for it would be testing the wrong thing.
- **Live Anthropic API calls.** No API key was available in this environment. Every AI code path was exercised
  against the deterministic test provider instead — real for citation parsing, groundedness labeling, context
  budgeting, usage-tracking logic, findings persistence; **not** real for actual model reasoning quality. The
  provider swap point (`selectProvider` in the Edge Function) is a single function — swapping in a real key
  changes nothing else in the code path.
- **A deployed Supabase project.** No project exists in this environment. Auth flows, cloud sync, and the
  Edge Functions are code-reviewed and (for the functions) Deno-typechecked/unit-tested, but not exercised
  against a live Postgres+Auth+Functions stack end-to-end. **Prod creds required.**
- **Desktop app runtime** (`tauri dev`/`tauri build`). No display server in this sandbox, and full installer
  bundling needs `linuxdeploy`/`appimagetool`/code-signing tooling not installed here. Compile-verified only
  (see above).
- **Mobile app, at all.** No Expo/React Native toolchain, no simulator/emulator, no physical device. Written
  carefully but genuinely unverified — do not treat `apps/mobile` as tested in any sense beyond "a careful
  human read it."
- **Automated accessibility scan** (axe-core or similar). Manual accessibility practices were followed
  throughout (semantic landmarks, labeled form fields, `:focus-visible` styling, accessible dialogs with focus
  trap and Escape-to-close, keyboard-operable storyboard reordering as a real alternative to drag-and-drop,
  non-color status indicators, `prefers-reduced-motion` support) but never machine-checked.
- **Database migration tests** in the sense of "apply migration N-1, apply N, verify no data loss" — the RLS
  suite applies all migrations fresh each run, which proves they succeed in order and together, but doesn't
  specifically test an incremental upgrade path against pre-existing data.

## Test data used

`tests/rls/run.ts` seeds two synthetic users and one project ("Court of Nine Ravens") per run, and tears
everything down after. The Playwright e2e test creates one project via the real UI and does not seed fixture
data outside what a real user action produces. The onboarding "sample project" (`apps/web/src/lib/sampleProject.ts`)
reuses the original prototype's "The Lighthouse Keeps" content — real, but not a stress-test fixture (2
chapters, 2 characters, 3 timeline events).

## Running everything locally

```bash
pnpm install
pnpm --filter @inkwell/shared-types test
pnpm --filter @inkwell/web test
pnpm --filter @inkwell/web typecheck
pnpm test:rls                      # needs Docker (or RLS_TEST_BACKEND=local, see docs/DECISIONS.md)
cd supabase/functions && deno test --config deno.json --allow-env ai-assistant/index.test.ts
npx playwright test --config tests/e2e/playwright.config.ts
cd apps/desktop/src-tauri && cargo check
```
