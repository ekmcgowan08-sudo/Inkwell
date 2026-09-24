import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { createProject } from "./repos/projects";
import { createEntry } from "./repos/storyBible";
import { createStoryThread } from "./repos/storyboardTimeline";
import { runLocalConsistencyScan } from "./findingsScanner";

const USER_ID = "22222222-2222-2222-2222-222222222222";

describe("runLocalConsistencyScan", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("flags two story-bible entries of the same type sharing a name", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    await createEntry(project.id, "character", "Isolde Vane");
    await createEntry(project.id, "character", "Isolde Vane");

    const findings = await runLocalConsistencyScan(project.id);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.findingType).toBe("repeated_information");
  });

  it("flags an open story thread not linked to any scene or storyboard card", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    await createStoryThread(project.id, "The missing crown");

    const findings = await runLocalConsistencyScan(project.id);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.findingType).toBe("dropped_thread");
  });

  it("does not duplicate a finding on repeated scans when nothing about the underlying issue changed", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    await createEntry(project.id, "character", "Isolde Vane");
    await createEntry(project.id, "character", "Isolde Vane");

    await runLocalConsistencyScan(project.id);
    await runLocalConsistencyScan(project.id);
    await runLocalConsistencyScan(project.id);

    const allFindings = await db.aiFindings.where("projectId").equals(project.id).toArray();
    expect(allFindings).toHaveLength(1);
  });

  it("does not re-create a finding the author already dismissed", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    await createStoryThread(project.id, "The missing crown");

    const [first] = await runLocalConsistencyScan(project.id);
    await db.aiFindings.update(first!.id, { status: "dismissed" });

    await runLocalConsistencyScan(project.id);

    const allFindings = await db.aiFindings.where("projectId").equals(project.id).toArray();
    expect(allFindings).toHaveLength(1);
    expect(allFindings[0]!.status).toBe("dismissed");
  });

  it("re-flags a resolved issue as a new finding once the underlying facts actually change", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });
    const threadA = await createStoryThread(project.id, "The missing crown");
    const [first] = await runLocalConsistencyScan(project.id);
    await db.aiFindings.update(first!.id, { status: "dismissed" });

    // A different thread going unlinked is a distinct issue, not the same one recurring.
    await createStoryThread(project.id, "The stolen ring");
    const second = await runLocalConsistencyScan(project.id);
    expect(second).toHaveLength(1);
    expect(second[0]!.title).toContain("stolen ring");

    const allFindings = await db.aiFindings.where("projectId").equals(project.id).toArray();
    expect(allFindings).toHaveLength(2);
    void threadA;
  });
});
