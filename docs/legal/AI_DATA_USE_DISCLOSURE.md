> **DRAFT — NOT LEGAL ADVICE, NOT REVIEWED BY A LAWYER.** See `docs/LEGAL_REVIEW_CHECKLIST.md`.

# AI Data Use Disclosure (Draft)

This document explains, specifically, what happens when you use Inkwell's AI Assistant. It's meant to be more
concrete than the general Privacy Policy on this one topic.

## When the AI is called

Only when you take an explicit action: asking a question in the AI Assistant, or clicking "Run consistency
scan" (which, note, does **not** call any AI at all — it's a local, deterministic rule-based check; see
`docs/AI_ARCHITECTURE.md`). Nothing runs in the background, on a schedule, or without you initiating it.

## What's sent, to whom

Your question, plus a bounded set of context from **the single project you're currently working in**:
recent/relevant chapter summaries, a handful of retrieved scene excerpts, your story-bible entries, your
in-story timeline, and author-approved canon facts — never your entire manuscript, and never content from any
other project, even another book you own. This goes to Anthropic (our AI provider), processed via their API.

## What's not sent

- Your other books or series entries you haven't explicitly included.
- Other users' content — enforced by database-level access control (Postgres Row Level Security), not just
  application logic; see `docs/SECURITY.md`.
- Your account credentials, payment information, or session tokens.

## Training

**We do not use your content to train any AI model without your separate, explicit, revocable opt-in.** As of
this writing, no such opt-in flow exists in the product — meaning there is currently no mechanism by which
your content could be used for training at all, opt-in or otherwise. If that changes, this document and the
opt-in mechanism itself must be updated together, and existing users must not be defaulted into it.

Anthropic's own use of API inputs is governed by Anthropic's terms, which may change — verify Anthropic's
current commercial API terms (as distinct from their consumer Claude.ai terms, which differ) before finalizing
this disclosure for publication.

## Storage of AI conversations

Your questions and the AI's answers are stored (`ai_conversations`, `ai_messages` — see
`docs/DATA_MODEL.md`) so you can review your own history. They're protected by the same per-project,
per-user access control as everything else, and deleted when you delete the project.

## Accuracy

AI responses are generated text, not verified fact. Inkwell labels responses as based on "established"
content, "inference," or "not established" as a best-effort signal (see `docs/AI_ARCHITECTURE.md`) — this
labeling is not a guarantee of accuracy and should not be relied on as authoritative about your own story.
