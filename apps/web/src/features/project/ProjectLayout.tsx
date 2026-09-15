import { createContext, useContext, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Download,
  History,
  LayoutGrid,
  ListChecks,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { db } from "../../lib/db";
import { projectWordCount } from "../../lib/repos/manuscript";
import { AppShell, NavItem } from "../../components/layout/AppShell";
import { SyncStatusPill } from "../../components/ui/Feedback";
import { SyncConflictsDialog } from "../../components/sync/SyncConflictsDialog";
import { onSyncStatusChange, type SyncStatus } from "../../lib/sync";
import type { Project } from "@inkwell/shared-types";
import { updateProject } from "../../lib/repos/projects";

interface ProjectContextValue {
  project: Project;
  wordCount: number;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectContext must be used within ProjectLayout");
  return ctx;
}

export function ProjectLayout() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [conflictsOpen, setConflictsOpen] = useState(false);

  const project = useLiveQuery(() => (projectId ? db.projects.get(projectId) : undefined), [projectId]);
  const wordCount = useLiveQuery(() => (projectId ? projectWordCount(projectId) : 0), [projectId]) ?? 0;
  const chapterCount = useLiveQuery(
    () => (projectId ? db.chapters.where("projectId").equals(projectId).and((c) => !c.deletedAt).count() : 0),
    [projectId],
  ) ?? 0;

  useEffect(() => onSyncStatusChange(setSyncStatus), []);

  if (project === undefined) return null; // loading
  if (project === null || !project) {
    navigate("/dashboard");
    return null;
  }

  const section = location.pathname.split("/")[3] ?? "manuscript";
  const nav = [
    { key: "manuscript", to: "manuscript", icon: <BookOpen size={17} />, label: "Manuscript" },
    { key: "story-bible", to: "story-bible", icon: <Users size={17} />, label: "Story Bible" },
    { key: "storyboard", to: "storyboard", icon: <LayoutGrid size={17} />, label: "Storyboard" },
    { key: "timeline", to: "timeline", icon: <CalendarClock size={17} />, label: "Timeline & Goals" },
    { key: "ai", to: "ai", icon: <Sparkles size={17} />, label: "AI Assistant" },
    { key: "findings", to: "findings", icon: <ListChecks size={17} />, label: "AI Findings" },
    { key: "versions", to: "versions", icon: <History size={17} />, label: "Versions & Backups" },
    { key: "exports", to: "exports", icon: <Download size={17} />, label: "Exports" },
    { key: "settings", to: "settings", icon: <Settings size={17} />, label: "Book Settings" },
  ];

  return (
    <ProjectContext.Provider value={{ project, wordCount }}>
      <AppShell
        sidebar={
          <>
            <button
              onClick={() => navigate("/dashboard")}
              className="iw-navitem"
              style={{ color: "var(--color-text-secondary)", fontSize: 12, marginBottom: 14 }}
            >
              <ArrowLeft size={14} /> All Books
            </button>
            <input
              className="iw-display"
              value={project.title}
              onChange={(e) => updateProject(project.id, { title: e.target.value })}
              aria-label="Book title"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-accent)",
                padding: "0 10px",
                marginBottom: 14,
                background: "transparent",
                border: "none",
                outline: "none",
                width: "100%",
              }}
            />
            {nav.map((n) => (
              <NavItem key={n.key} to={n.to} icon={n.icon} label={n.label} active={section === n.key} />
            ))}
            <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <div style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, color: "var(--color-accent)" }}>This Book</div>
              <div>{wordCount.toLocaleString()} words</div>
              <div>~{Math.max(1, Math.round(wordCount / 275))} pages</div>
              <div>{chapterCount} chapters</div>
              <div style={{ marginTop: 10 }}>
                <SyncStatusPill status={syncStatus} onClick={syncStatus === "conflict" ? () => setConflictsOpen(true) : undefined} />
              </div>
            </div>
          </>
        }
      >
        <Outlet />
      </AppShell>
      <SyncConflictsDialog open={conflictsOpen} onClose={() => setConflictsOpen(false)} />
    </ProjectContext.Provider>
  );
}
