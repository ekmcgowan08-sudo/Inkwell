import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Maximize2, Minimize2, Plus, Trash2 } from "lucide-react";
import { db, EMPTY_ARRAY } from "../../lib/db";
import type { Chapter, Part } from "@inkwell/shared-types";
import { useAuth } from "../../lib/auth";
import { useProjectContext } from "../project/ProjectLayout";
import {
  assignChapterToPart,
  createChapter,
  createPart,
  createScene,
  autosaveScene,
  deletePart,
  listScenes,
  projectWordCount,
  renameChapter,
  renamePart,
  reorderChapters,
  softDeleteChapter,
} from "../../lib/repos/manuscript";
import { recordWordsWrittenToday } from "../../lib/repos/storyboardTimeline";
import { endWritingSession, startWritingSession } from "../../lib/repos/writingSessions";
import { countWords, estimatePageCount, estimateReadingMinutes, extractPlainText } from "@inkwell/shared-types";
import { Button, IconButton } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/Feedback";
import { EditorToolbar } from "./EditorToolbar";
import { FindReplaceDialog } from "./FindReplaceDialog";
import "../../styles/manuscript.css";

const AUTOSAVE_IDLE_MS = 1500;

/** One draggable chapter row. Pointer drag (dnd-kit) and the up/down buttons are two paths to the same reorder — the buttons are the keyboard/screen-reader-accessible alternative, not an afterthought. */
function SortableChapterRow({
  chapter,
  active,
  index,
  count,
  parts,
  onOpen,
  onDelete,
  onMove,
  onMovePart,
}: {
  chapter: Chapter;
  active: boolean;
  index: number;
  count: number;
  parts: Part[];
  onOpen: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onMovePart: (partId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: chapter.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={`iw-ms-chapter-item ${active ? "active" : ""}`}>
      <button
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${chapter.title}`}
        style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "grab", padding: 4, display: "flex" }}
      >
        <GripVertical size={13} />
      </button>
      <button className="title" onClick={onOpen}>
        {chapter.title}
      </button>
      {parts.length > 0 && (
        <select
          aria-label={`Part for ${chapter.title}`}
          value={chapter.partId ?? ""}
          onChange={(e) => onMovePart(e.target.value || null)}
          className="iw-select"
          style={{ fontSize: 10, padding: "1px 4px", minHeight: "auto", maxWidth: 90 }}
        >
          <option value="">No part</option>
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      )}
      <IconButton label="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
        <ArrowUp size={12} />
      </IconButton>
      <IconButton label="Move down" onClick={() => onMove(1)} disabled={index === count - 1}>
        <ArrowDown size={12} />
      </IconButton>
      <IconButton label={`Delete ${chapter.title}`} onClick={onDelete}>
        <Trash2 size={13} />
      </IconButton>
    </div>
  );
}

export function ManuscriptPage() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const { project, wordCount } = useProjectContext();
  const [focusMode, setFocusMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [deleteChapterId, setDeleteChapterId] = useState<string | null>(null);
  const [deletePartId, setDeletePartId] = useState<string | null>(null);
  const [newPartTitle, setNewPartTitle] = useState("");
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("saved");
  const [sceneWordCount, setSceneWordCount] = useState(0);
  const [wordCountSyncedSceneId, setWordCountSyncedSceneId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingContent = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // Native desktop menu items (View > Toggle Focus Mode / Edit > Find &
  // Replace) — no-ops in a plain browser. See lib/desktopBridge.ts.
  useEffect(() => {
    function onForwarded(e: Event) {
      const action = (e as CustomEvent<string>).detail;
      if (action === "focus_mode") setFocusMode((v) => !v);
      else if (action === "find") setFindOpen(true);
    }
    window.addEventListener("inkwell-menu-action-forwarded", onForwarded);
    return () => window.removeEventListener("inkwell-menu-action-forwarded", onForwarded);
  }, []);

  const chapters = useLiveQuery(
    () => db.chapters.where("projectId").equals(project.id).and((c) => !c.deletedAt).sortBy("sortOrder"),
    [project.id],
    EMPTY_ARRAY,
  );

  const parts = useLiveQuery(
    () => db.parts.where("projectId").equals(project.id).and((p) => !p.deletedAt).sortBy("sortOrder"),
    [project.id],
    EMPTY_ARRAY,
  );

  const activeChapter = chapters.find((c) => c.id === chapterId) ?? chapters[0];

  const scenes = useLiveQuery(() => (activeChapter ? listScenes(activeChapter.id) : []), [activeChapter?.id], EMPTY_ARRAY);
  // Falls back to the chapter's first scene whenever activeSceneId doesn't match anything in the
  // current scene list (initial load, or after a chapter switch) — no effect needed to "correct"
  // activeSceneId itself, since it's never read anywhere except here.
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0];

  useEffect(() => {
    if (!chapterId && chapters[0]) navigate(`/project/${project.id}/manuscript/${chapters[0].id}`, { replace: true });
  }, [chapterId, chapters, project.id, navigate]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Begin writing…" }),
    ],
    editorProps: { attributes: { "aria-label": "Manuscript scene editor" } },
    content: activeScene?.content ?? "",
    onUpdate: ({ editor }) => {
      if (loadingContent.current) return;
      setSceneWordCount(countWords(extractPlainText(editor.getJSON())));
      if (userId && !sessionIdRef.current) {
        startWritingSession(project.id, userId, wordCount).then((s) => {
          sessionIdRef.current = s.id;
        });
      }
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const sceneId = activeScene?.id;
      saveTimer.current = setTimeout(async () => {
        if (!sceneId) return;
        await autosaveScene(sceneId, editor.getJSON());
        if (userId) {
          const total = await projectWordCount(project.id);
          await recordWordsWrittenToday(project.id, userId, total);
        }
        setSaveState("saved");
      }, AUTOSAVE_IDLE_MS);
    },
  });

  // Best-effort writing-session end: tab hidden (switched away, closed) or leaving this page
  // entirely. A hard crash/force-quit leaves the session with endedAt: null forever — accepted,
  // harmless (see writingSessions.ts). Not tied to scene/chapter switches within the same visit,
  // since those are still the same continuous writing session.
  useEffect(() => {
    async function endCurrentSession() {
      if (!sessionIdRef.current) return;
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      const total = await projectWordCount(project.id);
      await endWritingSession(id, total);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") void endCurrentSession();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void endCurrentSession();
    };
  }, [project.id]);

  // Swap editor content when the active scene changes (chapter switch, scene tab click) — an
  // imperative call to Tiptap, so this has to stay an effect. Deliberately depends on
  // activeScene?.id, not the whole activeScene object: activeScene.content is re-derived from
  // Dexie on every autosave, and re-running this on every content change would reset the editor
  // (fighting the user's cursor position and undo history) on every debounced save while they're
  // still typing in it.
  useEffect(() => {
    if (!editor || !activeScene) return;
    loadingContent.current = true;
    editor.commands.setContent(activeScene.content ?? "");
    loadingContent.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, activeScene?.id]);

  // Reset the displayed word count to the newly-active scene's own cached count whenever it
  // changes (setContent above doesn't fire onUpdate, so without this the live-typing path would
  // keep showing the *previous* scene's count until the next keystroke). Adjusted directly during
  // render — React's documented pattern for this — rather than in an effect, since it doesn't
  // touch anything outside React and avoids an extra render+commit cycle.
  if (activeScene && activeScene.id !== wordCountSyncedSceneId) {
    setWordCountSyncedSceneId(activeScene.id);
    setSceneWordCount(activeScene.wordCount);
  }

  // Flush any pending autosave immediately when navigating away.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [activeScene?.id]);

  const flushNow = useCallback(async () => {
    if (!editor || !activeScene || loadingContent.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await autosaveScene(activeScene.id, editor.getJSON());
    setSaveState("saved");
  }, [editor, activeScene]);

  async function moveChapterByKeyboard(chapter: Chapter, direction: -1 | 1) {
    const index = chapters.findIndex((c) => c.id === chapter.id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= chapters.length) return;
    const reordered = arrayMove(chapters, index, targetIndex);
    await reorderChapters(project.id, reordered.map((c) => c.id));
  }

  async function onChapterDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = chapters.findIndex((c) => c.id === active.id);
    const newIndex = chapters.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(chapters, oldIndex, newIndex);
    await reorderChapters(project.id, reordered.map((c) => c.id));
  }

  async function onAddChapter() {
    await flushNow();
    const chapter = await createChapter(project.id, `Chapter ${chapters.length + 1}`);
    navigate(`/project/${project.id}/manuscript/${chapter.id}`);
  }

  async function onAddPart() {
    const title = newPartTitle.trim() || `Part ${parts.length + 1}`;
    await createPart(project.id, title);
    setNewPartTitle("");
  }

  async function onAddScene() {
    if (!activeChapter) return;
    await flushNow();
    const scene = await createScene(project.id, activeChapter.id, `Scene ${scenes.length + 1}`);
    setActiveSceneId(scene.id);
  }

  if (chapters.length === 0) {
    return (
      <div className="iw-page">
        <EmptyState
          title="No chapters yet"
          description="Add your first chapter to start writing."
          action={
            <Button onClick={onAddChapter}>
              <Plus size={14} /> Add chapter
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={`iw-ms-layout ${focusMode ? "iw-ms-focus" : ""}`}>
      <div className="iw-ms-chapters">
        {parts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="iw-help-text" style={{ marginBottom: 8, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 1 }}>
              Parts
            </div>
            {parts.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <input
                  value={p.title}
                  onChange={(e) => renamePart(p.id, e.target.value)}
                  style={{ flex: 1, background: "transparent", border: "none", color: "var(--color-text-secondary)", fontSize: 12, outline: "none", padding: "2px 4px" }}
                />
                <IconButton label={`Delete ${p.title}`} onClick={() => setDeletePartId(p.id)}>
                  <Trash2 size={12} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          <input
            value={newPartTitle}
            onChange={(e) => setNewPartTitle(e.target.value)}
            placeholder="New part title…"
            aria-label="New part title"
            className="iw-input"
            style={{ fontSize: 11, padding: "4px 6px", flex: 1 }}
          />
          <Button size="sm" variant="secondary" onClick={onAddPart}>
            <Plus size={12} /> Part
          </Button>
        </div>

        <div className="iw-help-text" style={{ marginBottom: 12, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 1 }}>
          Chapters
        </div>
        <DndContext collisionDetection={closestCenter} onDragEnd={onChapterDragEnd}>
          <SortableContext items={chapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {chapters.map((c, i) => (
              <SortableChapterRow
                key={c.id}
                chapter={c}
                active={c.id === activeChapter?.id}
                index={i}
                count={chapters.length}
                parts={parts}
                onOpen={async () => { await flushNow(); navigate(`/project/${project.id}/manuscript/${c.id}`); }}
                onDelete={() => setDeleteChapterId(c.id)}
                onMove={(direction) => moveChapterByKeyboard(c, direction)}
                onMovePart={(partId) => assignChapterToPart(c.id, partId)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          onClick={onAddChapter}
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
          <Plus size={13} /> Add chapter
        </button>
      </div>

      <div className="iw-ms-editor-col">
        <div className="iw-ms-topbar">
          <input
            value={activeChapter?.title ?? ""}
            onChange={(e) => activeChapter && renameChapter(activeChapter.id, e.target.value)}
            aria-label="Chapter title"
            style={{ background: "transparent", border: "none", outline: "none", color: "var(--color-text-primary)", fontSize: 14, fontWeight: 500, flex: 1, minWidth: 120 }}
          />
          <span className="iw-help-text">
            {sceneWordCount.toLocaleString()} words this scene · {saveState === "saving" ? "Saving…" : "Saved"}
          </span>
          <span className="iw-help-text">
            {wordCount.toLocaleString()} words · ~{estimatePageCount(wordCount)} pages · ~{estimateReadingMinutes(wordCount)} min read
          </span>
          <IconButton label={focusMode ? "Exit focus mode" : "Focus mode"} onClick={() => setFocusMode((v) => !v)}>
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
        </div>

        <div className="iw-ms-scene-tabs">
          {scenes.map((s) => (
            <button key={s.id} className={`iw-ms-scene-tab ${s.id === activeScene?.id ? "active" : ""}`} onClick={async () => { await flushNow(); setActiveSceneId(s.id); }}>
              {s.title}
            </button>
          ))}
          <button className="iw-ms-scene-tab" onClick={onAddScene} aria-label="Add scene">
            <Plus size={14} />
          </button>
        </div>

        {editor && <EditorToolbar editor={editor} onFindReplace={() => setFindOpen(true)} />}

        <div className="iw-ms-scroll">
          <div className="iw-ms-page">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <FindReplaceDialog open={findOpen} onClose={() => setFindOpen(false)} editor={editor} />
      <ConfirmDialog
        open={!!deleteChapterId}
        onClose={() => setDeleteChapterId(null)}
        onConfirm={() => deleteChapterId && userId && softDeleteChapter(deleteChapterId, project.id, userId)}
        title="Delete this chapter?"
        description="It moves to recovery for 30 days before permanent removal."
        confirmLabel="Delete"
        danger
      />
      <ConfirmDialog
        open={!!deletePartId}
        onClose={() => setDeletePartId(null)}
        onConfirm={() => deletePartId && deletePart(deletePartId)}
        title="Delete this part?"
        description="Its chapters are not deleted — they just move back to having no part."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
