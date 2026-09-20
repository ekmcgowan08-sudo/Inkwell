import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { History, RotateCcw, Save, Trash2 } from "lucide-react";
import { useProjectContext } from "./ProjectLayout";
import { db, EMPTY_ARRAY, nowIso } from "../../lib/db";
import { listChapters, listScenes, listRevisions, restoreRevision } from "../../lib/repos/manuscript";
import { buildProjectBackup, downloadJson } from "../../lib/exportProject";
import { Button } from "../../components/ui/Button";
import { SelectField, TextField } from "../../components/ui/FormControls";
import { EmptyState } from "../../components/ui/Feedback";

export function VersionsPage() {
  const { project } = useProjectContext();
  const [chapterId, setChapterId] = useState<string>("");
  const [sceneId, setSceneId] = useState<string>("");
  const [snapshotName, setSnapshotName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const chapters = useLiveQuery(() => listChapters(project.id), [project.id], EMPTY_ARRAY);
  const effectiveChapterId = chapterId || chapters[0]?.id || "";
  const scenes = useLiveQuery(() => (effectiveChapterId ? listScenes(effectiveChapterId) : []), [effectiveChapterId], EMPTY_ARRAY);
  const effectiveSceneId = sceneId || scenes[0]?.id || "";
  const revisions = useLiveQuery(() => (effectiveSceneId ? listRevisions(effectiveSceneId) : []), [effectiveSceneId], EMPTY_ARRAY);

  const snapshots = useLiveQuery(() => db.namedSnapshots.where("projectId").equals(project.id).reverse().sortBy("createdAt"), [project.id], EMPTY_ARRAY);
  const recoveryItems = useLiveQuery(() => db.deletedItems.where("projectId").equals(project.id).toArray(), [project.id], EMPTY_ARRAY);

  async function createSnapshot() {
    const backup = await buildProjectBackup(project.id);
    const filename = `${project.title.replace(/[^a-z0-9]+/gi, "-")}-${snapshotName || "snapshot"}.json`;
    downloadJson(filename, backup);
    await db.namedSnapshots.put({
      id: crypto.randomUUID(),
      projectId: project.id,
      name: snapshotName || `Snapshot ${new Date().toLocaleString()}`,
      description: null,
      createdAt: nowIso(),
      storagePath: `local-download:${filename}`,
    });
    setSnapshotName("");
  }

  async function restoreDeletedItem(itemId: string) {
    const item = recoveryItems.find((i) => i.id === itemId);
    if (!item) return;
    const restored = { ...(item.snapshot as Record<string, unknown>), deletedAt: null };
    if (item.entityType === "project") await db.projects.put(restored as never);
    else if (item.entityType === "chapter") await db.chapters.put(restored as never);
    else if (item.entityType === "story_bible_entry") await db.storyBibleEntries.put(restored as never);
    await db.deletedItems.delete(itemId);
  }

  return (
    <div className="iw-page">
      <div className="iw-page-header">
        <div className="iw-page-title iw-display">Versions & Backups</div>
      </div>
      <p className="iw-page-subtitle">Every autosave is a recoverable revision. Nothing is lost to a bad edit session.</p>

      <section style={{ marginBottom: 32 }}>
        <h2 className="iw-display" style={{ fontSize: 18 }}>
          Scene revision history
        </h2>
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <SelectField label="Chapter" value={effectiveChapterId} onChange={(e) => { setChapterId(e.target.value); setSceneId(""); }}>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </SelectField>
          <SelectField label="Scene" value={effectiveSceneId} onChange={(e) => setSceneId(e.target.value)}>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </SelectField>
        </div>
        {revisions.length === 0 && <p className="iw-help-text">No revisions recorded yet for this scene — write something and it'll appear here.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {revisions.slice(0, 30).map((r) => (
            <div key={r.id} className="iw-card" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  Revision {r.revision} · {new Date(r.createdAt).toLocaleString()} · {r.wordCount} words ·{" "}
                  <span className="iw-help-text">{r.createdBy}</span>
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" variant="ghost" onClick={() => setPreview(preview === r.id ? null : r.plainText)}>
                    Preview
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => restoreRevision(effectiveSceneId, r.id)}>
                    <RotateCcw size={13} /> Restore
                  </Button>
                </div>
              </div>
              {preview === r.plainText && (
                <div className="iw-help-text" style={{ marginTop: 8, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
                  {r.plainText || "(empty)"}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="iw-display" style={{ fontSize: 18 }}>
          Named snapshots
        </h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end" }}>
          <TextField label="Snapshot name" value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} placeholder="e.g. Before Act 3 rewrite" />
          <Button onClick={createSnapshot}>
            <Save size={14} /> Create & download
          </Button>
        </div>
        {snapshots.length === 0 ? (
          <p className="iw-help-text">No named snapshots yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {snapshots.map((s) => (
              <div key={s.id} className="iw-card" style={{ padding: 12, display: "flex", justifyContent: "space-between" }}>
                <span>
                  <History size={13} style={{ marginRight: 6 }} />
                  {s.name} · {new Date(s.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="iw-display" style={{ fontSize: 18 }}>
          Recovery bin
        </h2>
        <p className="iw-help-text">Deleted chapters, story-bible entries, and books stay here for 30 days.</p>
        {recoveryItems.length === 0 ? (
          <EmptyState title="Nothing to recover" description="Deleted items will appear here for 30 days." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recoveryItems.map((item) => (
              <div key={item.id} className="iw-card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  <Trash2 size={13} style={{ marginRight: 6 }} />
                  {item.entityType} · deleted {new Date(item.deletedAt).toLocaleDateString()} · purges {new Date(item.purgeAfter).toLocaleDateString()}
                </span>
                <Button size="sm" onClick={() => restoreDeletedItem(item.id)}>
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
