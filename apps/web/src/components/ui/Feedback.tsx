import type { ReactNode } from "react";

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "success" | "danger" | "warning" }) {
  const cls = tone === "default" ? "iw-badge" : `iw-badge iw-badge-${tone}`;
  return <span className={cls}>{children}</span>;
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="iw-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="iw-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="iw-empty">
      {icon}
      <h3 className="iw-display">{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Spinner() {
  return <span className="iw-spinner" role="status" aria-label="Loading" />;
}

export function AIThinking({ label = "Reading the manuscript…" }: { label?: string }) {
  return (
    <span className="iw-thinking" role="status" aria-live="polite">
      <Spinner /> {label}
    </span>
  );
}

export function SyncStatusPill({ status, onClick }: { status: "synced" | "syncing" | "offline" | "error" | "conflict"; onClick?: () => void }) {
  const label = {
    synced: "Saved",
    syncing: "Saving…",
    offline: "Offline — saved locally",
    error: "Sync error",
    conflict: "Sync conflict — needs your input",
  }[status];
  const dotClass = status === "offline" ? "offline" : status === "error" || status === "conflict" ? "error" : "";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      className="iw-status-pill"
      onClick={onClick}
      style={onClick ? { background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" } : undefined}
    >
      <span className={`iw-status-dot ${dotClass}`} aria-hidden="true" />
      {label}
    </Tag>
  );
}
