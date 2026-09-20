# Inkwell — AI Architecture

## Where the model gets called

**Exactly one place**: `supabase/functions/ai-assistant/index.ts`, a Deno Edge Function. No client
(`apps/web`, the future `apps/desktop`, the future `apps/mobile`) holds an Anthropic API key or calls
`api.anthropic.com` directly. `packages/ai-contracts/src/providers/anthropicProvider.ts` implements the actual
HTTP call and is deliberately **not** re-exported from the package's barrel (`index.ts`) — it can only be
imported by its full path, and only Edge Function code does.

The model id is read from `ANTHROPIC_MODEL` (`supabase/functions/.env`), falling back to
`DEFAULT_ANTHROPIC_MODEL` in that same file. Neither the fallback nor anywhere else in this codebase hardcodes
a specific historical Claude snapshot as the _only_ option — verify the configured id against
<https://docs.claude.com/en/docs/about-claude/models> before deploying, since model availability changes over
time and this document can't stay current with that.

## Request flow

1. Client calls `supabase.functions.invoke("ai-assistant", { body: AssistantRequest })`. The Supabase JS SDK
   attaches the signed-in user's access token as the `Authorization` header automatically.
2. The function verifies that token (`userClient.auth.getUser()`) — no valid session, no response.
3. It checks the sliding-window rate limit (`_shared/rateLimit.ts`) — the cheapest possible rejection, before
   even parsing the request body, so a looping/abusive client is turned away with minimal work done.
4. It re-derives project ownership **by querying through a client authenticated as that user**
   (`createUserClient`, `_shared/supabaseClients.ts`), not by trusting the `projectId` in the request body. RLS
   makes a project you don't own behave exactly like a project that doesn't exist — the function can't
   distinguish the two, which is the point (no existence-leak).
5. It checks a monthly token allowance (`entitlements.ai_monthly_token_allowance` vs. summed `ai_usage` for the
   current `YYYY-MM`) before doing anything that costs money.
6. It builds a **bounded** context (`_shared/buildContext.ts`) — never the full manuscript. See "Context
   budgeting" below.
7. It builds the system prompt (`packages/ai-contracts/src/promptBuilder.ts`) — one shared function, so the
   Edge Function and the web app's local-only mode produce the same style of prompt.
8. It calls the provider (real Anthropic, or the deterministic test provider if `ANTHROPIC_API_KEY` is unset —
   this fallback exists so a Supabase project without AI credentials configured still returns _something_
   instead of a hard failure, clearly logged as a fallback).
9. It strips any trailing findings block from the response (`extractFindings`, see "AI Findings vs. the AI
   Assistant's consistency-check mode" below), parses bracketed citations out of what's left
   (`parseCitations`), persists both the user's question and the assistant's answer via the **service-role**
   client (bypassing RLS deliberately — this is the one path allowed to write `ai_messages`, see
   `docs/DATA_MODEL.md` "server-only write paths"), persists any extracted findings the same way, updates
   `ai_usage`, and returns the answer with citations, a context summary, a groundedness label, and any
   findings created.
10. **The client mirrors that response into its local Dexie cache** — the conversation record, both
    messages, and any findings — the same shape `askAssistantLocal` writes for local-only mode, just sourced
    from the server's response instead of a local provider call (`askAssistantCloud`,
    `apps/web/src/lib/aiClient.ts`). Every page that shows AI Assistant output reads from Dexie via
    `useLiveQuery`, never live from Postgres, so without this mirroring step a cloud-connected author would
    get billed for a request and see nothing change in the UI — a real bug this pass found and fixed, see
    `docs/DECISIONS.md` (2026-09-18).

## Context budgeting ("never send the whole manuscript")

`ContextBundle` (`packages/ai-contracts/src/contracts.ts`) is deliberately narrow:

| Field                  | Bound                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| `chapterSummaries`     | up to 30 chapters, each just a title + summary (not full text)               |
| `retrievedChunks`      | up to 12 scenes, most-recently-updated, each truncated to 800 characters     |
| `storyBibleDigest`     | up to 40 entries, name + a short digest, not the full structured fields blob |
| `approvedCanonFacts`   | up to 30, author-approved only (`approved_by_author = true`)                 |
| `openThreads`          | up to 20                                                                     |
| `recentTimelineEvents` | up to 20                                                                     |
| `recentMessages`       | last 6 turns of the current conversation, if any                             |

**Retrieval is ranked, not just recency-bounded.** `retrievedChunks` (scenes) and `storyBibleDigest` (story
bible entries) are ranked against the author's actual question via `ts_rank` over the generated
`search_vector` columns (`supabase/migrations/0004`, `0005`), through two SQL functions —
`search_scenes_ranked` / `search_story_bible_entries_ranked` (`supabase/migrations/0011_ranked_search.sql`,
called from `supabase/functions/_shared/buildContext.ts`). Both are `LANGUAGE sql` with no `security
definer`, so they run `SECURITY INVOKER` and row level security applies exactly as it would to a plain
`select` from the caller's own session — proven in `tests/rls/run.ts` ("ranked full-text search functions...
respect RLS"). When the question shares no keywords with anything written yet (a generic "how's it going?",
or a brand-new project), the ranked query returns nothing and the context builder falls back to the original
recency-bounded sample rather than handing the model an empty context bundle. **Verified: Auto** —
`supabase/functions/_shared/buildContext.test.ts` (mocked Supabase client covering the ranked-match, no-match
fallback, and empty-question cases) and the RLS suite; not yet exercised against a live Supabase project with
real manuscript content.

## Series-level continuity (opt-in, off by default)

`AssistantRequest.seriesScope` (default `false`) is the explicit opt-in — the assistant never reads outside
the active project unless the author asks _and_ the project actually belongs to a series. When both are true,
`fetchSeriesContext` (`_shared/buildContext.ts`) pulls a small, separately-bounded, book-labeled slice from up
to `MAX_SERIES_BOOKS` (4) other books in the same series: `MAX_SERIES_CHAPTERS_PER_BOOK` (5) chapter summaries,
`MAX_SERIES_CANON_FACTS_PER_BOOK` (10) approved canon facts, and `MAX_SERIES_STORY_BIBLE_PER_BOOK` (10) story
bible entries per book — all exported from `packages/ai-contracts/src/contracts.ts` so the server-side and
local-only (`apps/web/src/lib/aiLocalContext.ts`) context builders apply the same limits. Each cross-book item
is prefixed with that book's title (`"[Book Two] Chapter One"`) so both the model and the author reading the
context summary can tell which book a fact came from. This uses the same `userClient` (RLS-scoped) as
everything else — a sibling "book" in the series query can structurally only ever be one of the caller's own
projects (RLS on `projects`, already proven in `tests/rls/run.ts`; a project's `series_id` is also
constrained at the schema level to belong to a series the same user owns). The UI toggle ("Also consider the
other books in this series") only appears on the AI Assistant page when the active book has a series.
Local-only mode mirrors chapter summaries and story bible entries from Dexie, but not canon facts — there's no
local `canon_facts` table at all, a pre-existing gap unrelated to this feature. **Verified: Auto**
(`buildContext.test.ts`, `aiLocalContext.test.ts`); not exercised against a live Supabase project.

## Citations and groundedness

The system prompt instructs the model to reference `[chapter:<id>]`, `[scene:<id>]`, `[story_bible_entry:<id>]`,
`[timeline_event:<id>]`, or `[canon_fact:<id>]` — ids that are already present in the context it was given.
`parseCitations` (`packages/ai-contracts/src/citations.ts`) extracts these with a regex and resolves each id
back to a human label from the same context bundle, producing structured `Citation[]` the UI renders as
clickable badges. This is cheap (no second model call), deterministic, and testable with the local test
provider — but it depends on the model actually following the instruction; nothing forces it to.

`groundedness` is currently a coarse binary signal (`inferGroundedness`): `"not_established"` if the context
bundle was entirely empty (a brand-new project), `"mixed"` otherwise. It is **not** currently a per-claim
analysis of the response text — a genuinely per-sentence established/inference/invented classification would
need either a second model call or much more careful prompt-engineered structured output, and wasn't built in
this pass. Don't read more precision into the badge than "the model had _something_ to work with."

## Usage, cost, and rate control

- **Token allowance**: `entitlements.ai_monthly_token_allowance` (default 200,000/month on the free plan, set
  by the `handle_new_user_entitlement` trigger) checked against summed `ai_usage.tokens_input +
tokens_output` for the current calendar month (UTC) before any provider call.
- **Cost tracking**: `packages/ai-contracts/src/pricing.ts` has a small, dated, clearly-labeled-as-hypothesis
  pricing table (`PRICING_CHECKED_AT`) used only to _estimate_ spend in `ai_usage.estimated_cost_usd_micros` —
  never treated as an authoritative bill. Verify against <https://www.anthropic.com/pricing> before relying on
  it for anything financial; see `docs/COSTS.md`.
- **Sliding-window rate limiting**: `checkAndRecordRateLimit` (`supabase/functions/_shared/rateLimit.ts`) caps
  a user to `RATE_LIMIT_MAX_REQUESTS` (8) AI Assistant calls per `RATE_LIMIT_WINDOW_SECONDS` (60), backed by a
  small server-only Postgres table (`ai_rate_limit_events`, migration `0012_ai_rate_limiting.sql` — RLS
  enabled with **zero policies**, so no client can read or write it under any circumstance, proven in
  `tests/rls/run.ts`). Checked first, before parsing the request body or touching the monthly allowance, so
  an abusive/looping client is rejected as cheaply as possible. Old events for a user are opportunistically
  pruned on each check rather than needing a separate scheduled job. This is deliberately a Postgres table,
  not an external store (Redis/Upstash) — this sandbox and most self-hosted Supabase deployments don't have
  one, and an AI assistant endpoint's request volume is low enough for Postgres to be a fine backing store.
  **Known limitation, stated plainly**: the check-then-insert is two round trips, not one atomic statement, so
  genuinely simultaneous requests from the same user (e.g. two browser tabs firing at once) could both pass
  the check before either commits. This is an abuse throttle, not the financial backstop — the monthly token
  allowance (checked separately, against already-committed usage rows) is still what actually caps spend, so
  a few requests slipping through a race isn't a budget breach. **Verified: Auto**
  (`supabase/functions/_shared/rateLimit.test.ts` against a mocked Supabase client, plus the RLS isolation
  test above); not exercised against a live Supabase project.
- **No provider call happens unless the user initiates one.** There is no background job, cron, or
  auto-trigger anywhere in this codebase that calls the AI without a direct user action (asking a question, or
  clicking "Run consistency scan" — which itself is a zero-cost local rule-based scan, not a model call; see
  `docs/DECISIONS.md`).

## Cross-project isolation (why this can be trusted, not just asserted)

Every table the AI reads from or writes to (`ai_conversations`, `ai_messages`, `ai_findings`, `ai_usage`,
`document_chunks`) carries both `project_id` and, where relevant, `user_id`, and RLS enforces both — proven by
the automated suite in `tests/rls/run.ts` ("AI retrieval isolation: document_chunks for project A are
invisible to user B", "AI conversations and messages for project A are invisible to user B"). The context
builder additionally only ever queries through a client scoped to the caller's own JWT, so even a bug in this
function's own code that forgot a `project_id` filter would still be blocked by the database, not just by
careful application logic.

## Local-only mode (no Supabase configured)

`apps/web` detects a missing `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and routes AI Assistant requests to
`packages/ai-contracts`'s deterministic test provider directly in the browser (`apps/web/src/lib/aiClient.ts`
→ `askAssistantLocal`), building the same `ContextBundle` shape from IndexedDB instead of Postgres
(`apps/web/src/lib/aiLocalContext.ts`). This is how the AI Assistant, Findings, and citation UI were built and
verified without spending any API credits or needing a deployed backend. It is clearly labeled in the UI
("Running in local test mode...") and never calls a real model — the deterministic test provider is the same
one used in automated tests.

## AI Findings vs. the AI Assistant's consistency-check mode

Two different mechanisms, both real, and now both feed the same `ai_findings` table:

1. **Rule-based scanner** (`apps/web/src/lib/findingsScanner.ts`, run via the "Run consistency scan" button):
   duplicate story-bible names, open story threads with no linked scene, same-day/different-location timeline
   conflicts. Zero AI cost, deterministic, works with no backend at all.
2. **AI Assistant's `consistency_check` (and related) modes**: a real model call that reasons over the prose
   itself in ways the rules above structurally cannot (e.g., "this character's eye color contradicts chapter
   4"). This is still a conversation the author has to actively start — no background job, no unprompted
   model call — but the answer from that one request is now automatically converted into `ai_findings` rows,
   not left stranded in the chat transcript.

   For the modes where this is plausible (`FINDINGS_ELIGIBLE_MODES` in `promptBuilder.ts`:
   `consistency_check`, `character_continuity`, `timeline_analysis`, `plot_thread_tracking`,
   `dropped_thread_detection`, `canon_extraction` — not e.g. `brainstorming` or `pacing_feedback`, where a
   structured finding doesn't make sense), the system prompt asks the model to append a delimited JSON block
   after its normal answer:

   ```
   ===FINDINGS_JSON===
   [{"findingType": "...", "severity": "...", "confidence": 0.0-1.0, "title": "...", "explanation": "... [scene:id] ..."}]
   ===END_FINDINGS_JSON===
   ```

   `extractFindings` (`packages/ai-contracts/src/findingsExtraction.ts`, shared by the Edge Function and the
   local-only path) strips this block from the text before it's ever stored as `ai_messages.content` or shown
   to the author, and validates the JSON against the same finding shape the rule-based scanner uses. A
   missing or malformed block is treated as zero findings, never as an error — the conversational answer is
   unaffected either way. Each finding's `evidence` is resolved the same way message citations already are:
   `parseCitations` runs over the finding's own `explanation` text, so a finding citing `[scene:id]` gets a
   real, clickable citation, not a free-text reference. **Verified: Auto** —
   `packages/ai-contracts/src/findingsExtraction.test.ts` (block stripping, valid/empty/malformed JSON) and
   `apps/web/src/lib/aiClient.test.ts` (the full local-only pipeline end to end, via the deterministic test
   provider's `TEST_SCENARIO:findings` / `TEST_SCENARIO:findings-empty`, including that a mode outside
   `FINDINGS_ELIGIBLE_MODES` never produces findings); `apps/web/src/lib/aiClientCloud.test.ts` (the cloud
   path, mocking `supabase.functions.invoke` — asserts the client correctly mirrors a server response
   carrying findings into Dexie); the Edge Function's own `.insert()` call is the same already-tested
   `extractFindings`/`parseCitations` logic wired to `serviceClient`, not separately integration-tested
   against a live Postgres in this pass — RLS around `ai_findings` (a client can't insert directly, but can
   update `status`/`author_note` on their own project's findings) is proven in `tests/rls/run.ts`.

## Deterministic test provider

`packages/ai-contracts/src/providers/testProvider.ts` implements `LLMProvider` with no network call: it
recognizes `TEST_SCENARIO:<name>` markers in the prompt for a few canned responses (used by tests), and
otherwise returns a short, honest, clearly-labeled ("[test-provider deterministic response]") acknowledgment of
the context and question it received. Same input always produces the same output. This is what every
automated test and the local-only mode run against — nothing about the AI Assistant's UI, citation rendering,
findings workflow, or usage tracking required spending real API credits to build or verify.
