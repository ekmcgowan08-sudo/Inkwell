# Inkwell — Product

An all-in-one writing studio for long-form fiction authors. The manuscript, the story bible, the timeline, and
an AI that genuinely remembers the author's story all live in one trusted workspace.

## The core promise

The AI is not the author. Its job is to remember, retrieve, compare, identify drift, and help the author
think — never to silently rewrite prose, insert AI output into the manuscript automatically, or present
invented details as established canon. Every AI surface in this product (see `docs/AI_ARCHITECTURE.md`)
is built around that constraint structurally, not just as a prompt instruction: suggestions are visually
distinct from the author's own text, nothing is auto-inserted, and citations point back to what's actually
been written.

## Who it's for

Novelists, series authors, serial web-fiction writers, screenwriters adapting to prose — working solo, often
on more than one project at once, across desktop, tablet, and phone. Both structured "plotter" and freeform
"discovery writer" workflows are first-class; nothing forces one prescribed method (see the onboarding
style choice, which never locks a feature behind it).

## Information architecture

```
Account
 └─ Projects (standalone books, or books grouped into a series)
     ├─ Manuscript (parts → chapters → scenes)
     ├─ Story Bible (characters, locations, lore, objects, organizations, custom entries, relationships)
     ├─ Storyboard (scene cards, optional structure overlays)
     ├─ Timeline & Goals (in-story chronology, separate from real-world writing progress)
     ├─ AI Assistant + AI Findings (project-scoped, cites its sources)
     ├─ Versions & Backups (revision history, named snapshots, recovery bin)
     └─ Exports (DOCX, TXT, Markdown, print-ready PDF, complete project backup)
```

Every book's manuscript, story bible, timeline, and AI memory are completely isolated from every other book —
enforced at the database level, not just in the UI (see `docs/SECURITY.md`).

## What's real today vs. planned

See `docs/IMPLEMENTATION_STATUS.md` for the exact, current, phase-by-phase state — this file describes the
product's intent, that file describes what's actually built and verified. Read both; they answer different
questions.

## Design identity

Dark "Writer's Den" mode is the signature default, with a complete light mode and a follow-system option —
never dark-only. Ink navy, parchment, burgundy, and gold form the palette; Fraunces for literary headings,
Source Serif 4 for manuscript prose, Inter for UI chrome. A gold-to-burgundy "thread" motif on storyboard cards
nods to the AI's job of tracking a story's threads. Full palette/token values: `packages/design-tokens/`.

## Source documents

The original product spec, prototype, and technical handoff that this build started from are preserved in
context via `docs/DECISIONS.md` and `docs/ARCHITECTURE.md`, which explain what was kept, what was changed, and
why.
