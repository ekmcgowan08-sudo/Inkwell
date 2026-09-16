import mammoth from "mammoth";

/**
 * Plain-text/Markdown manuscript import: detects chapter headings and splits
 * the source into a preview the author confirms before anything is created.
 * DOCX import (`extractTextFromDocx` below) is layered on top of this — it
 * turns a .docx into the same heading-annotated plain text a .md file would
 * be, then `detectChapters` runs unchanged. One detection path, three
 * source formats (.txt, .md, .docx).
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

const HEADING_TAGS: Record<string, string> = { h1: "#", h2: "##", h3: "###", h4: "###" };

/**
 * Converts mammoth's HTML output into the same plain-text shape `detectChapters`
 * already knows how to read: Word's "Heading 1/2/3" paragraph styles become
 * markdown-style `#`/`##`/`###` prefixes (mammoth maps those styles to `<h1>`-`<h4>`
 * by default), so a chapter titled with a real Word heading style is detected even if
 * its text alone wouldn't match the "chapter/part/prologue…" keyword patterns.
 */
function docxHtmlToHeadingAnnotatedText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  for (const el of Array.from(doc.body.children)) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const prefix = HEADING_TAGS[el.tagName.toLowerCase()];
    lines.push(prefix ? `${prefix} ${text}` : text, "");
  }
  return lines.join("\n");
}

/** Extracts a .docx file's content into text `detectChapters` can parse. Never sent anywhere — this runs entirely client-side. */
export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  return docxHtmlToHeadingAnnotatedText(html);
}
