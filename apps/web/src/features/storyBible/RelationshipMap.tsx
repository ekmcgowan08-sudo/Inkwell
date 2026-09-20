import type { Relationship, StoryBibleEntry } from "@inkwell/shared-types";

/** A minimal SVG relationship graph. The list view above is the accessible primary; this is a visual supplement, not the only way to read the data. */
export function RelationshipMap({ entries, relationships }: { entries: StoryBibleEntry[]; relationships: Relationship[] }) {
  const size = 320;
  const center = size / 2;
  const radius = size / 2 - 48;
  const positioned = entries.map((e, i) => {
    const angle = (i / Math.max(1, entries.length)) * 2 * Math.PI - Math.PI / 2;
    return { entry: e, x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  });
  const byId = new Map(positioned.map((p) => [p.entry.id, p]));

  if (entries.length < 2) {
    return <p className="iw-help-text">Add at least two entries to see a relationship map.</p>;
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Relationship map between story bible entries">
      {relationships.map((r) => {
        const from = byId.get(r.fromEntryId);
        const to = byId.get(r.toEntryId);
        if (!from || !to) return null;
        const color =
          r.status === "conflict" ? "var(--color-danger)" : r.status === "alliance" ? "var(--color-success)" : "var(--color-border-strong)";
        return <line key={r.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={2} />;
      })}
      {positioned.map(({ entry, x, y }) => (
        <g key={entry.id}>
          <circle cx={x} cy={y} r={22} fill="var(--color-bg-elevated)" stroke="var(--color-accent)" strokeWidth={1.5} />
          <text x={x} y={y + 34} textAnchor="middle" fontSize={10} fill="var(--color-text-primary)">
            {entry.name.length > 14 ? entry.name.slice(0, 13) + "…" : entry.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
