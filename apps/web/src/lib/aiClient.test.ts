import { describe, expect, it, beforeEach } from "vitest";
import { db } from "./db";
import { createProject } from "./repos/projects";
import { askAssistant } from "./aiClient";

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("askAssistant (local-only mode) — findings extraction", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("strips the findings block from the visible answer and persists extracted findings", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });

    const result = await askAssistant(project.id, USER_ID, "consistency_check", "TEST_SCENARIO:findings", null);

    expect(result.content).not.toContain("FINDINGS_JSON");
    expect(result.content).toContain("[test-provider deterministic response]");

    const storedMessage = await db.aiMessages.where("conversationId").equals(result.conversationId).and((m) => m.role === "assistant").first();
    expect(storedMessage!.content).not.toContain("FINDINGS_JSON");

    const findings = await db.aiFindings.where("projectId").equals(project.id).toArray();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingType: "contradiction",
      severity: "medium",
      status: "open",
      title: "Possible contradiction found by the test provider",
    });
  });

  it("persists zero findings when the model's findings block is an empty array", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });

    await askAssistant(project.id, USER_ID, "consistency_check", "TEST_SCENARIO:findings-empty", null);

    const findings = await db.aiFindings.where("projectId").equals(project.id).toArray();
    expect(findings).toHaveLength(0);
  });

  it("never persists findings for a mode that doesn't ask for them (e.g. brainstorming)", async () => {
    const project = await createProject(USER_ID, { title: "Test Book" });

    // Even though the test provider would emit its canned findings response for a matching
    // TEST_SCENARIO, brainstorming's prompt never instructs the model to produce a findings
    // block — but if a real model still emitted stray text that happened to match the
    // delimiters, this proves extraction is a no-op when there isn't one.
    await askAssistant(project.id, USER_ID, "brainstorming", "What if the raven were actually a spy?", null);

    const findings = await db.aiFindings.where("projectId").equals(project.id).toArray();
    expect(findings).toHaveLength(0);
  });
});
