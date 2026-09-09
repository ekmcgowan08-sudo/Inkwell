# Inkwell — Cost Model

**All figures below are estimates as of 2026-09-09, from public list pricing at the time this was written.**
None of these are guaranteed quotes, none have been confirmed with a sales contact, and pricing pages change.
**Re-verify every number against the vendor's current official pricing page before making any financial
decision.** Sources: <https://supabase.com/pricing>, <https://www.anthropic.com/pricing>,
<https://vercel.com/pricing>, Apple/Google developer program pages.

## Local development

$0. Everything runs locally with zero paid services (local-only mode needs nothing; a local Supabase stack
via `supabase start` uses Docker, not a paid account).

## Private beta (a handful of real users, real Supabase project, low AI usage)

| Item | Estimated monthly cost |
|---|---|
| Supabase Pro plan (needed once you outgrow the free tier's pause-after-inactivity and storage limits) | ~$25/mo base, + usage-based compute/bandwidth/storage add-ons that are hard to estimate without real traffic — budget an extra ~$0–50/mo at this scale |
| Web hosting (Vercel/Netlify/Cloudflare Pages, hobby/free tier) | $0 |
| Anthropic API (a few dozen users, light AI usage, Sonnet-class model) | Rough math: 200,000 tokens/user/month free-tier allowance × ~20 active users × Sonnet pricing (~$3/$15 per million input/output tokens, blended ~$6/M assuming mostly input-heavy context) ≈ **$20–40/mo** — genuinely rough, actual usage patterns vary a lot |
| Domain registration | ~$12–15/year (~$1–2/mo amortized) |
| **Total** | **roughly $50–120/mo**, dominated by uncertainty in actual AI usage |

## Early production (few hundred users)

| Item | Estimated monthly cost |
|---|---|
| Supabase Pro + usage add-ons | ~$25–150/mo depending on database size, bandwidth, and storage (manuscripts are small; media assets, if enabled, are the bigger driver) |
| Web hosting | Likely still within a free/hobby tier unless traffic is unusually high; budget $0–20/mo |
| Anthropic API | Scales roughly linearly with active users and their AI usage — at a few hundred users with the same free-tier allowance, this becomes the dominant cost. **This is the line item to actively monitor and cap** — the `ai_usage`/`entitlements` allowance system exists specifically to bound it (see `docs/AI_ARCHITECTURE.md`) |
| Backups | Supabase Pro includes daily backups; point-in-time recovery is a paid add-on if desired |
| **Total** | **highly dependent on AI usage** — could reasonably range from $150/mo to $1,000+/mo; the allowance system is the actual cost control, not this estimate |

## Growth scenario (thousands of users)

At this scale, costs should be modeled from real observed usage data, not this document's estimates — the
uncertainty band above compounds. Concrete recommendation: instrument `ai_usage` (already schema-ready) into a
dashboard early, and revisit pricing-plan allowances based on real per-user token consumption before scaling
marketing spend.

## Fixed/one-time costs

| Item | Cost |
|---|---|
| Apple Developer Program | $99/year |
| Google Play Console | $25 one-time |
| Code-signing certificate (Windows, if not using a free/low-cost option) | Varies, roughly $70–400/year depending on certificate type (standard OV vs. EV) |
| Domain | ~$12–15/year |

## App-store account/media-generation costs

Not estimated — no media generation provider has been selected (see `docs/OWNER_ACTIONS_REQUIRED.md` #6);
pricing varies enormously by provider and is a decision to make when that feature is actually built.

## What controls cost in this codebase today

- `packages/ai-contracts/src/pricing.ts` — the cost-estimation table used to populate `ai_usage.estimated_cost_usd_micros`,
  dated (`PRICING_CHECKED_AT`), explicitly for *estimation*, never treated as an authoritative bill.
- `entitlements.ai_monthly_token_allowance` — the actual spending cap, enforced server-side in the
  `ai-assistant` Edge Function before any provider call.
- No other line item in this list has an automated cap — Supabase/hosting/domain costs are billed by the
  vendor directly and require normal account-level monitoring.
