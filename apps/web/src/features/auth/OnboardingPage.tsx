import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Sparkles, Wand2 } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { Button } from "../../components/ui/Button";
import { createProject } from "../../lib/repos/projects";
import { createSampleProject } from "../../lib/sampleProject";
import "../../styles/auth.css";

const STYLES = [
  { id: "plotter", label: "Plotter", desc: "I like to outline and structure before I draft." },
  { id: "discovery", label: "Discovery writer", desc: "I find the story by writing it." },
  { id: "custom", label: "A bit of both", desc: "Don't lock me into one workflow." },
] as const;

export function OnboardingPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [style, setStyle] = useState<(typeof STYLES)[number]["id"] | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(action: "blank" | "sample") {
    if (!userId) return;
    setBusy(true);
    const project =
      action === "sample"
        ? await createSampleProject(userId)
        : await createProject(userId, { title: "Untitled Book", writingStyle: style ?? "unset" });
    navigate(`/project/${project.id}/manuscript`);
  }

  return (
    <div className="iw-auth-page">
      <div className="iw-card" style={{ maxWidth: 560, width: "100%", padding: 40 }}>
        <h1 className="iw-display" style={{ marginTop: 0 }}>
          Welcome to your studio
        </h1>
        <p style={{ color: "var(--color-text-secondary)" }}>Optional: how do you like to write? This never locks you out of features either way.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "20px 0" }}>
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className="iw-card"
              style={{
                textAlign: "left",
                padding: 16,
                cursor: "pointer",
                borderColor: style === s.id ? "var(--color-accent)" : undefined,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>{s.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Button onClick={() => start("blank")} disabled={busy}>
            <BookOpen size={16} /> Start a blank book
          </Button>
          <Button variant="secondary" onClick={() => start("sample")} disabled={busy}>
            <Sparkles size={16} /> Open a sample project
          </Button>
          <Button variant="ghost" onClick={() => navigate("/dashboard")} disabled={busy}>
            <Wand2 size={16} /> I'll import an existing manuscript from the dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
