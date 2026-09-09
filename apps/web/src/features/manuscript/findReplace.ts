import type { Editor } from "@tiptap/react";

export interface Match {
  from: number;
  to: number;
}

/** Plain substring search across the document's text nodes (case-insensitive). */
export function findMatches(editor: Editor, query: string): Match[] {
  if (!query) return [];
  const matches: Match[] = [];
  const needle = query.toLowerCase();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const haystack = node.text.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + query.length });
      index = haystack.indexOf(needle, index + 1);
    }
  });
  return matches;
}

export function selectMatch(editor: Editor, match: Match): void {
  editor.chain().focus().setTextSelection(match).scrollIntoView().run();
}

/** Replaces every match. Walks back-to-front so earlier match positions stay valid as later ones are replaced. */
export function replaceAll(editor: Editor, query: string, replacement: string): number {
  const matches = findMatches(editor, query);
  let chain = editor.chain();
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    chain = chain.insertContentAt({ from: m.from, to: m.to }, replacement);
  }
  chain.run();
  return matches.length;
}
