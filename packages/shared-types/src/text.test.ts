import { describe, expect, it } from "vitest";
import { countWords, estimatePageCount, estimateReadingMinutes, extractPlainText } from "./text.ts";

describe("countWords", () => {
  it("returns 0 for empty or whitespace-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("counts words split by arbitrary whitespace", () => {
    expect(countWords("The quick brown fox")).toBe(4);
    expect(countWords("  leading and trailing  \n whitespace ")).toBe(4);
  });

  it("handles unicode and punctuation common in novels", () => {
    expect(countWords("“Wren,” she said—coldly.")).toBe(3);
    expect(countWords("café naïve résumé")).toBe(3);
  });
});

describe("estimatePageCount / estimateReadingMinutes", () => {
  it("returns 0 for an empty manuscript", () => {
    expect(estimatePageCount(0)).toBe(0);
    expect(estimateReadingMinutes(0)).toBe(0);
  });

  it("rounds to at least 1 for any nonzero word count", () => {
    expect(estimatePageCount(10)).toBeGreaterThanOrEqual(1);
    expect(estimateReadingMinutes(10)).toBeGreaterThanOrEqual(1);
  });

  it("scales roughly linearly for a 100k-word manuscript", () => {
    expect(estimatePageCount(100000)).toBeCloseTo(364, -1);
  });
});

describe("extractPlainText", () => {
  it("returns raw strings unchanged", () => {
    expect(extractPlainText("plain text")).toBe("plain text");
  });

  it("flattens a ProseMirror-shaped document into plain text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First paragraph." }] },
        { type: "paragraph", content: [{ type: "text", text: "Second." }] },
      ],
    };
    expect(extractPlainText(doc).trim()).toBe("First paragraph.\n\nSecond.");
  });

  it("returns empty string for null/undefined/non-object input", () => {
    expect(extractPlainText(null)).toBe("");
    expect(extractPlainText(undefined)).toBe("");
    expect(extractPlainText(42)).toBe("");
  });
});
