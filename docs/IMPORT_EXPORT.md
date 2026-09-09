# Inkwell — Import & Export

## Import (`apps/web/src/lib/importManuscript.ts`, `features/dashboard/ProjectDialogs.tsx`)

**Supported today**: `.txt`, `.md`/`.markdown`.

1. Author picks a file (dashboard "Import" button, or onboarding).
2. `detectChapters(text)` splits on lines matching `Chapter`/`Part`/`Prologue`/`Epilogue`/`Interlude` (case
   insensitive) or a markdown heading (`#`/`##`/`###`). No match anywhere → the whole file becomes one
   chapter, with an explicit warning, not a silent guess.
3. **A real preview is always shown before anything is created**: detected chapter titles, word counts per
   chapter, and any warnings (no headings found, duplicate titles auto-numbered). The author confirms before
   a project is created.
4. Import always creates a **new** project — never overwrites an existing one, silently or otherwise.
5. Partial-failure handling: each chapter's scene is created and autosaved independently; if one fails, the
   ones before it are already committed to IndexedDB (nothing is transactional across the whole import), so a
   partial import leaves a partially-populated project rather than losing everything. There's no dedicated
   "resume a failed import" flow yet — a concrete follow-up.

Verified: `apps/web/src/lib/importManuscript.test.ts` (heading detection, empty-file handling, duplicate-title
numbering) + browser-verified via the dashboard's import dialog.

**Not implemented**: DOCX import, Inkwell-backup *import* (export exists, see below — round-tripping a backup
back into a new project is not yet wired up), paste-as-multiple-chapters-with-review as a distinct flow (the
file-upload flow already has the review step; a dedicated paste-text variant wasn't built separately).
Concrete next step for DOCX: `mammoth.js` (actively maintained, converts `.docx` to HTML/plain text
client-side) feeding into the same `detectChapters` pipeline already built.

## Export (`apps/web/src/lib/exportProject.ts`, `features/project/ExportsPage.tsx`)

All of the below produce **real, immediately downloadable files** from the current manuscript — none are
placeholder buttons.

| Format | How | Status |
|---|---|---|
| DOCX | `docx` npm package (actively maintained, browser-compatible) — title page, `Heading1` per chapter, indented paragraphs, centered scene-break markers | ✅ Real |
| Plain text | Manual concatenation, chapter headers, `* * *` scene breaks | ✅ Real |
| Markdown | `#`/`##` headings, `---` scene breaks | ✅ Real |
| Print-ready PDF | Dedicated print stylesheet (`.iw-print-area`, `manuscript.css`) + `window.print()` — author chooses "Save as PDF" in their browser's print dialog | ✅ Real, but requires a manual browser step rather than producing a `.pdf` file directly |
| Complete Inkwell project backup | Full JSON — project, chapters, scenes, story bible, relationships, storyboard, threads, timeline, goals (`buildProjectBackup`) | ✅ Real |
| EPUB | — | ❌ Not implemented |

**EPUB — concrete plan**: EPUB is a zip file containing XHTML + an OPF manifest + an NCX/nav table of
contents. No existing dependency was pulled in for this (a from-scratch implementation is a well-defined but
non-trivial chunk of work: `jszip` for the archive, hand-built XHTML per chapter from the same `plainText`
extraction already used elsewhere, a manifest listing every part). This is the concrete next export format to
build, not an open-ended unknown.

### Presets

`manuscript_submission` (title page + standard formatting), `review_copy` (no title page), `ebook`, `custom`
exist as DOCX generation options (`ExportsPage.tsx` preset selector) mapped to `DocxOptions`. Trim
size/margins/font/line-spacing/running-headers/widow-orphan-control from the full spec are **not** yet
exposed as options — the `docx` library supports most of them technically, but the settings UI for them
wasn't built in this pass.

## Backup import (round-tripping)

`buildProjectBackup`'s JSON output is not yet accepted back in as an import source. This is a real,
well-scoped gap: the JSON shape is already fully defined (`ProjectBackup` interface,
`apps/web/src/lib/exportProject.ts`) — building the importer means walking that same shape and calling the
existing repo `create*` functions, no new design work required.

## Google Drive

Not started, correctly sequenced after core local/cloud persistence per the product spec's own phasing.
Requires a Google Cloud OAuth client (owner action — see `docs/OWNER_ACTIONS_REQUIRED.md`) regardless of
implementation status.
