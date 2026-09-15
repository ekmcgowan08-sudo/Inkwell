import { describe, expect, it, beforeEach } from "vitest";
import { db } from "../db";
import { createProject, updateProject } from "./projects";

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("projects repo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("bumps revision on update, so a stale sync write can be detected", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    expect(project.revision).toBe(0);

    await updateProject(project.id, { title: "Renamed Book" });
    const updated = await db.projects.get(project.id);
    expect(updated!.revision).toBe(1);
    expect(updated!.title).toBe("Renamed Book");

    await updateProject(project.id, { isFavorite: true });
    expect((await db.projects.get(project.id))!.revision).toBe(2);
  });
});
