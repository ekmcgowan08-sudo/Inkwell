/**
 * Shared, pure text-metric helpers. Used by the editor (live counts), the
 * dashboard (progress bars), goals/streaks, and the AI context budgeter —
 * kept in one place so every client and the edge functions agree on numbers.
 */

const WORDS_PER_PAGE = 275; // standard manuscript-format estimate
const WORDS_PER_MINUTE_READING = 238; // silent adult reading average

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countCharacters(text: string): number {
  return text.length;
}

export function countParagraphs(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\n{2,}/).filter((p) => p.trim().length > 0).length;
}

export function estimatePageCount(wordCount: number): number {
  return Math.max(wordCount > 0 ? 1 : 0, Math.round(wordCount / WORDS_PER_PAGE));
}

export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(wordCount > 0 ? 1 : 0, Math.round(wordCount / WORDS_PER_MINUTE_READING));
}

/** Extracts plain text from a canonical rich-text (ProseMirror-shaped) document for search/AI/word-count use. */
export function extractPlainText(doc: unknown): string {
  if (typeof doc === "string") return doc;
  if (!doc || typeof doc !== "object") return "";
  const node = doc as { type?: string; text?: string; content?: unknown[] };
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    const isBlock = node.type === "paragraph" || node.type === "heading" || node.type === "scene_break";
    const inner = node.content.map(extractPlainText).join("");
    return isBlock ? inner + "\n\n" : inner;
  }
  return "";
}
