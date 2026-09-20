import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Copy, Send, Sparkles } from "lucide-react";
import type { AIMode } from "@inkwell/shared-types";
import { useProjectContext } from "../project/ProjectLayout";
import { useAuth } from "../../lib/auth";
import { db, EMPTY_ARRAY } from "../../lib/db";
import { askAssistant } from "../../lib/aiClient";
import { useToast } from "../../components/ui/Toast";
import { Button } from "../../components/ui/Button";
import { AIThinking } from "../../components/ui/Feedback";
import { SelectField } from "../../components/ui/FormControls";
import "../../styles/ai.css";

const MODES: { value: AIMode; label: string }[] = [
  { value: "ask", label: "Ask about the manuscript" },
  { value: "consistency_check", label: "Consistency check" },
  { value: "character_continuity", label: "Character continuity" },
  { value: "timeline_analysis", label: "Timeline analysis" },
  { value: "plot_thread_tracking", label: "Plot-thread tracking" },
  { value: "dropped_thread_detection", label: "Dropped-thread detection" },
  { value: "pacing_feedback", label: "Pacing feedback" },
  { value: "structure_feedback", label: "Structure feedback" },
  { value: "scene_analysis", label: "Scene analysis" },
  { value: "brainstorming", label: "Brainstorming" },
  { value: "dialogue_alternatives", label: "Dialogue alternatives" },
  { value: "revision_planning", label: "Revision planning" },
  { value: "canon_extraction", label: "Canon extraction" },
  { value: "chapter_summary", label: "Chapter summary" },
];

const SUGGESTIONS = [
  "Is there anything inconsistent about the characters' appearance across chapters?",
  "What plot threads have I opened but not resolved yet?",
  "Does the timeline make sense so far?",
];

export function AIAssistantPage() {
  const { project } = useProjectContext();
  const { userId, isLocalOnly } = useAuth();
  const { show } = useToast();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState<AIMode>("ask");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [seriesScope, setSeriesScope] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useLiveQuery(
    () => (conversationId ? db.aiMessages.where("conversationId").equals(conversationId).sortBy("createdAt") : []),
    [conversationId],
    EMPTY_ARRAY,
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || loading || !userId) return;
    setInput("");
    setLoading(true);
    try {
      const result = await askAssistant(project.id, userId, mode, question, conversationId, seriesScope);
      setConversationId(result.conversationId);
    } catch (err) {
      show((err as Error).message, "danger");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="iw-ai-layout">
      <div className="iw-ai-header">
        <div className="iw-display" style={{ fontSize: 20, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={18} color="var(--color-accent)" /> AI Assistant
        </div>
        <p className="iw-help-text" style={{ marginTop: 4 }}>
          {seriesScope
            ? `Scoped to "${project.title}" plus a summary of the other books in its series.`
            : `Scoped to "${project.title}" only — reads this book's manuscript, story bible, and timeline, nothing else.`}
          {isLocalOnly && " Running in local test mode: responses come from a deterministic test provider, not a real model."}
        </p>
        <div style={{ marginTop: 12, maxWidth: 280 }}>
          <SelectField label="Mode" value={mode} onChange={(e) => setMode(e.target.value as AIMode)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </SelectField>
        </div>
        {project.seriesId && (
          <label className="iw-help-text" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={seriesScope} onChange={(e) => setSeriesScope(e.target.checked)} />
            Also consider the other books in this series
          </label>
        )}
      </div>

      <div className="iw-ai-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="iw-help-text">
            I've read "{project.title}" — the manuscript, story bible, and timeline you've written so far. Ask me anything, or
            pick a mode above for a focused pass.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`iw-ai-bubble ${m.role}`}>
            {m.content}
            {m.role === "assistant" && m.isEstablishedVsInference && (
              <div className="iw-badge iw-badge-accent" style={{ marginTop: 8, display: "inline-flex" }}>
                {m.isEstablishedVsInference.replace(/_/g, " ")}
              </div>
            )}
            {m.role === "assistant" && m.citations.length > 0 && (
              <div className="iw-ai-citations">
                {m.citations.map((c, i) => (
                  <span key={i} className="iw-badge">
                    {c.kind.replace(/_/g, " ")}: {c.label}
                  </span>
                ))}
              </div>
            )}
            {m.role === "assistant" && (
              <div className="iw-ai-actions">
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(m.content); show("Copied to clipboard."); }}>
                  <Copy size={12} /> Copy
                </Button>
              </div>
            )}
          </div>
        ))}
        {loading && <AIThinking />}
      </div>

      {messages.length === 0 && (
        <div className="iw-ai-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} className="iw-badge" style={{ cursor: "pointer", border: "1px solid var(--color-border)" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="iw-ai-composer">
        <input
          className="iw-input"
          style={{ flex: 1, minWidth: 200 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about plot, consistency, or timeline…"
          aria-label="Ask the AI assistant"
        />
        <Button onClick={() => send()} disabled={loading || !input.trim()} aria-label="Send message">
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}
