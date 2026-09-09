# Inkwell — Legal Review Checklist

**Nothing in `docs/legal/` has been reviewed by a lawyer.** These are structured, reasonable-effort drafts
meant to save a lawyer time, not replace one. Do not publish any of them, or represent Inkwell as compliant
with any law or regulation, until real legal review is complete. This checklist is what to bring to that
review.

## Documents drafted (in `docs/legal/`)

- [ ] `PRIVACY_POLICY.md`
- [ ] `TERMS_OF_SERVICE.md`
- [ ] `AI_DATA_USE_DISCLOSURE.md`
- [ ] `COPYRIGHT_AND_OWNERSHIP.md`
- [ ] `SUBSCRIPTION_DISCLOSURE.md`
- [ ] `ACCOUNT_DELETION_POLICY.md`
- [ ] `DATA_RETENTION_POLICY.md`
- [ ] `ACCEPTABLE_USE_POLICY.md`

## Things a lawyer needs to check that an AI drafting these documents cannot verify

- **Jurisdiction-specific requirements.** GDPR (EU/UK users), CCPA/CPRA (California), and any other
  jurisdiction-specific privacy law that applies based on where users actually are — this codebase makes no
  jurisdictional determination.
- **The real legal entity name and address** that will operate Inkwell — every draft uses a placeholder
  (`[Inkwell operating entity — TBD]`).
- **Whether the described data flows in `docs/PRIVACY_DATA_FLOW.md` are actually complete** once real
  integrations (Drive, media generation, crash reporting, analytics) are turned on — the privacy policy draft
  must be re-verified against that document at the time of publication, not against this snapshot.
- **Children's privacy (COPPA and equivalents)** — this product has no age gate or COPPA-specific handling
  built. A lawyer needs to decide whether one is required based on target audience and marketing.
- **Subscription/auto-renewal disclosure requirements**, which vary significantly by jurisdiction (e.g.,
  California's auto-renewal law, EU consumer rights) — the draft states the mechanics but doesn't attempt
  jurisdiction-specific compliance language.
- **Arbitration/dispute-resolution clauses**, governing law, and venue — deliberately left as placeholders,
  since these are pure legal/business decisions.
- **Whether AI-generated content (findings, brainstorming suggestions) creates any IP or liability question**
  specific to your jurisdiction or business model.
- **Export compliance** beyond the simple "we only use standard TLS" determination already reflected in
  `apps/mobile/app.json`.
- **Trademark clearance** for the name "Inkwell" in your target markets, if commercializing.

## What IS accurately reflected in the drafts (verify this claim, don't just trust it)

The drafts were written to match what's actually implemented (`docs/PRIVACY_DATA_FLOW.md`,
`docs/SECURITY.md`), not aspirational claims — e.g., they do not claim end-to-end encryption, do not claim an
AI-training opt-in flow exists when it doesn't yet, and describe the real 30-day soft-delete window. Re-check
this alignment at legal-review time, since code and docs may have moved on by then.
