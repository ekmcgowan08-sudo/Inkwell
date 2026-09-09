import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { Clock, Flame, Grid, List, Plus, Search, Star, Upload } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { db } from "../../lib/db";
import { AppShell, NavItem } from "../../components/layout/AppShell";
import { Button, IconButton } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/Feedback";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { archiveProject, duplicateProject, softDeleteProject, toggleFavorite } from "../../lib/repos/projects";
import { projectWordCount } from "../../lib/repos/manuscript";
import { NewProjectDialog, ImportDialog } from "./ProjectDialogs";
import { LayoutDashboard, Settings } from "lucide-react";
import "../../styles/dashboard.css";

type SortKey = "recent" | "title" | "progress";

export function DashboardPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [showArchived, setShowArchived] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const projects = useLiveQuery(async () => {
    if (!userId) return [];
    const all = await db.projects.where("userId").equals(userId).toArray();
    const withCounts = await Promise.all(
      all
        .filter((p) => (showArchived ? p.status === "archived" : p.status === "active"))
        .map(async (p) => {
          const words = await projectWordCount(p.id);
          const chapters = await db.chapters.where("projectId").equals(p.id).and((c) => !c.deletedAt).count();
          const characters = await db.storyBibleEntries
            .where("projectId")
            .equals(p.id)
            .and((e) => e.entryType === "character" && !e.deletedAt)
            .count();
          return { ...p, words, chapters, characters };
        }),
    );
    return withCounts;
  }, [userId, showArchived]);

  const series = useLiveQuery(async () => (userId ? db.series.where("userId").equals(userId).toArray() : []), [userId]) ?? [];

  const filtered = useMemo(() => {
    if (!projects) return [];
    let list = projects;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.genre.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "progress") sorted.sort((a, b) => b.words / Math.max(1, b.goalWords) - a.words / Math.max(1, a.goalWords));
    else sorted.sort((a, b) => new Date(b.lastEditedAt).getTime() - new Date(a.lastEditedAt).getTime());
    sorted.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
    return sorted;
  }, [projects, query, sort]);

  const totalWords = (projects ?? []).reduce((sum, p) => sum + p.words, 0);

  return (
    <AppShell
      sidebar={
        <>
          <NavItem to="/dashboard" icon={<LayoutDashboard size={17} />} label="All Books" active />
          <NavItem to="/settings/account" icon={<Settings size={17} />} label="Account" />
        </>
      }
      mobileNav={
        <>
          <a href="/dashboard" className="active">
            <LayoutDashboard size={18} /> Books
          </a>
          <a href="/settings/account">
            <Settings size={18} /> Account
          </a>
        </>
      }
    >
      <div className="iw-page">
        <div className="iw-page-header">
          <div className="iw-page-title iw-display">Your Books</div>
          <div className="iw-help-text">
            {(projects ?? []).length} projects · {totalWords.toLocaleString()} words total
          </div>
        </div>
        <p className="iw-page-subtitle">Every book keeps its own manuscript, cast, timeline, and AI memory — nothing crosses over.</p>

        <div className="iw-dash-toolbar">
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 280 }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: 12, color: "var(--color-text-secondary)" }} />
            <input
              className="iw-input"
              style={{ paddingLeft: 32 }}
              placeholder="Search books…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search books"
            />
          </div>
          <select className="iw-select" style={{ width: 160 }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
            <option value="recent">Last edited</option>
            <option value="title">Title</option>
            <option value="progress">Progress</option>
          </select>
          <Button variant={showArchived ? "primary" : "secondary"} size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            <IconButton label="Grid view" onClick={() => setView("grid")} aria-pressed={view === "grid"}>
              <Grid size={16} />
            </IconButton>
            <IconButton label="List view" onClick={() => setView("list")} aria-pressed={view === "list"}>
              <List size={16} />
            </IconButton>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <Upload size={14} /> Import
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus size={14} /> New book
          </Button>
        </div>

        {filtered.length === 0 && (
          <EmptyState
            title={showArchived ? "No archived books" : "No books yet"}
            description="Start a blank book, import an existing manuscript, or open the sample project to see how Inkwell works."
            action={
              <Button onClick={() => setNewOpen(true)}>
                <Plus size={14} /> New book
              </Button>
            }
          />
        )}

        {filtered.length > 0 && view === "grid" && (
          <div className="iw-dash-grid">
            {filtered.map((p) => {
              const pct = Math.min(100, Math.round((p.words / Math.max(1, p.goalWords)) * 100));
              return (
                <div key={p.id} className="iw-card iw-project-card" onClick={() => navigate(`/project/${p.id}/manuscript`)}>
                  <IconButton
                    label={p.isFavorite ? "Unfavorite" : "Favorite"}
                    className="iw-project-menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(p.id, !p.isFavorite);
                    }}
                  >
                    <Star size={16} fill={p.isFavorite ? "var(--color-accent)" : "none"} color="var(--color-accent)" />
                  </IconButton>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--color-accent)", marginBottom: 8 }}>
                    {p.genre || "Untitled genre"}
                  </div>
                  <div className="iw-display" style={{ fontSize: 19, fontWeight: 600, marginBottom: 14 }}>
                    {p.title}
                  </div>
                  <div className="iw-progress" style={{ marginBottom: 8 }}>
                    <div className="iw-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 14 }}>
                    <span>{p.words.toLocaleString()} / {p.goalWords.toLocaleString()} words</span>
                    <span>{pct}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)" }}>
                    <span>{p.chapters} chapters · {p.characters} cast</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={12} /> {new Date(p.lastEditedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" onClick={() => duplicateProject(p.id, userId!)}>
                      Duplicate
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => archiveProject(p.id)}>
                      {p.status === "archived" ? "Unarchive" : "Archive"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPendingDelete(p.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
            <button className="iw-new-card" onClick={() => setNewOpen(true)}>
              <Plus size={16} /> New book
            </button>
          </div>
        )}

        {filtered.length > 0 && view === "list" && (
          <div className="iw-dash-list">
            {filtered.map((p) => (
              <div key={p.id} className="iw-card iw-project-card-row" onClick={() => navigate(`/project/${p.id}/manuscript`)}>
                {p.isFavorite && <Star size={14} fill="var(--color-accent)" color="var(--color-accent)" />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.title}</div>
                  <div className="iw-help-text">
                    {p.genre || "—"} · {p.chapters} chapters · {p.words.toLocaleString()} words
                  </div>
                </div>
                <div className="iw-help-text" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Flame size={12} /> {new Date(p.lastEditedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {userId && <NewProjectDialog open={newOpen} onClose={() => setNewOpen(false)} userId={userId} series={series} />}
      {userId && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} userId={userId} />}
      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && userId && softDeleteProject(pendingDelete, userId)}
        title="Delete this book?"
        description="It moves to recovery for 30 days before being permanently removed. You can restore it from Account → Security & Data during that window."
        confirmLabel="Delete"
        danger
      />
    </AppShell>
  );
}
