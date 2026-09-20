import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Clock, Plus, Target, Flame, Trash2, AlertTriangle } from "lucide-react";
import { useProjectContext } from "../project/ProjectLayout";
import { useAuth } from "../../lib/auth";
import { db, EMPTY_ARRAY } from "../../lib/db";
import {
  createTimelineEvent,
  deleteTimelineEvent,
  detectTimelineConflicts,
  getActiveDailyGoal,
  getStreak,
  progressHistory,
  recordWordsWrittenToday,
  setDailyGoal,
  updateTimelineEvent,
} from "../../lib/repos/storyboardTimeline";
import { listRecentSessions } from "../../lib/repos/writingSessions";
import { projectWordCount } from "../../lib/repos/manuscript";
import { updateProject } from "../../lib/repos/projects";
import { Button, IconButton } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/Feedback";
import { TextField } from "../../components/ui/FormControls";

export function TimelineGoalsPage() {
  const { project, wordCount } = useProjectContext();
  const { userId } = useAuth();
  const [todayWords, setTodayWords] = useState(0);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState<{ date: string; wordsWritten: number; goalMet: boolean }[]>([]);

  const events = useLiveQuery(() => db.timelineEvents.where("projectId").equals(project.id).sortBy("sortOrder"), [project.id], EMPTY_ARRAY);
  const dailyGoal = useLiveQuery(() => getActiveDailyGoal(project.id), [project.id]);
  const recentSessions = useLiveQuery(() => listRecentSessions(project.id, 5), [project.id], EMPTY_ARRAY);
  const conflicts = detectTimelineConflicts(events);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const total = await projectWordCount(project.id);
      const progress = await recordWordsWrittenToday(project.id, userId, total);
      setTodayWords(progress.wordsWritten);
      setStreak(await getStreak(project.id));
      setHistory(await progressHistory(project.id));
    })();
  }, [userId, project.id, wordCount]);

  const goalTarget = dailyGoal?.targetWords ?? project.dailyGoalWords;
  const bookPct = Math.min(100, Math.round((wordCount / Math.max(1, project.goalWords)) * 100));

  return (
    <div className="iw-page" style={{ maxWidth: 1000 }}>
      <div className="iw-page-header">
        <div className="iw-page-title iw-display">Timeline & Goals</div>
      </div>
      <p className="iw-page-subtitle">Writing progress on the left, your story's own chronology on the right.</p>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="iw-card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Book Details</div>
            <TextField label="Genre" value={project.genre} onChange={(e) => updateProject(project.id, { genre: e.target.value })} />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <TextField
                label="Book goal (words)"
                type="number"
                value={project.goalWords}
                onChange={(e) => updateProject(project.id, { goalWords: Number(e.target.value) || 0 })}
              />
              <TextField
                label="Daily goal"
                type="number"
                value={goalTarget}
                onChange={(e) => setDailyGoal(project.id, Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="iw-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Target size={16} color="var(--color-accent)" />
              <span style={{ fontWeight: 600 }}>Today's Goal</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
              <span className="iw-display" style={{ fontSize: 28, fontWeight: 600 }}>
                {Math.max(0, todayWords)}
              </span>
              <span className="iw-help-text">/ {goalTarget} words</span>
            </div>
            <ProgressBar value={Math.max(0, todayWords)} max={goalTarget} label="Today's word goal progress" />
            <div className="iw-help-text" style={{ marginTop: 6 }}>
              {todayWords >= goalTarget
                ? "Goal met for today — nice work."
                : `${Math.max(0, goalTarget - todayWords)} words to go. Every session counts.`}
            </div>
          </div>

          <div className="iw-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Flame size={16} color="var(--color-primary)" />
              <span style={{ fontWeight: 600 }}>Streak</span>
            </div>
            <div className="iw-display" style={{ fontSize: 28, fontWeight: 600 }}>
              {streak} day{streak === 1 ? "" : "s"}
            </div>
            <div className="iw-help-text" style={{ marginTop: 4 }}>
              Rest days don't break a streak you've marked as flexible in Book Settings.
            </div>
          </div>

          <div className="iw-card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Whole Book</div>
            <ProgressBar value={wordCount} max={project.goalWords} label="Whole book progress" />
            <div className="iw-help-text" style={{ marginTop: 8 }}>
              {wordCount.toLocaleString()} / {project.goalWords.toLocaleString()} words ({bookPct}%)
            </div>
          </div>

          {history.length > 0 && (
            <div className="iw-card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Recent Progress</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {history.slice(-7).map((h) => (
                  <div key={h.date} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span className="iw-help-text" style={{ width: 72 }}>
                      {h.date.slice(5)}
                    </span>
                    <div style={{ flex: 1, height: 8, background: "var(--color-bg-sunken)", borderRadius: 4, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, Math.max(2, (h.wordsWritten / Math.max(1, goalTarget)) * 100))}%`,
                          background: h.goalMet ? "var(--color-success)" : "var(--color-accent)",
                        }}
                      />
                    </div>
                    <span style={{ width: 48, textAlign: "right" }}>{h.wordsWritten}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentSessions.length > 0 && (
            <div className="iw-card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Clock size={16} color="var(--color-accent)" />
                <span style={{ fontWeight: 600 }}>Recent Sessions</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentSessions.map((s) => {
                  const words = s.wordsEnd - s.wordsStart;
                  const minutes = Math.max(1, Math.round((new Date(s.endedAt!).getTime() - new Date(s.startedAt).getTime()) / 60000));
                  return (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span className="iw-help-text">
                        {new Date(s.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span>
                        {minutes} min · {words >= 0 ? "+" : ""}
                        {words.toLocaleString()} words
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          <div style={{ position: "relative", paddingLeft: 20 }}>
            <div style={{ position: "absolute", left: 4, top: 4, bottom: 4, width: 2, background: "var(--color-border-strong)" }} />
            {events.map((ev) => (
              <div key={ev.id} style={{ position: "relative", marginBottom: 22, paddingLeft: 16 }}>
                <div
                  style={{
                    position: "absolute",
                    left: -19,
                    top: 4,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "var(--color-accent)",
                    border: "2px solid var(--color-bg)",
                  }}
                />
                {conflicts.has(ev.id) && (
                  <div className="iw-badge iw-badge-danger" style={{ marginBottom: 4, display: "inline-flex" }}>
                    <AlertTriangle size={11} /> Possible conflict with another event
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={ev.whenLabel}
                    onChange={(e) => updateTimelineEvent(ev.id, { whenLabel: e.target.value })}
                    style={{
                      fontSize: 11,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "var(--color-accent)",
                      background: "transparent",
                      border: "none",
                      outline: "none",
                    }}
                  />
                  <IconButton label="Delete event" onClick={() => deleteTimelineEvent(ev.id)}>
                    <Trash2 size={12} />
                  </IconButton>
                </div>
                <input
                  value={ev.label}
                  onChange={(e) => updateTimelineEvent(ev.id, { label: e.target.value })}
                  className="iw-display"
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    background: "transparent",
                    border: "none",
                    color: "var(--color-text-primary)",
                    outline: "none",
                    width: "100%",
                    marginBottom: 4,
                  }}
                />
                <textarea
                  value={ev.detail ?? ""}
                  onChange={(e) => updateTimelineEvent(ev.id, { detail: e.target.value })}
                  rows={2}
                  placeholder="What happens…"
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-secondary)",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    width: "100%",
                    resize: "none",
                    fontFamily: "var(--font-ui)",
                  }}
                />
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => createTimelineEvent(project.id, "New event")} style={{ marginLeft: -16 }}>
              <Plus size={13} /> Add event to timeline
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
