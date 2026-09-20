import { db, nowIso } from "./db";
import { detectTimelineConflicts } from "./repos/storyboardTimeline";
import type { AIFinding } from "@inkwell/shared-types";

/**
 * Deterministic, local, rule-based consistency scan — NOT a model call. This
 * is what runs in local-only mode (and as a free first pass in cloud mode)
 * so findings exist without spending AI credits. It looks for a few
 * concrete, explainable patterns; it does not replace the model-backed
 * consistency-check AI mode, which reasons about prose the way these rules
 * cannot. See docs/AI_ARCHITECTURE.md.
 */
export async function runLocalConsistencyScan(projectId: string): Promise<AIFinding[]> {
  const created: AIFinding[] = [];
  const now = nowIso();

  // 1. Duplicate names within the same entry type.
  const entries = await db.storyBibleEntries
    .where("projectId")
    .equals(projectId)
    .and((e) => !e.deletedAt)
    .toArray();
  const byTypeAndName = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = `${e.entryType}:${e.name.trim().toLowerCase()}`;
    byTypeAndName.set(key, [...(byTypeAndName.get(key) ?? []), e]);
  }
  for (const [, group] of byTypeAndName) {
    if (group.length > 1) {
      created.push(
        await putFinding(projectId, {
          findingType: "repeated_information",
          severity: "low",
          confidence: 0.9,
          title: `Duplicate name: "${group[0]!.name}"`,
          explanation: `${group.length} ${group[0]!.entryType} entries share the name "${group[0]!.name}". If these are meant to be the same entry, consider merging them.`,
          evidence: group.map((g) => ({ kind: "story_bible_entry" as const, id: g.id, label: g.name })),
        }),
      );
    }
  }

  // 2. Open story threads never linked to any scene or storyboard card.
  const threads = await db.storyThreads
    .where("projectId")
    .equals(projectId)
    .and((t) => t.status === "open")
    .toArray();
  const scenes = await db.scenes
    .where("projectId")
    .equals(projectId)
    .and((s) => !s.deletedAt)
    .toArray();
  const cards = await db.storyboardCards.where("projectId").equals(projectId).toArray();
  for (const thread of threads) {
    const linked = scenes.some((s) => s.storyThreadId === thread.id) || cards.some((c) => c.storyThreadId === thread.id);
    if (!linked) {
      created.push(
        await putFinding(projectId, {
          findingType: "dropped_thread",
          severity: "medium",
          confidence: 0.6,
          title: `Thread "${thread.title}" isn't linked to any scene`,
          explanation: `"${thread.title}" is marked open but no scene or storyboard card references it. It may be dropped, or just not linked yet.`,
          evidence: [{ kind: "canon_fact" as const, id: thread.id, label: thread.title }],
        }),
      );
    }
  }

  // 3. Timeline conflicts (shared character, same date, different locations).
  const events = await db.timelineEvents.where("projectId").equals(projectId).toArray();
  const conflicts = detectTimelineConflicts(events);
  const reported = new Set<string>();
  for (const [id, others] of conflicts) {
    const pairKey = [id, ...others].sort().join(",");
    if (reported.has(pairKey)) continue;
    reported.add(pairKey);
    const event = events.find((e) => e.id === id)!;
    created.push(
      await putFinding(projectId, {
        findingType: "timeline_conflict",
        severity: "high",
        confidence: 0.7,
        title: `Possible timeline conflict around "${event.label}"`,
        explanation: `A shared character appears in two events on the same date at different locations.`,
        evidence: [id, ...others].map((eid) => ({ kind: "timeline_event" as const, id: eid, label: events.find((e) => e.id === eid)?.label ?? eid })),
      }),
    );
  }

  return created;

  async function putFinding(
    projectId: string,
    partial: Pick<AIFinding, "findingType" | "severity" | "confidence" | "title" | "explanation" | "evidence">,
  ): Promise<AIFinding> {
    const finding: AIFinding = {
      id: crypto.randomUUID(),
      projectId,
      status: "open",
      authorNote: null,
      snoozedUntil: null,
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
    await db.aiFindings.put(finding);
    return finding;
  }
}
