# Inkwell — Owner Actions Required

Everything below is genuinely non-delegable — it requires a human with identity, a payment method, or legal
authority. Everything else in this product was built without asking. This is the consolidated list; check
items off as you complete them (this file is meant to be edited).

## 1. Backend — Supabase project

- [ ] Create a Supabase account and project at <https://supabase.com/dashboard> (a credit card is required
      once you exceed the free tier, not to create the project itself).
- [ ] Run `supabase link --project-ref <ref>` and `supabase db push` to apply the schema (`supabase/migrations/`).
- [ ] Copy the project's URL, anon key, and service-role key into your deployment environment's secrets —
      **never** into a committed `.env` file. `.env.example` at the repo root documents every variable needed
      and what it's for.
- [ ] In Supabase Dashboard → Authentication → URL Configuration, set the site URL and redirect URLs to your
      real deployed domain(s) once you have one.

## 2. AI — Anthropic API key

- [ ] Create an account and API key at <https://console.anthropic.com/settings/keys>.
- [ ] Set `ANTHROPIC_API_KEY` (and confirm `ANTHROPIC_MODEL` against
      <https://docs.claude.com/en/docs/about-claude/models> — don't assume the repo's default is still
      current) as a secret on the deployed `ai-assistant` Edge Function: `supabase secrets set
      ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=...`.
- [ ] Decide and set `AI_FREE_PLAN_MONTHLY_TOKEN_ALLOWANCE` / `AI_AUTHOR_PLAN_MONTHLY_TOKEN_ALLOWANCE` for your
      actual cost tolerance — the defaults in `.env.example` are placeholders, not a recommendation.
- [ ] Until this key is set, the AI Assistant silently falls back to a deterministic test provider (clearly
      logged) — nothing breaks, but no real AI happens. This is intentional, not a bug to "fix" without the key.

## 3. Domain & hosting

- [ ] Register a domain (if `inkwell.studio`-style branding matters commercially — verify trademark
      availability first, that's a legal step, not a technical one).
- [ ] Choose a static host for `apps/web` (Vercel/Netlify/Cloudflare Pages all work — see `docs/DEPLOYMENT.md`)
      and connect it.
- [ ] If deploying to more than one Supabase environment (staging/prod), decide the split — the codebase
      supports it via environment variables, no code change needed.

## 4. Desktop — code signing

- [ ] **macOS**: an Apple Developer Program membership ($99/year) and a Developer ID Application certificate,
      needed to sign `.dmg`/`.app` builds so Gatekeeper doesn't block them. Without this, macOS users see an
      "unidentified developer" warning and must manually bypass it.
- [ ] **Windows**: a code-signing certificate (EV certificates avoid SmartScreen warnings; standard OV
      certificates still trigger a reputation-building period). Without this, Windows Defender SmartScreen
      warns on install.
- [ ] Once you have credentials, wire them into `apps/desktop`'s Tauri build config
      (`tauri.conf.json` → `bundle.macOS.signingIdentity` / the Windows signing fields) and, for
      auto-updates, generate a Tauri updater signing keypair (`tauri signer generate`) and set
      `plugins.updater.pubkey` in `tauri.conf.json` plus the matching private key as a CI secret.

## 5. Mobile — app store accounts

- [ ] **Apple Developer Program** ($99/year) — required to build/submit for iOS at all, and to configure Sign
      in with Apple if you want it.
- [ ] **Google Play Console** account ($25 one-time) — required for Android submission.
- [ ] An Expo/EAS account (free tier exists) to run `eas build`/`eas submit` — see `apps/mobile/eas.json`,
      which has placeholder fields (`REPLACE_WITH_...`) for your Apple Team ID, App Store Connect app ID, and
      a Google Play service-account JSON path.
- [ ] Generate app icons/splash screens for real (see `docs/STORE_SUBMISSION.md`) — every icon currently in
      `apps/desktop/src-tauri/icons/`, `apps/mobile/assets/`, and `apps/web/public/icons/` (the PWA manifest
      icons) is the same programmatically-generated placeholder (solid ink-navy square with a gold mark), not
      final branding.

## 6. Optional integrations (skip any you don't want yet — the app works without all of these)

- [ ] **Google Drive**: create an OAuth client in Google Cloud Console, restricted to the minimum Drive scope
      needed (`drive.file`, not full `drive` access). Not yet wired into the app (see `docs/IMPORT_EXPORT.md`)
      — this is prep for when it is.
- [ ] **Media generation provider** (character portraits, cover concepts): pick a provider and get an API key
      once you decide to build this (schema exists, UI doesn't — see the product spec's media section).
- [ ] **Grammar checking** (LanguageTool or similar): API key if you want more than native browser spellcheck.
- [ ] **Crash reporting** (e.g., Sentry): DSN — and you must personally verify its payloads exclude manuscript
      text before enabling in production (see `docs/PRIVACY_DATA_FLOW.md`).

## 7. Billing (only if/when you turn on paid plans)

- [ ] Choose a payment processor for web (Stripe is the reputable default) and complete their business
      verification (this requires your real business/legal identity).
- [ ] Apple In-App Purchase and Google Play Billing each require accepting their respective merchant
      agreements — separate from the developer-account signup above.
- [ ] **Decide real prices.** Every price in this codebase (`docs/COSTS.md`) is explicitly labeled a
      hypothesis. This is a business decision, not a technical one — nothing should launch with the
      placeholder numbers un-reviewed.

## 8. Legal (do not skip — do not let an AI-drafted document stand in for real legal review)

- [ ] Have a qualified lawyer review the drafts in `docs/legal/` (privacy policy, terms of service, AI/data-use
      disclosure, copyright/ownership statement, subscription disclosure, account-deletion policy,
      data-retention policy, acceptable-use policy) before publishing any of them. They are structured,
      reasonable starting points — they are explicitly **not** a substitute for legal review, and this
      codebase makes no claim of legal compliance anywhere.
- [ ] Decide your actual legal business entity/name before finalizing any of the above (the drafts use a
      placeholder).
- [ ] Complete the App Store "App Privacy" questionnaire and Google Play "Data Safety" form yourself once the
      real data flows (`docs/PRIVACY_DATA_FLOW.md`) and any integrations you've turned on are finalized —
      these are legal attestations Anthropic/Claude Code should not fill in on your behalf.

## 9. Two-factor / account security for your own accounts

- [ ] Enable MFA on your Supabase, Anthropic, Apple Developer, Google Play Console, and domain registrar
      accounts. This is the one item on this list purely about protecting *you*, not the product.

## Everything NOT on this list

If it's not here, it didn't require you — it was either already built, or the reason it isn't built yet is
tracked in `docs/IMPLEMENTATION_STATUS.md` as an engineering task, not an owner action. When resuming work,
that file's "exact next executable task" pointers are where to look.
