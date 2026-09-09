import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RefreshCw } from "lucide-react";
import { useProjectContext } from "../project/ProjectLayout";
import { db } from "../../lib/db";
import { runLocalConsistencyScan } from "../../lib/findingsScanner";
import { Button } from "../../components/ui/Button";
import { Badge, EmptyState } from "../../components/ui/Feedback";
import type { AIFinding } from "@inkwell/shared-types";

const SEVERITY_TONE = { low: "default", medium: "warning", high: "danger" } as const;

export function FindingsPage() {
  const { project } = useProjectContext();
  const [scanning, setScanning] = useState(false);

  const findings = useLiveQuery(() => db.aiFindings.where("projectId").equals(project.id).toArray(), [project.id]) ?? [];
  const open = findings.filter((f) => f.status === "open").sort((a, b) => b.confidence - a.confidence);
  const resolved = findings.filter((f) => f.status !== "open");

  async function runScan() {
    setScanning(true);
    try {
      await runLocalConsistencyScan(project.id);
    } finally {
      setScanning(false);
    }
  }

  async function setStatus(id: string, status: AIFinding["status"]) {
    await db.aiFindings.update(id, { status, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="iw-page">
      <div className="iw-page-header">
        <div className="iw-page-title iw-display">AI Findings</div>
        <Button size="sm" onClick={runScan} disabled={scanning}>
          <RefreshCw size={14} /> {scanning ? "Scanning…" : "Run consistency scan"}
        </Button>
      </div>
      <p className="iw-page-subtitle">
        Review AI-detected issues without interrupting writing. You're always the final authority — accept, dismiss, snooze,
        or mark anything intentional.
      </p>

      {open.length === 0 && resolved.length === 0 && (
        <EmptyState
          title="No findings yet"
          description="Run a consistency scan, or ask the AI Assistant a consistency-check question — findings from either show up here."
          action={
            <Button onClick={runScan}>
              <RefreshCw size={14} /> Run consistency scan
            </Button>
          }
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {open.map((f) => (
          <div key={f.id} className="iw-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity} severity</Badge>
                  <Badge>{f.findingType.replace(/_/g, " ")}</Badge>
                  <span className="iw-help-text">{Math.round(f.confidence * 100)}% confidence</span>
                </div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
                <p className="iw-help-text" style={{ margin: 0 }}>{f.explanation}</p>
                {f.evidence.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {f.evidence.map((e, i) => (
                      <Badge key={i}>{e.label}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Button size="sm" onClick={() => setStatus(f.id, "accepted")}>Accept</Button>
              <Button size="sm" variant="secondary" onClick={() => setStatus(f.id, "dismissed")}>Dismiss</Button>
              <Button size="sm" variant="secondary" onClick={() => setStatus(f.id, "snoozed")}>Snooze</Button>
              <Button size="sm" variant="secondary" onClick={() => setStatus(f.id, "marked_intentional")}>Mark intentional</Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus(f.id, "converted_to_task")}>Convert to revision task</Button>
            </div>
          </div>
        ))}
      </div>

      {resolved.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary className="iw-help-text" style={{ cursor: "pointer" }}>
            {resolved.length} resolved finding(s)
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {resolved.map((f) => (
              <div key={f.id} className="iw-card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{f.title}</span>
                <Badge>{f.status.replace(/_/g, " ")}</Badge>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
