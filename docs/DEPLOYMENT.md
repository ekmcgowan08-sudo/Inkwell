# Inkwell — Deployment

## Local development (works today, zero configuration)

```bash
git clone <repo>
cd Inkwell
pnpm install
pnpm --filter @inkwell/web dev
```

Open <http://localhost:5173>. No `.env` needed — the app detects the missing Supabase config and runs in
**local-only mode**: a stable pseudo-user, everything in IndexedDB, AI Assistant backed by the deterministic
test provider. This is genuinely usable, not a degraded demo — every module works.

## Standing up a real backend (Supabase)

1. Install the Supabase CLI (<https://supabase.com/docs/guides/cli>).
2. From the repo root: `supabase start` — this reads `supabase/config.toml` and brings up local Postgres,
   Auth, Storage, and Edge Functions via Docker. First run applies every migration in
   `supabase/migrations/` in order.
3. Copy `.env.example` to `.env`, fill in `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from `supabase start`'s
   output (or `supabase status`).
4. Copy `.env.example`'s Edge Function section into `supabase/functions/.env` (git-ignored), filling in at
   minimum `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (all from `supabase status`), and
   `ANTHROPIC_API_KEY` if you want real AI responses instead of the test provider.
5. `supabase functions serve ai-assistant --env-file supabase/functions/.env` (and `account-delete` similarly)
   to run them locally.
6. Restart `pnpm --filter @inkwell/web dev` — the app now runs in cloud mode against your local Supabase
   stack: real auth, real Postgres persistence, real sync.
7. Optional: sign up a dev account through the app, then `SEED_USER_EMAIL=you@example.com pnpm seed` populates
   it with a fully-written sample project ("The Lighthouse Keeps" — the same content local-only mode's
   onboarding seeds into IndexedDB) directly via `pg` against `DATABASE_URL` (defaults to the Supabase CLI's
   standard local connection string). This is a trusted, local-dev-only script — it reads `auth.users`
   directly and bypasses RLS by connecting as the Postgres superuser, which is fine on your own machine and
   never something to point at a hosted project. See `scripts/seed.ts`.

## Deploying to a real (hosted) Supabase project

1. Create a project at <https://supabase.com/dashboard> (owner action — see `docs/OWNER_ACTIONS_REQUIRED.md`).
2. `supabase link --project-ref <ref>`, then `supabase db push` to apply every migration to the hosted
   database.
3. `supabase functions deploy ai-assistant` and `supabase functions deploy account-delete` — the CLI bundles
   each function's full dependency graph, including the relative imports into `packages/shared-types` and
   `packages/ai-contracts` (see `supabase/functions/import_map.json`), so nothing needs to be duplicated or
   pre-built.
4. Set the deployed functions' secrets (`supabase secrets set ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=...` etc.)
   — **never** commit these; `supabase/functions/.env` is git-ignored specifically for this.
5. Point `apps/web`'s production `.env` (or your hosting provider's environment variables) at the hosted
   project's URL and anon key.
6. Configure Supabase Auth's site URL and redirect URLs (Dashboard → Authentication → URL Configuration) to
   match your deployed web app's real domain — required for email confirmation and password-reset links to
   work.

## Deploying the web app itself

`apps/web` is a standard Vite SPA (`pnpm --filter @inkwell/web build` → `apps/web/dist/`). Any static host that
serves an SPA with a catch-all rewrite to `index.html` works (Vercel, Netlify, Cloudflare Pages, a plain
nginx config). No server-side rendering is used or required.

**Installable as a PWA**: `vite-plugin-pwa` (`apps/web/vite.config.ts`) generates a web app manifest
(`manifest.webmanifest`) and a Workbox service worker on every production build. `registerType: "autoUpdate"`
means a new deploy's service worker takes over automatically on next load, no user prompt. Deliberately no
`runtimeCaching` rules — Workbox precaches only this build's own JS/CSS/HTML/icons (confirmed by inspecting
the generated `dist/sw.js`), never Supabase auth/API requests, so cloud sync behavior is unaffected by the
service worker either way. Verified against a real production build: `manifest.webmanifest` and `sw.js` serve
correctly from `vite preview`, and a real Chromium instance (via Playwright) confirms the manifest `<link>`
resolves and the service worker actually registers and activates. Icons
(`apps/web/public/icons/icon-{192,512}.png`, `apple-touch-icon.png`, `favicon-32.png`) reuse the same
ink-navy/gold mark already used for the desktop and mobile app icons — see
`docs/OWNER_ACTIONS_REQUIRED.md` for real branding, which hasn't been commissioned yet.

## Desktop builds

```bash
cd apps/desktop
pnpm install
pnpm tauri build
```

Requires the Tauri system dependencies for your OS (Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, etc. — see
`.github/workflows/ci.yml`'s `desktop-rust-check` job for the exact package list this repo verified against;
macOS: Xcode Command Line Tools; Windows: the WebView2 runtime, usually already present). Produces platform
installers per `tauri.conf.json`'s `bundle.targets` (`.deb`/`.AppImage` on Linux, `.msi`/NSIS on Windows,
`.dmg`/`.app` on macOS). **Code signing is not configured** — unsigned builds will trigger OS security warnings
on install; see `docs/STORE_SUBMISSION.md` and `docs/OWNER_ACTIONS_REQUIRED.md` for what a real release needs.

## Mobile builds

```bash
cd apps/mobile
pnpm install
cp .env.example .env   # fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — required, no local-only mode on mobile yet
eas build --profile preview --platform ios      # or android
```

Requires an Expo/EAS account and, for iOS, an Apple Developer Program membership (owner actions). `eas.json`
lays out `development`/`preview`/`production` build profiles and a `submit` block with placeholder Apple/Google
identifiers an owner must fill in.

## What this environment could and couldn't verify

This sandbox has no display server, no Docker daemon (worked around for RLS tests, see `docs/DECISIONS.md`),
no Expo/RN toolchain, and no code-signing credentials. Everything above was written from the real, current
tool documentation and cross-checked against what did successfully run here (Rust compiles, Deno functions
typecheck and pass their tests, the web app builds and passes a full browser e2e test) — but the deployment
steps themselves were not executed end-to-end against a live Supabase project or a real app store. Treat this
document as accurate instructions, not as a claim that deployment was rehearsed.
