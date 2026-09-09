import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "./ProjectLayout";
import { useAuth } from "../../lib/auth";
import { updateProject, softDeleteProject } from "../../lib/repos/projects";
import { TextField, SelectField } from "../../components/ui/FormControls";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";

export function BookSettingsPage() {
  const { project } = useProjectContext();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="iw-page" style={{ maxWidth: 640 }}>
      <div className="iw-page-header">
        <div className="iw-page-title iw-display">Book Settings</div>
      </div>

      <div className="iw-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Details</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextField label="Title" value={project.title} onChange={(e) => updateProject(project.id, { title: e.target.value })} />
          <TextField label="Genre" value={project.genre} onChange={(e) => updateProject(project.id, { genre: e.target.value })} />
          <SelectField
            label="Writing style"
            value={project.writingStyle}
            onChange={(e) => updateProject(project.id, { writingStyle: e.target.value as typeof project.writingStyle })}
            hint="Purely informational — it never hides or locks any feature."
          >
            <option value="unset">Not set</option>
            <option value="plotter">Plotter</option>
            <option value="discovery">Discovery writer</option>
            <option value="custom">A bit of both</option>
          </SelectField>
        </div>
      </div>

      <div className="iw-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Goals</div>
        <div style={{ display: "flex", gap: 12 }}>
          <TextField
            label="Book goal (words)"
            type="number"
            value={project.goalWords}
            onChange={(e) => updateProject(project.id, { goalWords: Number(e.target.value) || 0 })}
          />
          <TextField
            label="Daily goal (words)"
            type="number"
            value={project.dailyGoalWords}
            onChange={(e) => updateProject(project.id, { dailyGoalWords: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="iw-card" style={{ padding: 20, borderColor: "var(--color-danger)" }}>
        <div style={{ fontWeight: 600, marginBottom: 12, color: "var(--color-danger)" }}>Danger zone</div>
        <p className="iw-help-text" style={{ marginBottom: 12 }}>
          Deleting a book moves it to recovery for 30 days before permanent removal — export a backup first if you want to
          keep a copy indefinitely (see the Exports tab).
        </p>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Delete this book
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (userId) await softDeleteProject(project.id, userId);
          navigate("/dashboard");
        }}
        title="Delete this book?"
        description={`"${project.title}" moves to recovery for 30 days. This cannot be undone from here after that window.`}
        confirmLabel="Delete book"
        danger
      />
    </div>
  );
}
