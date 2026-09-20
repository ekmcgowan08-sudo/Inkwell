import { Fragment } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, EMPTY_ARRAY, type SyncConflict } from "../../lib/db";
import { resolveConflictKeepMine, resolveConflictKeepTheirs } from "../../lib/sync";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

const TABLE_LABELS: Record<string, string> = {
  projects: "Book",
  chapters: "Chapter",
  scenes: "Scene",
  story_bible_entries: "Story bible entry",
};

const HIDDEN_FIELDS = new Set(["id", "revision", "createdAt", "updatedAt", "created_at", "updated_at"]);

function conflictLabel(table: string, row: Record<string, unknown>, recordId: string): string {
  const name = (row.title ?? row.name) as string | undefined;
  const kind = TABLE_LABELS[table] ?? table;
  return name ? `${kind}: "${name}"` : `${kind} ${recordId.slice(0, 8)}`;
}

/** Fields that actually differ between the two versions — the only ones worth showing the author. */
function diffFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const key of keys) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out.push(key);
  }
  return out;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 120);
  return String(v).slice(0, 200);
}

function ConflictCard({ conflict }: { conflict: SyncConflict }) {
  const fields = diffFields(conflict.localRow, conflict.serverRow);
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{conflictLabel(conflict.table, conflict.localRow, conflict.recordId)}</div>
      <div className="iw-help-text" style={{ marginBottom: 10 }}>
        This was edited on another device before this device's change could sync. Choose which version to keep.
      </div>
      {fields.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "4px 12px", fontSize: 12, marginBottom: 12 }}>
          <div />
          <div style={{ fontWeight: 600 }}>This device</div>
          <div style={{ fontWeight: 600 }}>Other device</div>
          {fields.map((field) => (
            <Fragment key={field}>
              <div style={{ color: "var(--color-text-secondary)" }}>{field}</div>
              <div style={{ wordBreak: "break-word" }}>{formatValue(conflict.localRow[field])}</div>
              <div style={{ wordBreak: "break-word" }}>{formatValue(conflict.serverRow[field])}</div>
            </Fragment>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" onClick={() => resolveConflictKeepMine(conflict.id)}>
          Keep this device's version
        </Button>
        <Button size="sm" variant="secondary" onClick={() => resolveConflictKeepTheirs(conflict.id)}>
          Keep the other version
        </Button>
      </div>
    </div>
  );
}

export function SyncConflictsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const conflicts = useLiveQuery(() => db.syncConflicts.toArray(), [], EMPTY_ARRAY);

  return (
    <Dialog open={open} onClose={onClose} title="Sync conflicts">
      {conflicts.length === 0 ? (
        <p>No sync conflicts.</p>
      ) : (
        <>
          <p className="iw-help-text" style={{ marginBottom: 14 }}>
            {conflicts.length} {conflicts.length === 1 ? "item" : "items"} changed on two devices before they could sync. Nothing was lost — both
            versions are shown below.
          </p>
          {conflicts.map((c) => (
            <ConflictCard key={c.id} conflict={c} />
          ))}
        </>
      )}
    </Dialog>
  );
}
