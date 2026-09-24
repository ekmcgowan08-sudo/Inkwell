import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { findMatches, replaceAll } from "./findReplace";

let editor: Editor | undefined;

function makeEditor(html: string): Editor {
  editor = new Editor({ extensions: [StarterKit], content: html });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

describe("findMatches", () => {
  it("returns no matches for an empty query", () => {
    const e = makeEditor("<p>The quick fox jumps over the lazy fox.</p>");
    expect(findMatches(e, "")).toEqual([]);
  });

  it("finds every occurrence, case-insensitively", () => {
    const e = makeEditor("<p>The quick Fox jumps over the lazy fox.</p>");
    expect(findMatches(e, "fox")).toHaveLength(2);
  });

  it("finds nothing when the query isn't present", () => {
    const e = makeEditor("<p>The quick fox jumps.</p>");
    expect(findMatches(e, "dragon")).toEqual([]);
  });

  it("finds matches across separate paragraphs (separate text nodes)", () => {
    const e = makeEditor("<p>Nine ravens circled.</p><p>Nine more followed.</p>");
    expect(findMatches(e, "nine")).toHaveLength(2);
  });
});

describe("replaceAll", () => {
  it("replaces every occurrence and returns the count", () => {
    const e = makeEditor("<p>The quick fox jumps over the lazy fox.</p>");
    const count = replaceAll(e, "fox", "wolf");
    expect(count).toBe(2);
    expect(e.getText()).toBe("The quick wolf jumps over the lazy wolf.");
  });

  it("is a no-op (returns 0, leaves content unchanged) when nothing matches", () => {
    const e = makeEditor("<p>The quick fox jumps.</p>");
    const before = e.getText();
    const count = replaceAll(e, "dragon", "wolf");
    expect(count).toBe(0);
    expect(e.getText()).toBe(before);
  });

  it("keeps earlier match positions valid when replacements change the text's length", () => {
    // A shorter replacement earlier in the doc would shift every later match's position if
    // replacement ran front-to-back instead of back-to-front — this is the regression that
    // guard protects against.
    const e = makeEditor("<p>fox fox fox fox</p>");
    const count = replaceAll(e, "fox", "a");
    expect(count).toBe(4);
    expect(e.getText()).toBe("a a a a");
  });

  it("fires onUpdate exactly once for the whole batch, not once per match", () => {
    const e = makeEditor("<p>fox fox fox</p>");
    let updateCount = 0;
    e.on("update", () => updateCount++);
    replaceAll(e, "fox", "wolf");
    expect(updateCount).toBe(1);
  });
});
