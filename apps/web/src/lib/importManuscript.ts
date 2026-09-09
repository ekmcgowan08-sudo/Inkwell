/**
 * Plain-text/Markdown manuscript import: detects chapter headings and splits
 * the source into a preview the author confirms before anything is created.
 * DOCX import is layered on top of this (see ImportDialog) by first
 * extracting text with mammoth, then running the same heading detection —
 * one code path, two source formats.
 */
export interface DetectedChapter {
  title: string;
  text: string;
}

export interface ImportPreview {
  chapters: DetectedChapter[];
  warnings: string[];
}

const HEADING_PATTERNS = [
  /^(chapter|part|prologue|epilogue|interlude)\b.*/i,
  /^#{1,3}\s+.+/, // markdown heading
];

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 80) return false;
  return HEADING_PATTERNS.some((p) => p.test(trimmed));
}

export function detectChapters(rawText: string): ImportPreview {
  const warnings: string[] = [];
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { chapters: [], warnings: ["The file appears to be empty."] };
  }

  const lines = normalized.split("\n");
  const chapters: DetectedChapter[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  let sawHeading = false;

  function flush() {
    if (currentTitle === null && currentLines.every((l) => !l.trim())) return;
    chapters.push({
      title: currentTitle ?? `Chapter ${chapters.length + 1}`,
      text: currentLines.join("\n").trim(),
    });
  }

  for (const line of lines) {
    if (looksLikeHeading(line)) {
      flush();
      sawHeading = true;
      currentTitle = line.trim().replace(/^#{1,3}\s+/, "");
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (!sawHeading) {
    warnings.push("No chapter headings were detected — the whole file was imported as a single chapter.");
  }

  const titleCounts = new Map<string, number>();
  for (const c of chapters) {
    const count = titleCounts.get(c.title) ?? 0;
    titleCounts.set(c.title, count + 1);
    if (count > 0) {
      warnings.push(`Duplicate chapter title "${c.title}" — later ones will be numbered to stay distinct.`);
      c.title = `${c.title} (${count + 1})`;
    }
  }

  return { chapters, warnings };
}
