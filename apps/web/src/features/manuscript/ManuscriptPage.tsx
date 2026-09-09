import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Maximize2, Minimize2, Plus, Trash2 } from "lucide-react";
import { db } from "../../lib/db";
import { useAuth } from "../../lib/auth";
import { useProjectContext } from "../project/ProjectLayout";
import {
  createChapter,
  createScene,
  autosaveScene,
  listScenes,
  projectWordCount,
  renameChapter,
  softDeleteChapter,
} from "../../lib/repos/manuscript";
import { recordWordsWrittenToday } from "../../lib/repos/storyboardTimeline";
import { countWords, estimatePageCount, estimateReadingMinutes, extractPlainText } from "@inkwell/shared-types";
import { Button, IconButton } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/Feedback";
import { EditorToolbar } from "./EditorToolbar";
import { FindReplaceDialog } from "./FindReplaceDialog";
import "../../styles/manuscript.css";

const AUTOSAVE_IDLE_MS = 1500;

export function ManuscriptPage() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const { project, wordCount } = useProjectContext();
  const [focusMode, setFocusMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [deleteChapterId, setDeleteChapterId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingContent = useRef(false);

  const chapters = useLiveQuery(
    () => db.chapters.where("projectId").equals(project.id).and((c) => !c.deletedAt).sortBy("sortOrder"),
    [project.id],
  ) ?? [];

  const activeChapter = chapters.find((c) => c.id === chapterId) ?? chapters[0];

  const scenes = useLiveQuery(() => (activeChapter ? listScenes(activeChapter.id) : []), [activeChapter?.id]) ?? [];
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0];

  useEffect(() => {
    if (scenes[0] && !scenes.find((s) => s.id === activeSceneId)) setActiveSceneId(scenes[0].id);
  }, [scenes, activeSceneId]);

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
    content: activeScene?.content ?? "",
    onUpdate: ({ editor }) => {
      if (loadingContent.current) return;
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

  // Swap editor content when the active scene changes (chapter switch, scene tab click).
  useEffect(() => {
    if (!editor || !activeScene) return;
    loadingContent.current = true;
    editor.commands.setContent(activeScene.content ?? "");
    loadingContent.current = false;
  }, [editor, activeScene?.id]);

  // Flush any pending autosave immediately when navigating away.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [activeScene?.id]);

  const sceneWordCount = useMemo(() => (editor ? countWords(extractPlainText(editor.getJSON())) : 0), [editor, activeScene?.content]);

  const flushNow = useCallback(async () => {
    if (!editor || !activeScene || loadingContent.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await autosaveScene(activeScene.id, editor.getJSON());
    setSaveState("saved");
  }, [editor, activeScene]);

  async function onAddChapter() {
    await flushNow();
    const chapter = await createChapter(project.id, `Chapter ${chapters.length + 1}`);
    navigate(`/project/${project.id}/manuscript/${chapter.id}`);
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
        <div className="iw-help-text" style={{ marginBottom: 12, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 1 }}>
          Chapters
        </div>
        {chapters.map((c) => (
          <div key={c.id} className={`iw-ms-chapter-item ${c.id === activeChapter?.id ? "active" : ""}`}>
            <button className="title" onClick={async () => { await flushNow(); navigate(`/project/${project.id}/manuscript/${c.id}`); }}>
              {c.title}
            </button>
            <IconButton label={`Delete ${c.title}`} onClick={() => setDeleteChapterId(c.id)}>
              <Trash2 size={13} />
            </IconButton>
          </div>
        ))}
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
    </div>
  );
}
