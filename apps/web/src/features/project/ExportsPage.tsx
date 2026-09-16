import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Printer } from "lucide-react";
import { useProjectContext } from "./ProjectLayout";
import { db } from "../../lib/db";
import { listChapters, listScenes } from "../../lib/repos/manuscript";
import { buildProjectBackup, downloadBlob, downloadJson, downloadText, exportDocx, exportEpub, exportMarkdown, exportPlainText } from "../../lib/exportProject";
import { Button } from "../../components/ui/Button";
import { TextField, SelectField } from "../../components/ui/FormControls";
import "../../styles/manuscript.css";

const PRESETS = {
  manuscript_submission: { label: "Standard manuscript submission", authorName: "", includeTitlePage: true },
  review_copy: { label: "Personal review copy", authorName: "", includeTitlePage: false },
  ebook: { label: "Ebook", authorName: "", includeTitlePage: true },
  custom: { label: "Custom", authorName: "", includeTitlePage: true },
} as const;

export function ExportsPage() {
  const { project } = useProjectContext();
  const [preset, setPreset] = useState<keyof typeof PRESETS>("manuscript_submission");
  const [authorName, setAuthorName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const printChapters = useLiveQuery(async () => {
    if (!printing) return [];
    const chapters = await listChapters(project.id);
    const result: { title: string; scenes: { title: string; plainText: string }[] }[] = [];
    for (const c of chapters) {
      const scenes = await listScenes(c.id);
      result.push({ title: c.title, scenes: scenes.map((s) => ({ title: s.title, plainText: s.plainText })) });
    }
    return result;
  }, [printing, project.id]) ?? [];

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "manuscript";

  async function doPrint() {
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 50)); // let the print view render before invoking print
    window.print();
    setPrinting(false);
  }

  return (
    <div className="iw-page">
      <div className="iw-page-header">
        <div className="iw-page-title iw-display">Exports</div>
      </div>
      <p className="iw-page-subtitle">Generates real files from your current manuscript — nothing here is a placeholder.</p>

      <div className="iw-card" style={{ padding: 20, maxWidth: 520, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>DOCX export settings</div>
        <SelectField label="Preset" value={preset} onChange={(e) => setPreset(e.target.value as keyof typeof PRESETS)}>
          {Object.entries(PRESETS).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
        </SelectField>
        <div style={{ marginTop: 12 }}>
          <TextField label="Author name (title page)" value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>
        <ExportRow
          title="Word (.docx)"
          description="Title page, chapter headings, scene breaks — ready to open in Word or Google Docs."
          busy={busy === "docx"}
          onClick={() =>
            withBusy("docx", async () => {
              const blob = await exportDocx(project, { authorName, includeTitlePage: PRESETS[preset].includeTitlePage });
              downloadBlob(`${slug}.docx`, blob);
            })
          }
        />
        <ExportRow
          title="Plain text (.txt)"
          description="Every chapter and scene, concatenated in order."
          busy={busy === "txt"}
          onClick={() =>
            withBusy("txt", async () => {
              downloadText(`${slug}.txt`, await exportPlainText(project));
            })
          }
        />
        <ExportRow
          title="Markdown (.md)"
          description="Headings per chapter, scene breaks as horizontal rules."
          busy={busy === "md"}
          onClick={() =>
            withBusy("md", async () => {
              downloadText(`${slug}.md`, await exportMarkdown(project), "text/markdown");
            })
          }
        />
        <ExportRow
          title="EPUB (.epub)"
          description="A real EPUB 3 package — title, chapters, and a navigable table of contents — for e-readers and apps like Apple Books."
          busy={busy === "epub"}
          onClick={() =>
            withBusy("epub", async () => {
              const blob = await exportEpub(project, { authorName });
              downloadBlob(`${slug}.epub`, blob);
            })
          }
        />
        <ExportRow
          title="Print-ready PDF"
          description="Opens your browser's print dialog with a print-formatted layout — choose 'Save as PDF'."
          icon={<Printer size={16} />}
          busy={printing}
          onClick={doPrint}
        />
        <ExportRow
          title="Complete Inkwell project backup (.json)"
          description="Everything: manuscript, story bible, storyboard, timeline, goals. Use this to restore or move the project."
          busy={busy === "backup"}
          onClick={() =>
            withBusy("backup", async () => {
              downloadJson(`${slug}-inkwell-backup.json`, await buildProjectBackup(project.id));
            })
          }
        />
      </div>


      {printing && (
        <div className="iw-print-area" aria-hidden={!printing}>
          <h1>{project.title}</h1>
          {printChapters.map((c, i) => (
            <div key={i}>
              <h2>{c.title}</h2>
              {c.scenes.map((s, j) => (
                <div key={j} style={{ whiteSpace: "pre-wrap", marginBottom: "1em" }}>
                  {s.plainText}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportRow({
  title,
  description,
  onClick,
  busy,
  icon,
}: {
  title: string;
  description: string;
  onClick: () => void;
  busy?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="iw-card" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div className="iw-help-text">{description}</div>
      </div>
      <Button size="sm" onClick={onClick} disabled={busy}>
        {icon ?? <Download size={14} />} {busy ? "Working…" : "Export"}
      </Button>
    </div>
  );
}
