import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus, ScanSearch, Search, Trash2, X } from "lucide-react";
import type { CharacterFields, StoryBibleEntry } from "@inkwell/shared-types";
import { useProjectContext } from "../project/ProjectLayout";
import { useAuth } from "../../lib/auth";
import { db, EMPTY_ARRAY } from "../../lib/db";
import { createEntry, createRelationship, deleteRelationship, softDeleteEntry, updateCharacterField, updateEntry } from "../../lib/repos/storyBible";
import { confirmAppearance, detectAppearances, dismissAppearance } from "../../lib/repos/appearances";
import { Button, IconButton } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/Feedback";
import { TextAreaField, SelectField } from "../../components/ui/FormControls";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { Badge } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/Toast";
import { RelationshipMap } from "./RelationshipMap";
import "../../styles/storyBible.css";

const TYPES: { key: StoryBibleEntry["entryType"]; label: string }[] = [
  { key: "character", label: "Characters" },
  { key: "location", label: "Locations" },
  { key: "lore", label: "Lore & World Rules" },
  { key: "object", label: "Objects" },
  { key: "organization", label: "Organizations" },
  { key: "custom", label: "Custom" },
];

const CHARACTER_FIELDS: { key: keyof CharacterFields; label: string; full?: boolean }[] = [
  { key: "role", label: "Role" },
  { key: "pronouns", label: "Pronouns" },
  { key: "ageOrBirth", label: "Age / birth" },
  { key: "eyes", label: "Eyes" },
  { key: "hair", label: "Hair" },
  { key: "build", label: "Build" },
  { key: "clothing", label: "Outfit / signature look", full: true },
  { key: "distinguishingMarks", label: "Distinguishing marks", full: true },
  { key: "voice", label: "Voice", full: true },
  { key: "mannerisms", label: "Mannerisms", full: true },
  { key: "personality", label: "Personality", full: true },
  { key: "motivations", label: "Motivations", full: true },
  { key: "fears", label: "Fears", full: true },
  { key: "backstory", label: "Backstory", full: true },
  { key: "secrets", label: "Secrets", full: true },
  { key: "arc", label: "Arc", full: true },
];

export function StoryBiblePage() {
  const { project } = useProjectContext();
  const { userId } = useAuth();
  const [activeType, setActiveType] = useState<StoryBibleEntry["entryType"]>("character");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mapView, setMapView] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newRelType, setNewRelType] = useState("");
  const [newRelTarget, setNewRelTarget] = useState("");
  const [scanning, setScanning] = useState(false);
  const { show } = useToast();

  const entries = useLiveQuery(
    () =>
      db.storyBibleEntries
        .where("projectId")
        .equals(project.id)
        .and((e) => !e.deletedAt && e.entryType === activeType)
        .toArray(),
    [project.id, activeType],
    EMPTY_ARRAY,
  );

  const allEntries = useLiveQuery(
    () =>
      db.storyBibleEntries
        .where("projectId")
        .equals(project.id)
        .and((e) => !e.deletedAt)
        .toArray(),
    [project.id],
    EMPTY_ARRAY,
  );

  const relationships = useLiveQuery(() => db.relationships.where("projectId").equals(project.id).toArray(), [project.id], EMPTY_ARRAY);

  const scenes = useLiveQuery(
    () =>
      db.scenes
        .where("projectId")
        .equals(project.id)
        .and((s) => !s.deletedAt)
        .toArray(),
    [project.id],
    EMPTY_ARRAY,
  );
  const appearances = useLiveQuery(() => db.appearances.where("projectId").equals(project.id).toArray(), [project.id], EMPTY_ARRAY);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)));
  }, [entries, query]);

  const active = entries.find((e) => e.id === activeId) ?? filtered[0];
  const activeRelationships = active ? relationships.filter((r) => r.fromEntryId === active.id || r.toEntryId === active.id) : [];
  const activeAppearances = active ? appearances.filter((a) => a.entryId === active.id) : [];
  const confirmedAppearances = activeAppearances.filter((a) => a.confirmed);
  const suggestedAppearances = activeAppearances.filter((a) => !a.confirmed);

  async function onAdd() {
    const label = TYPES.find((t) => t.key === activeType)!.label.replace(/s$/, "");
    const entry = await createEntry(project.id, activeType, `New ${label}`);
    setActiveId(entry.id);
  }

  async function onScanForAppearances() {
    setScanning(true);
    try {
      const created = await detectAppearances(project.id);
      show(
        created.length === 0 ? "No new appearances found." : `Found ${created.length} new suggested appearance${created.length === 1 ? "" : "s"}.`,
      );
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="iw-sb-layout">
      <div className="iw-sb-list">
        <div className="iw-sb-type-tabs">
          {TYPES.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={activeType === t.key ? "primary" : "secondary"}
              onClick={() => {
                setActiveType(t.key);
                setActiveId(null);
              }}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={14} style={{ position: "absolute", left: 8, top: 11, color: "var(--color-text-secondary)" }} />
          <input className="iw-input" style={{ paddingLeft: 28 }} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button size="sm" variant="secondary" onClick={onScanForAppearances} disabled={scanning} style={{ marginBottom: 12, width: "100%" }}>
          <ScanSearch size={13} /> {scanning ? "Scanning…" : "Scan manuscript for appearances"}
        </Button>
        {filtered.map((e) => (
          <button key={e.id} className={`iw-sb-list-item ${e.id === active?.id ? "active" : ""}`} onClick={() => setActiveId(e.id)}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
            <div className="iw-help-text">{e.canonStatus}</div>
          </button>
        ))}
        <button
          onClick={onAdd}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "none",
            border: "1px dashed var(--color-border-strong)",
            borderRadius: 6,
            color: "var(--color-text-secondary)",
            padding: "8px 8px",
            fontSize: 12,
            cursor: "pointer",
            marginTop: 6,
          }}
        >
          <Plus size={13} /> Add{" "}
          {TYPES.find((t) => t.key === activeType)!
            .label.replace(/s$/, "")
            .toLowerCase()}
        </button>
      </div>

      <div className="iw-sb-detail">
        {!active && (
          <EmptyState
            title="Nothing here yet"
            description="Add an entry to start building your story bible. Every field is optional — structure never blocks freeform writing."
            action={
              <Button onClick={onAdd}>
                <Plus size={14} /> Add entry
              </Button>
            }
          />
        )}
        {active && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <input
                  className="iw-display"
                  value={active.name}
                  onChange={(e) => updateEntry(active.id, { name: e.target.value })}
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    background: "transparent",
                    border: "none",
                    color: "var(--color-text-primary)",
                    outline: "none",
                    width: "100%",
                  }}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, marginBottom: 20 }}>
                  <SelectField
                    label="Canon status"
                    value={active.canonStatus}
                    onChange={(e) => updateEntry(active.id, { canonStatus: e.target.value as StoryBibleEntry["canonStatus"] })}
                    style={{ width: 160 }}
                  >
                    <option value="canon">Canon</option>
                    <option value="draft">Draft</option>
                    <option value="speculative">Speculative</option>
                  </SelectField>
                  <Badge tone={active.canonStatus === "canon" ? "success" : active.canonStatus === "speculative" ? "warning" : "default"}>
                    {active.canonStatus}
                  </Badge>
                </div>
              </div>
              <IconButton label="Delete entry" onClick={() => setDeleteId(active.id)}>
                <Trash2 size={16} />
              </IconButton>
            </div>

            <TextAreaField
              label="Summary"
              value={active.summary ?? ""}
              onChange={(e) => updateEntry(active.id, { summary: e.target.value })}
              rows={2}
            />

            <div className="iw-sb-fields" style={{ marginTop: 16 }}>
              {active.entryType === "character" ? (
                CHARACTER_FIELDS.map((f) => (
                  <div key={f.key} className={f.full ? "full" : undefined}>
                    <TextAreaField
                      label={f.label}
                      value={(active.fields as CharacterFields)[f.key] ?? ""}
                      onChange={(e) => updateCharacterField(active.id, f.key, e.target.value)}
                      rows={f.full ? 2 : 2}
                    />
                  </div>
                ))
              ) : (
                <div className="full">
                  <TextAreaField
                    label="Notes"
                    value={active.notes ?? ""}
                    onChange={(e) => updateEntry(active.id, { notes: e.target.value })}
                    rows={6}
                  />
                </div>
              )}
              <div className="full">
                <TextAreaField
                  label="Tags (comma-separated)"
                  value={active.tags.join(", ")}
                  onChange={(e) =>
                    updateEntry(active.id, {
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  rows={1}
                />
              </div>
            </div>

            <section style={{ marginTop: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 className="iw-display" style={{ fontSize: 18, margin: 0 }}>
                  Relationships
                </h2>
                <Button size="sm" variant="secondary" onClick={() => setMapView((v) => !v)}>
                  {mapView ? "Show list" : "Show map"}
                </Button>
              </div>

              {mapView ? (
                <RelationshipMap entries={allEntries} relationships={relationships} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeRelationships.length === 0 && <p className="iw-help-text">No relationships yet.</p>}
                  {activeRelationships.map((r) => {
                    const otherId = r.fromEntryId === active.id ? r.toEntryId : r.fromEntryId;
                    const other = allEntries.find((e) => e.id === otherId);
                    return (
                      <div
                        key={r.id}
                        className="iw-card"
                        style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span>
                          <strong>{other?.name ?? "Unknown"}</strong> — {r.relationshipType}{" "}
                          <Badge tone={r.status === "conflict" ? "danger" : r.status === "alliance" ? "success" : "default"}>{r.status}</Badge>
                        </span>
                        <IconButton label="Remove relationship" onClick={() => deleteRelationship(r.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <SelectField label="Link to" value={newRelTarget} onChange={(e) => setNewRelTarget(e.target.value)} style={{ minWidth: 160 }}>
                  <option value="">Choose entry…</option>
                  {allEntries
                    .filter((e) => e.id !== active.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </SelectField>
                <TextAreaField
                  label="Relationship"
                  rows={1}
                  value={newRelType}
                  onChange={(e) => setNewRelType(e.target.value)}
                  placeholder="e.g. mentor, rival, sibling"
                />
                <Button
                  size="sm"
                  disabled={!newRelTarget || !newRelType}
                  onClick={async () => {
                    await createRelationship(project.id, active.id, newRelTarget, newRelType);
                    setNewRelType("");
                    setNewRelTarget("");
                  }}
                >
                  Add
                </Button>
              </div>
            </section>

            <section style={{ marginTop: 32 }}>
              <h2 className="iw-display" style={{ fontSize: 18, margin: 0, marginBottom: 12 }}>
                Appearances
              </h2>

              {suggestedAppearances.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="iw-help-text" style={{ marginBottom: 6 }}>
                    Suggested from "Scan manuscript for appearances" — not confirmed yet.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {suggestedAppearances.map((a) => {
                      const scene = scenes.find((s) => s.id === a.sceneId);
                      return (
                        <div
                          key={a.id}
                          className="iw-card"
                          style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                        >
                          <span>{scene?.title ?? "Unknown scene"}</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <IconButton label="Confirm appearance" onClick={() => confirmAppearance(a.id)}>
                              <Check size={14} />
                            </IconButton>
                            <IconButton label="Dismiss suggestion" onClick={() => dismissAppearance(a.id)}>
                              <X size={14} />
                            </IconButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {confirmedAppearances.length === 0 ? (
                <p className="iw-help-text">No confirmed appearances yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {confirmedAppearances.map((a) => {
                    const scene = scenes.find((s) => s.id === a.sceneId);
                    return (
                      <div
                        key={a.id}
                        className="iw-card"
                        style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span>{scene?.title ?? "Unknown scene"}</span>
                        <IconButton label="Remove appearance" onClick={() => dismissAppearance(a.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && userId && softDeleteEntry(deleteId, project.id, userId)}
        title="Delete this entry?"
        description="It moves to recovery for 30 days before permanent removal."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
