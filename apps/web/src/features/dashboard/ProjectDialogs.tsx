import { useRef, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { TextField, SelectField } from "../../components/ui/FormControls";
import { createProject, createSeries } from "../../lib/repos/projects";
import { createChapter, listChapters, listScenes, autosaveScene } from "../../lib/repos/manuscript";
import { db } from "../../lib/db";
import { detectChapters, extractTextFromDocx, type ImportPreview } from "../../lib/importManuscript";
import type { Series } from "@inkwell/shared-types";
import { useNavigate } from "react-router-dom";

export function NewProjectDialog({ open, onClose, userId, series }: { open: boolean; onClose: () => void; userId: string; series: Series[] }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [seriesChoice, setSeriesChoice] = useState<string>("");
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let seriesId: string | null = null;
    if (seriesChoice === "__new__" && newSeriesTitle.trim()) {
      const s = await createSeries(userId, newSeriesTitle.trim());
      seriesId = s.id;
    } else if (seriesChoice) {
      seriesId = seriesChoice;
    }
    const project = await createProject(userId, { title: title.trim() || "Untitled Book", genre: genre.trim(), seriesId });
    setBusy(false);
    onClose();
    navigate(`/project/${project.id}/manuscript`);
  }

  return (
    <Dialog open={open} onClose={onClose} title="New book">
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <TextField label="Genre" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. Epic Fantasy" />
        <SelectField label="Series" value={seriesChoice} onChange={(e) => setSeriesChoice(e.target.value)}>
          <option value="">Standalone book</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
          <option value="__new__">+ New series…</option>
        </SelectField>
        {seriesChoice === "__new__" && (
          <TextField label="New series title" value={newSeriesTitle} onChange={(e) => setNewSeriesTitle(e.target.value)} />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create book"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ImportDialog({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFileChosen(file: File) {
    setError(null);
    setTitle(file.name.replace(/\.(txt|md|markdown|docx)$/i, ""));
    try {
      const isDocx = /\.docx$/i.test(file.name);
      const text = isDocx ? await extractTextFromDocx(file) : await file.text();
      setPreview(detectChapters(text));
    } catch {
      setError("Couldn't read that file. Supported formats: .txt, .md, and .docx.");
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    try {
      const project = await createProject(userId, { title: title || "Imported Book" });
      // Remove the placeholder chapter/scene the fresh project ships with.
      for (const c of await listChapters(project.id)) {
        for (const s of await listScenes(c.id)) await db.scenes.delete(s.id);
        await db.chapters.delete(c.id);
      }
      for (const detected of preview.chapters) {
        const chapter = await createChapter(project.id, detected.title);
        const scenes = await listScenes(chapter.id);
        const doc = {
          type: "doc",
          content: detected.text.split(/\n{2,}/).map((p) => ({ type: "paragraph", content: p.trim() ? [{ type: "text", text: p.trim() }] : [] })),
        };
        if (scenes[0]) await autosaveScene(scenes[0].id, doc);
      }
      onClose();
      navigate(`/project/${project.id}/manuscript`);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import a manuscript"
    >
      {!preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="iw-help-text">
            Upload a .txt, .md, or .docx file. We'll detect chapter headings automatically (including Word's "Heading" styles) and show you a preview
            before anything is created — nothing is imported silently.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.markdown,.docx"
            onChange={(e) => e.target.files?.[0] && onFileChosen(e.target.files[0])}
          />
          {error && <p className="iw-field-error">{error}</p>}
        </div>
      )}
      {preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextField label="Book title" value={title} onChange={(e) => setTitle(e.target.value)} />
          {preview.warnings.map((w, i) => (
            <p key={i} className="iw-help-text" style={{ color: "var(--color-warning)" }}>
              ⚠ {w}
            </p>
          ))}
          <div className="iw-help-text">Detected {preview.chapters.length} chapter(s):</div>
          <ul style={{ maxHeight: 200, overflow: "auto", margin: 0, paddingLeft: 20 }}>
            {preview.chapters.map((c, i) => (
              <li key={i}>
                {c.title} <span className="iw-help-text">({c.text.split(/\s+/).filter(Boolean).length} words)</span>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="secondary" onClick={reset}>
              Choose a different file
            </Button>
            <Button onClick={confirmImport} disabled={busy}>
              {busy ? "Importing…" : `Create book from ${preview.chapters.length} chapter(s)`}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
