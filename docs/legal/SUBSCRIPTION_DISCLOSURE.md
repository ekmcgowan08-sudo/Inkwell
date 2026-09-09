> **DRAFT — NOT LEGAL ADVICE, NOT REVIEWED BY A LAWYER.** Prices below are placeholders/hypotheses — see
> `docs/COSTS.md`. Do not publish with unreviewed pricing. See `docs/LEGAL_REVIEW_CHECKLIST.md`.

# Subscription Disclosure (Draft)

## Plans

| Plan | Price | AI allowance |
|---|---|---|
| Free | $0 | Limited monthly AI tokens (see `entitlements.ai_monthly_token_allowance` default in `supabase/migrations/0010_billing.sql`) |
| Author | [price TBD — hypothesis only, see `docs/COSTS.md`] | Higher monthly allowance |
| Author + AI | [price TBD] | Highest monthly allowance |

All core writing features (manuscript, story bible, storyboard, timeline, exports) are available on every
plan, including Free — plans differ only in AI usage allowance and any future higher-usage features. This
reflects the architecture: entitlements gate AI token allowance, not manuscript/story-bible/export access
(`supabase/migrations/0010_billing.sql`).

## Billing mechanics

- **Web**: billed via [Stripe or equivalent — not yet integrated].
- **iOS**: billed via Apple In-App Purchase, subject to Apple's standard subscription terms (auto-renewal,
  managed via the user's Apple ID account settings).
- **Android**: billed via Google Play Billing, subject to Google's standard subscription terms.
- Cross-platform entitlement reconciliation (so a plan purchased on one platform is recognized on another) is
  architected (`entitlements.store` column distinguishes `web_stripe`/`apple_iap`/`google_play`) but the
  actual reconciliation logic is not yet implemented.

## Trials, cancellation, refunds

[Placeholders — trial length, cancellation mechanics per platform, refund policy, and grace-period behavior on
a failed renewal are business decisions not made in this draft. `entitlements.status` already models
`trialing`/`grace_period` as states the schema supports.]

## Changes to pricing

[Standard "advance notice of price changes for existing subscribers" language — TBD by legal review, and by
jurisdiction-specific auto-renewal disclosure requirements, e.g., California's.]
