import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useProjectContext } from "../project/ProjectLayout";
import { db, EMPTY_ARRAY } from "../../lib/db";
import {
  createStoryboardCard,
  deleteStoryboardCard,
  reorderStoryboardCards,
  updateStoryboardCard,
} from "../../lib/repos/storyboardTimeline";
import { Button, IconButton } from "../../components/ui/Button";
import { SelectField } from "../../components/ui/FormControls";
import type { StoryboardCard } from "@inkwell/shared-types";
import "../../styles/storyboard.css";

const OVERLAYS = {
  none: null,
  three_act: ["Act 1 — Setup", "Act 2 — Confrontation", "Act 3 — Resolution"],
  save_the_cat: ["Opening Image", "Setup", "Catalyst", "Debate", "Break into Two", "Fun and Games", "Midpoint", "Bad Guys Close In", "All Is Lost", "Finale"],
  heros_journey: ["Ordinary World", "Call to Adventure", "Trials", "Ordeal", "Reward", "The Road Back", "Resurrection", "Return"],
} as const;

function SortableCard({ card, onMoveColumn, columns }: { card: StoryboardCard; onMoveColumn: (col: string) => void; columns: string[] }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="iw-board-card" {...attributes}>
      <input
        value={card.title}
        onChange={(e) => updateStoryboardCard(card.id, { title: e.target.value })}
        style={{ background: "transparent", border: "none", fontWeight: 600, width: "100%", color: "var(--color-text-primary)", outline: "none" }}
      />
      <textarea
        value={card.summary ?? ""}
        onChange={(e) => updateStoryboardCard(card.id, { summary: e.target.value })}
        placeholder="One-line summary…"
        rows={2}
        style={{ width: "100%", background: "transparent", border: "none", color: "var(--color-text-secondary)", fontSize: "0.8125rem", resize: "none", outline: "none", marginTop: 4 }}
      />
      <div className="iw-board-card-actions">
        <button {...listeners} aria-label="Drag to reorder" style={{ cursor: "grab", background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: 11 }}>
          ⠿ drag
        </button>
        <select
          aria-label="Move to column"
          value={card.column}
          onChange={(e) => onMoveColumn(e.target.value)}
          className="iw-select"
          style={{ fontSize: 11, padding: "2px 6px", minHeight: "auto" }}
        >
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <IconButton label="Delete card" onClick={() => deleteStoryboardCard(card.id)}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  );
}

export function StoryboardPage() {
  const { project } = useProjectContext();
  const [overlay, setOverlay] = useState<keyof typeof OVERLAYS>("none");
  const [newColumnName, setNewColumnName] = useState("");

  const cards = useLiveQuery(() => db.storyboardCards.where("projectId").equals(project.id).sortBy("sortOrder"), [project.id], EMPTY_ARRAY);

  const columns = useMemo(() => {
    const fromCards = Array.from(new Set(cards.map((c) => c.column)));
    const overlayCols = OVERLAYS[overlay] ? [...OVERLAYS[overlay]!] : [];
    return Array.from(new Set([...overlayCols, ...fromCards, ...(fromCards.length === 0 && overlayCols.length === 0 ? ["Act 1"] : [])]));
  }, [cards, overlay]);

  function cardsInColumn(col: string) {
    return cards.filter((c) => c.column === col);
  }

  async function onDragEnd(col: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const colCards = cardsInColumn(col);
    const oldIndex = colCards.findIndex((c) => c.id === active.id);
    const newIndex = colCards.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(colCards, oldIndex, newIndex);
    await reorderStoryboardCards(reordered.map((c, i) => ({ id: c.id, column: col, sortOrder: i })));
  }

  async function moveByKeyboard(card: StoryboardCard, direction: -1 | 1) {
    const colCards = cardsInColumn(card.column);
    const index = colCards.findIndex((c) => c.id === card.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= colCards.length) return;
    const reordered = arrayMove(colCards, index, targetIndex);
    await reorderStoryboardCards(reordered.map((c, i) => ({ id: c.id, column: card.column, sortOrder: i })));
  }

  return (
    <div className="iw-board">
      <div className="iw-page-header">
        <div className="iw-page-title iw-display">Storyboard</div>
      </div>
      <p className="iw-page-subtitle">Scene cards, grouped and reordered however fits how you plan.</p>

      <div className="iw-overlay-banner">
        <SelectField label="Structure overlay (optional reference only)" value={overlay} onChange={(e) => setOverlay(e.target.value as keyof typeof OVERLAYS)} style={{ minWidth: 240 }}>
          <option value="none">None</option>
          <option value="three_act">Three-Act Structure</option>
          <option value="save_the_cat">Save the Cat</option>
          <option value="heros_journey">Hero's Journey</option>
        </SelectField>
        <span>Overlays relabel suggested columns — they never restrict where a card can go.</span>
      </div>

      <div className="iw-board-columns">
        {columns.map((col) => (
          <div className="iw-board-column" key={col}>
            <div className="iw-board-column-header">
              <span>{col}</span>
              <IconButton label={`Add card to ${col}`} onClick={() => createStoryboardCard(project.id, "New scene", col)}>
                <Plus size={14} />
              </IconButton>
            </div>
            <DndContext collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(col, e)}>
              <SortableContext items={cardsInColumn(col).map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {cardsInColumn(col).map((card, i) => (
                  <div key={card.id} style={{ position: "relative" }}>
                    <SortableCard card={card} columns={columns} onMoveColumn={(newCol) => updateStoryboardCard(card.id, { column: newCol, sortOrder: cardsInColumn(newCol).length })} />
                    <div style={{ display: "flex", gap: 2, position: "absolute", top: 8, right: 8 }}>
                      <IconButton label="Move up" onClick={() => moveByKeyboard(card, -1)} disabled={i === 0}>
                        <ArrowUp size={12} />
                      </IconButton>
                      <IconButton label="Move down" onClick={() => moveByKeyboard(card, 1)} disabled={i === cardsInColumn(col).length - 1}>
                        <ArrowDown size={12} />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </SortableContext>
            </DndContext>
          </div>
        ))}
        <div className="iw-board-new-column">
          <div style={{ fontSize: 12, marginBottom: 8 }}>New column</div>
          <input className="iw-input" value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} placeholder="Column name" />
          <Button
            size="sm"
            style={{ marginTop: 8, width: "100%" }}
            disabled={!newColumnName.trim()}
            onClick={async () => {
              await createStoryboardCard(project.id, "New scene", newColumnName.trim());
              setNewColumnName("");
            }}
          >
            <Plus size={13} /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}
