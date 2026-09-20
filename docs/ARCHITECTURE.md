# Inkwell — Architecture Decision Record

Status: **Decided (v1)** — 2026-09-09
Owner of this decision: Claude Code, acting under the autonomous-execution brief in the project prompt. Revisit if a phase proves a requirement below wrong.

## 1. Decision

| Layer                                              | Choice                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared frontend (web, and the view inside desktop) | **React 18 + TypeScript, built with Vite**                                                                                                     |
| Desktop packaging (macOS, Windows)                 | **Tauri 2**, wrapping the same web build                                                                                                       |
| Mobile packaging (iOS, Android)                    | **Expo (React Native), SDK 51+, using Expo Router** — not Tauri                                                                                |
| Backend                                            | **Supabase**: Postgres, Auth, Storage, Edge Functions (Deno)                                                                                   |
| Database access control                            | **Postgres Row Level Security** on every user-owned table, no privileged key in any client                                                     |
| AI provider                                        | **Anthropic Messages API**, called only from a Supabase Edge Function                                                                          |
| Local-first persistence                            | **IndexedDB (via Dexie)** in the browser/desktop webview, **SQLite (via expo-sqlite)** on mobile, both behind one shared sync-queue contract   |
| Shared logic                                       | `packages/shared-types`, `packages/ai-contracts`, `packages/design-tokens`, `packages/api-client` — consumed by web, desktop, and mobile alike |
| Monorepo tooling                                   | pnpm workspaces (no Turborepo/Nx — the graph is small enough that extra build-orchestration tooling isn't earning its complexity yet)          |

This resolves the handoff doc's open question ("web vs. native from day one") by doing **both from one codebase**, per the updated requirement that Inkwell ship on iPhone, iPad, Android, macOS, Windows, and the browser.

## 2. Why not "Tauri everywhere," including mobile?

The brief's preferred default was Tauri 2 for everything, falling back to Expo/React Native for mobile only if Tauri 2 mobile isn't reliable enough for critical requirements. Evaluating Tauri 2 mobile (v2.0 stable, mobile support GA'd through 2024–2025) against Inkwell's specific critical requirements:

- **Rich manuscript editor with IME, spellcheck, and large-document performance.** Tauri mobile renders through the OS's native webview (WKWebView on iOS, Android System WebView / Chromium on Android). This is workable, but the two webviews diverge in text-input quirks (IME composition, cursor jumping, undo-stack behavior in `contenteditable`) in ways that are still actively tracked as open issues in Tauri's mobile tracker rather than settled. A fiction author typing 2,000+ words in one sitting on a phone cannot tolerate cursor/undo bugs — this is the single highest-stakes interaction in the whole product.
- **Deep-linking / OAuth redirect back into the app** (needed for Supabase Auth's PKCE flow, and later Google/Apple sign-in). Tauri 2's mobile deep-link plugin works, but is materially less battle-tested than Expo's, which is the standard used by a huge fraction of production RN apps doing exactly this OAuth-redirect pattern today.
- **In-app purchase plumbing for Apple/Google billing** (required by `<monetization>`). Expo has mature, maintained community modules (RevenueCat's SDK, `react-native-iap`) with large production install bases. Tauri 2 mobile has no equivalently mature first-party or community IAP story as of this decision date.
- **App-store submission maturity.** Expo/EAS Build is a production pipeline specifically built for App Store / Play Store submission (provisioning profiles, ASC API keys, internal test tracks). Tauri mobile's release tooling is newer and less documented for this exact workflow.
- **Native bottom-sheet / safe-area / keyboard-avoiding patterns** the mobile spec calls for are first-class, well-documented primitives in the RN ecosystem (`react-native-safe-area-context`, `@gorhom/bottom-sheet`, `KeyboardAvoidingView`) with no equivalent maturity in a Tauri-mobile+web-views world.

None of these are "Tauri mobile is broken" — it is real and improving — but several of them are exactly the "critical production requirement" bar the brief set for staying with Tauri on mobile. Desktop is a different story: Tauri 2 on macOS/Windows uses mature native webviews (WKWebView / WebView2), has a stable native-menu, window-management, filesystem, and updater API surface, and is explicitly the brief's preferred desktop choice. **Decision: Tauri 2 for desktop, Expo for mobile**, exactly the documented fallback shape.

## 3. Why Supabase over a hand-rolled Node/Prisma/Postgres backend

The handoff doc's original suggestion (Next.js + Prisma + Postgres + Clerk/Auth.js) is a reasonable web-only stack, but it does not by itself give five clients (web, iOS, Android, macOS, Windows) a shared, securely-reachable backend without a lot of hand-built plumbing: session management across platforms, storage with signed URLs, and a place to run server-only AI calls. Supabase provides all of that as one coherent, managed unit:

- **Auth**: email/password, magic link, and OAuth (Google/Apple) with SDKs for web and React Native, PKCE-based session refresh, and JWTs that Postgres RLS can check directly (`auth.uid()`), so "which rows can this request see" is enforced in the database, not re-implemented per client.
- **Postgres + RLS**: the definition-of-done requires the database itself to prove cross-user and cross-project isolation, not just careful application code. RLS policies are the mechanism the whole security section of this brief assumes.
- **Storage**: for manuscript exports, media assets, and backups, with the same RLS-style access policies.
- **Edge Functions (Deno, TypeScript)**: exactly where the Anthropic API key and system prompts must live — never in a distributed client. One function surface serves web, desktop, and mobile identically.

Prisma is intentionally **not used**. Supabase's own migration model (plain, numbered SQL files applied via the Supabase CLI) is simpler to keep in lock-step with hand-written RLS policies, and this project has no ORM-specific need (no complex multi-database story) that would justify Prisma's extra generated-client layer on top of Supabase's own generated types. This is a deliberate deviation from the historical handoff doc, as the brief explicitly permits ("do not add Prisma merely because it appears in the historical handoff").

## 4. Local-first editor and sync

Requirement: a 100,000-word manuscript must stay responsive, must not lose text to a crash or bad connection, and must not hit the database on every keystroke. Chosen approach:

- The editor's source of truth **while writing** is an in-memory + IndexedDB-backed document (Dexie on web/desktop, SQLite on mobile), keyed by scene/chapter revision id.
- A debounced (default 2s idle, or 400 words changed, whichever first) writer flushes the current text into a local "pending revision" row and enqueues a sync job.
- A background sync worker drains the queue against Supabase when a connection is available, using an optimistic-concurrency `revision` integer per chapter/scene row (`WHERE id = ? AND revision = ?`) to detect a competing write from another device, surfacing a conflict-resolution UI rather than silently overwriting.
- Plain-text extraction (for word counts, search, and AI context) is derived from the canonical document on every save, not maintained by hand.

Full design in `docs/EDITOR_AND_AUTOSAVE.md` and `docs/SYNC_AND_CONFLICTS.md`.

## 5. AI architecture summary

All Anthropic calls happen in a single Supabase Edge Function (`supabase/functions/ai-assistant`). It:

1. Authenticates the caller's Supabase JWT and re-checks project ownership server-side (never trusts a client-supplied project id alone).
2. Builds a bounded context (chapter summaries, approved canon facts, retrieved chunks via Postgres full-text search, recent chat turns) instead of the whole manuscript.
3. Calls Anthropic with a configurable model id read from an environment variable, never hardcoded.
4. Logs usage (tokens, cost estimate) per user/project for the usage-limit system.
5. Returns citations (chapter/scene/story-bible ids) alongside the answer so the client can render "based on Chapter 4, Wren's eyes are described as storm grey."

Full detail in `docs/AI_ARCHITECTURE.md`. A deterministic local test adapter (`packages/ai-contracts`) lets the rest of the app be tested without spending API credits, per the brief.

## 6. What "done" looks like for this decision

This ADR is implemented incrementally across the phases in `docs/IMPLEMENTATION_STATUS.md`. Desktop (Tauri) is buildable and testable in this environment (Linux container, no macOS/Windows signing available — see `docs/OWNER_ACTIONS_REQUIRED.md`). Mobile (Expo) scaffolding is included with shared packages wired in, but iOS/Android builds require Apple/Google developer enrollment and physical or emulator/simulator verification that this container cannot perform — this is called out explicitly rather than claimed as tested.
