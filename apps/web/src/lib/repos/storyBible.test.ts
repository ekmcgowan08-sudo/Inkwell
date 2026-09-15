import { describe, expect, it, beforeEach } from "vitest";
import { db } from "../db";
import { createProject } from "./projects";
import { createEntry, updateEntry } from "./storyBible";

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("storyBible repo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("bumps revision on update, so a stale sync write can be detected", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    const entry = await createEntry(project.id, "character", "Alice");
    expect(entry.revision).toBe(0);

    await updateEntry(entry.id, { summary: "The protagonist." });
    const updated = await db.storyBibleEntries.get(entry.id);
    expect(updated!.revision).toBe(1);
    expect(updated!.summary).toBe("The protagonist.");
  });
});
