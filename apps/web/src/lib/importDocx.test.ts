import { describe, expect, it, vi, beforeEach } from "vitest";
import { detectChapters, extractTextFromDocx } from "./importManuscript";

/**
 * mammoth.convertToHtml is mocked here rather than fed a real generated .docx: mammoth's own
 * parsing is out of scope to re-verify (it's an established upstream library), and — separately
 * — Vitest resolves Node packages through Vite's SSR module runner, which doesn't apply the
 * package.json "browser" field mammoth relies on to accept an `{ arrayBuffer }` input at all (it
 * only accepts `{ path }`/`{ buffer }` under plain Node). The real apps/web browser build (a
 * client bundle, not SSR) does apply that field — confirmed by inspecting the built output, where
 * mammoth's bundled `openZip` checks `e.arrayBuffer`, not `e.path`/`e.buffer`. What's actually
 * ours to test is `extractTextFromDocx`'s HTML-to-heading-annotated-text conversion, below.
 */
const convertToHtml = vi.fn();
vi.mock("mammoth", () => ({ default: { convertToHtml: (...args: unknown[]) => convertToHtml(...args) } }));

function fakeFile(): File {
  return { arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File;
}

describe("extractTextFromDocx", () => {
  beforeEach(() => {
    convertToHtml.mockReset();
  });

  it("turns mammoth's <h1> output (Word's Heading 1 style) into a markdown-style heading detectChapters recognizes", async () => {
    convertToHtml.mockResolvedValue({
      value: "<h1>Chapter One</h1><p>It was a dark and stormy night.</p><h1>Chapter Two</h1><p>The ravens circled twice.</p>",
      messages: [],
    });

    const text = await extractTextFromDocx(fakeFile());
    expect(text).toContain("# Chapter One");
    expect(text).toContain("# Chapter Two");

    const preview = detectChapters(text);
    expect(preview.chapters).toHaveLength(2);
    expect(preview.chapters[0]!.title).toBe("Chapter One");
    expect(preview.chapters[0]!.text).toContain("dark and stormy night");
    expect(preview.chapters[1]!.title).toBe("Chapter Two");
    expect(preview.chapters[1]!.text).toContain("ravens circled twice");
  });

  it("still detects a heading by keyword when the paragraph wasn't styled as a Word heading", async () => {
    convertToHtml.mockResolvedValue({
      value: "<p>Chapter One: The Beginning</p><p>Some prose here.</p>",
      messages: [],
    });

    const text = await extractTextFromDocx(fakeFile());
    const preview = detectChapters(text);
    expect(preview.chapters).toHaveLength(1);
    expect(preview.chapters[0]!.title).toBe("Chapter One: The Beginning");
    expect(preview.chapters[0]!.text).toContain("Some prose here.");
  });

  it("maps Heading 2 and Heading 3 the same way as Heading 1", async () => {
    convertToHtml.mockResolvedValue({ value: "<h2>Part One</h2><h3>Chapter One</h3><p>Text.</p>", messages: [] });

    const text = await extractTextFromDocx(fakeFile());
    expect(text).toContain("## Part One");
    expect(text).toContain("### Chapter One");
  });
});
