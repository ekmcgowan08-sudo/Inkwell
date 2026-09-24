import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { createSampleProject } from "./sampleProject";

const USER_ID = "33333333-3333-3333-3333-333333333333";

describe("createSampleProject", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("seeds two real chapters/scenes, two characters, and three timeline events — no leftover placeholder chapter", async () => {
    const project = await createSampleProject(USER_ID);
    expect(project.title).toBe("The Lighthouse Keeps");

    const chapters = await db.chapters.where("projectId").equals(project.id).toArray();
    expect(chapters).toHaveLength(2);

    for (const chapter of chapters) {
      const scenes = await db.scenes.where("chapterId").equals(chapter.id).toArray();
      expect(scenes).toHaveLength(1);
      // Real prose was autosaved into the scene, not left as the empty placeholder createChapter seeds.
      expect(scenes[0]!.wordCount).toBeGreaterThan(0);
    }

    const entries = await db.storyBibleEntries.where("projectId").equals(project.id).toArray();
    expect(entries.map((e) => e.name).sort()).toEqual(["Captain Aldric Thorne", "Wren Halloway"]);

    const events = await db.timelineEvents.where("projectId").equals(project.id).toArray();
    expect(events).toHaveLength(3);
  });
});
