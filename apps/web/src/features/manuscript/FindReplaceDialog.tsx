import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/FormControls";
import { findMatches, replaceAll, selectMatch } from "./findReplace";

export function FindReplaceDialog({ open, onClose, editor }: { open: boolean; onClose: () => void; editor: Editor | null }) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [lastReplacedCount, setLastReplacedCount] = useState<number | null>(null);

  const matches = editor ? findMatches(editor, find) : [];

  function findNext() {
    if (!editor || matches.length === 0) return;
    const next = (matchIndex + 1) % matches.length;
    setMatchIndex(next);
    selectMatch(editor, matches[next]!);
  }

  function doReplaceAll() {
    if (!editor || !find) return;
    const count = replaceAll(editor, find, replace);
    setLastReplacedCount(count);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Find & replace">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TextField label="Find" value={find} onChange={(e) => { setFind(e.target.value); setLastReplacedCount(null); }} autoFocus />
        <TextField label="Replace with" value={replace} onChange={(e) => setReplace(e.target.value)} />
        <p className="iw-help-text">
          {find ? `${matches.length} match${matches.length === 1 ? "" : "es"} in this scene` : "Searches the current scene only."}
        </p>
        {lastReplacedCount !== null && <p className="iw-help-text">Replaced {lastReplacedCount} occurrence(s).</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" onClick={findNext} disabled={matches.length === 0}>
            Find next
          </Button>
          <Button onClick={doReplaceAll} disabled={matches.length === 0}>
            Replace all
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
