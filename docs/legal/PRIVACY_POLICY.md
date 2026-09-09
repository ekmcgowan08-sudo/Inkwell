> **DRAFT — NOT LEGAL ADVICE, NOT REVIEWED BY A LAWYER.** Do not publish until reviewed — see
> `docs/LEGAL_REVIEW_CHECKLIST.md`. Placeholders in brackets must be filled in with real values.

# Privacy Policy (Draft)

**Effective date:** [TBD] · **Operator:** [Inkwell operating entity — TBD]

## 1. What we collect

- **Account information**: email address, and anything you choose to add to your profile.
- **Your creative work**: manuscripts, story bible entries, timeline events, storyboard cards, and everything
  else you create inside a project.
- **Usage data**: which AI features you use and how much (token counts, for the purpose of enforcing your
  plan's usage allowance — not the content of what you asked, beyond what's needed to answer it).
- **Device/session information**: standard technical data needed to keep you signed in securely (see
  `docs/PRIVACY_DATA_FLOW.md` for exactly where session tokens are stored on each platform).

## 2. How we use it

- To provide the product: store and sync your manuscripts, run the AI assistant when you ask it something,
  generate the exports you request.
- To enforce usage limits on your plan.
- To keep your account secure (fraud/abuse prevention).
- **We do not use your manuscripts to train any AI model, ours or a third party's, without your separate and
  explicit opt-in — and as of this writing, no such opt-in mechanism exists yet, so this cannot currently
  happen at all.**

## 3. Who we share it with

- **Anthropic** (our AI provider), only when you use the AI Assistant, and only a bounded excerpt of your
  project's content relevant to your question — never your full manuscript, never another project's content.
  See `docs/AI_ARCHITECTURE.md` for the exact mechanism.
- **Our infrastructure provider** (Supabase), which hosts the database and file storage — a standard
  data-processing relationship, not a third party who uses your data for their own purposes.
- **Optional integrations you explicitly connect** (e.g., Google Drive), only for the specific action you
  request.
- We do not sell your data. We do not share your manuscripts with advertisers. We have no analytics vendor
  that receives manuscript content.

## 4. Your rights

- **Export**: download everything associated with your account at any time (Account Settings → Export all my
  data).
- **Deletion**: delete any project (30-day recovery window, then permanent) or your entire account (immediate,
  permanent).
- [Jurisdiction-specific rights — GDPR/CCPA access, correction, portability, objection rights — to be added by
  legal review based on where your users are.]

## 5. Security

See `docs/SECURITY.md` for the technical detail. In summary: your data is protected by database-level access
controls (not just application code), encrypted in transit, and encrypted at rest by our infrastructure
provider. **We do not currently offer end-to-end encryption** — [operator name] can technically access stored
content as needed for support, security, and legal compliance purposes.

## 6. Data retention

See `docs/PRIVACY_DATA_FLOW.md` "Retention" — as of this writing, the described 30-day soft-delete window is
implemented at the application level, but the automated permanent-purge job for data past that window has not
yet been built. [To be finalized once that job exists, or the policy adjusted to reflect actual behavior.]

## 7. Children's privacy

[Placeholder — requires a legal decision on target audience and any applicable children's-privacy law.]

## 8. Changes to this policy

[Standard "we'll notify you of material changes" language — to be finalized by legal review.]

## 9. Contact

[Support/privacy contact email — TBD.]
