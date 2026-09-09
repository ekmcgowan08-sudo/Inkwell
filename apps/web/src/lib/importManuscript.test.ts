import { describe, expect, it } from "vitest";
import { detectChapters } from "./importManuscript";

describe("detectChapters", () => {
  it("reports an empty file rather than crashing", () => {
    const result = detectChapters("   \n\n  ");
    expect(result.chapters).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/empty/i);
  });

  it("splits on Chapter headings", () => {
    const text = "Chapter 1\nFirst chapter text.\n\nChapter 2\nSecond chapter text.";
    const result = detectChapters(text);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]!.title).toBe("Chapter 1");
    expect(result.chapters[0]!.text).toContain("First chapter text");
    expect(result.chapters[1]!.title).toBe("Chapter 2");
  });

  it("splits on markdown headings and strips the hashes", () => {
    const text = "# Prologue\nSome text.\n\n## Chapter One\nMore text.";
    const result = detectChapters(text);
    expect(result.chapters.map((c) => c.title)).toEqual(["Prologue", "Chapter One"]);
  });

  it("falls back to a single chapter with a warning when no headings are found", () => {
    const result = detectChapters("Just some prose with no headings at all, spanning a paragraph.");
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]!.title).toBe("Chapter 1");
    expect(result.warnings.some((w) => /no chapter headings/i.test(w))).toBe(true);
  });

  it("disambiguates duplicate detected titles", () => {
    const text = "Chapter 1\nFirst.\n\nChapter 1\nDuplicate title text.";
    const result = detectChapters(text);
    expect(result.chapters[0]!.title).toBe("Chapter 1");
    expect(result.chapters[1]!.title).toBe("Chapter 1 (2)");
    expect(result.warnings.some((w) => /duplicate/i.test(w))).toBe(true);
  });
});
