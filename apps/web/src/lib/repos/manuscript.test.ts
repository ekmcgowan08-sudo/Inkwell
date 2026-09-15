import { describe, expect, it, beforeEach } from "vitest";
import { db } from "../db";
import { createProject } from "./projects";
import { autosaveScene, createChapter, listChapters, listScenes, listRevisions, restoreRevision, renameChapter, reorderChapters } from "./manuscript";

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("manuscript repo (local-first autosave)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates a project with one starter chapter and scene", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    const chapters = await listChapters(project.id);
    expect(chapters).toHaveLength(1);
    const scenes = await listScenes(chapters[0]!.id);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]!.wordCount).toBe(0);
  });

  it("autosave bumps revision, recomputes word count, and appends a document revision", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    const [chapter] = await listChapters(project.id);
    const [scene] = await listScenes(chapter!.id);

    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Four little words." }] }] };
    const result = await autosaveScene(scene!.id, doc);

    expect(result.wordCount).toBe(3);
    const updatedScene = await db.scenes.get(scene!.id);
    expect(updatedScene!.revision).toBe(1);
    expect(updatedScene!.wordCount).toBe(3);

    const updatedChapter = await db.chapters.get(chapter!.id);
    expect(updatedChapter!.wordCount).toBe(3);

    const revisions = await listRevisions(scene!.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]!.wordCount).toBe(3);
  });

  it("never loses the previous revision — restoring goes forward, not by overwriting history", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    const [chapter] = await listChapters(project.id);
    const [scene] = await listScenes(chapter!.id);

    await autosaveScene(scene!.id, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "First version." }] }] });
    await autosaveScene(scene!.id, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Second version here." }] }] });

    const revisions = await listRevisions(scene!.id);
    expect(revisions.map((r) => r.revision)).toEqual([2, 1]);

    await restoreRevision(scene!.id, revisions[1]!.id); // restore "First version."
    const restoredScene = await db.scenes.get(scene!.id);
    expect(restoredScene!.plainText.trim()).toBe("First version.");
    expect(restoredScene!.revision).toBe(3); // restore is a new revision, not a rewrite of history

    const allRevisions = await listRevisions(scene!.id);
    expect(allRevisions).toHaveLength(3);
  });

  it("bumps chapter revision on rename and reorder, so sync can detect a stale write", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    const [chapter] = await listChapters(project.id);
    expect(chapter!.revision).toBe(0);

    await renameChapter(chapter!.id, "Renamed");
    expect((await db.chapters.get(chapter!.id))!.revision).toBe(1);

    const second = await createChapter(project.id, "Chapter 2");
    await reorderChapters(project.id, [second.id, chapter!.id]);
    expect((await db.chapters.get(chapter!.id))!.revision).toBe(2);
    expect((await db.chapters.get(second.id))!.revision).toBe(1);
  });
});
