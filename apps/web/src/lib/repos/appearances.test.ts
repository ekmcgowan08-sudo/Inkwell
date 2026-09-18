import { describe, expect, it, beforeEach } from "vitest";
import { db } from "../db";
import { confirmAppearance, detectAppearances, dismissAppearance, listAppearancesForEntry } from "./appearances";

const PROJECT_ID = "22222222-2222-2222-2222-222222222222";

async function seedEntry(id: string, name: string, aliases: string[] = []) {
  await db.storyBibleEntries.put({
    id,
    projectId: PROJECT_ID,
    entryType: "character",
    customTypeLabel: null,
    name,
    aliases,
    summary: null,
    canonStatus: "draft",
    firstAppearanceSceneId: null,
    latestAppearanceSceneId: null,
    imageUrl: null,
    tags: [],
    notes: null,
    fields: {},
    revision: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  });
}

async function seedScene(id: string, chapterId: string, plainText: string) {
  await db.scenes.put({
    id,
    projectId: PROJECT_ID,
    chapterId,
    title: "Scene",
    sortOrder: 0,
    content: {},
    plainText,
    wordCount: plainText.split(/\s+/).filter(Boolean).length,
    povCharacterId: null,
    locationId: null,
    inWorldTime: null,
    storyThreadId: null,
    status: "drafting",
    revisionPriority: null,
    colorLabel: null,
    notes: null,
    revision: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  });
}

describe("appearances repo — rule-based detection", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("suggests an appearance when an entry's name appears in a scene's text", async () => {
    await seedEntry("11111111-0000-0000-0000-000000000001", "Isolde Vane");
    await seedScene("33333333-0000-0000-0000-000000000001", "chapter-1", "Isolde Vane crossed the courtyard alone.");

    const created = await detectAppearances(PROJECT_ID);
    expect(created).toHaveLength(1);
    expect(created[0]!.source).toBe("ai_suggested");
    expect(created[0]!.confirmed).toBe(false);
  });

  it("matches an alias as well as the primary name", async () => {
    await seedEntry("11111111-0000-0000-0000-000000000002", "Isolde Vane", ["the Raven Queen"]);
    await seedScene("33333333-0000-0000-0000-000000000002", "chapter-1", "They called her the Raven Queen in whispers.");

    const created = await detectAppearances(PROJECT_ID);
    expect(created).toHaveLength(1);
  });

  it("does not match a substring inside another word (whole-word boundary)", async () => {
    await seedEntry("11111111-0000-0000-0000-000000000003", "Ann");
    await seedScene("33333333-0000-0000-0000-000000000003", "chapter-1", "Announcement: the caravan departs at dawn.");

    const created = await detectAppearances(PROJECT_ID);
    expect(created).toHaveLength(0);
  });

  it("does not re-suggest an appearance that already exists (author-created or previously detected)", async () => {
    await seedEntry("11111111-0000-0000-0000-000000000004", "Corvin Ash");
    await seedScene("33333333-0000-0000-0000-000000000004", "chapter-1", "Corvin Ash said nothing.");

    const first = await detectAppearances(PROJECT_ID);
    expect(first).toHaveLength(1);
    const second = await detectAppearances(PROJECT_ID);
    expect(second).toHaveLength(0);

    const all = await listAppearancesForEntry("11111111-0000-0000-0000-000000000004");
    expect(all).toHaveLength(1);
  });

  it("confirmAppearance marks a suggestion as confirmed", async () => {
    await seedEntry("11111111-0000-0000-0000-000000000005", "Corvin Ash");
    await seedScene("33333333-0000-0000-0000-000000000005", "chapter-1", "Corvin Ash said nothing.");
    const [created] = await detectAppearances(PROJECT_ID);

    await confirmAppearance(created!.id);
    const [updated] = await listAppearancesForEntry("11111111-0000-0000-0000-000000000005");
    expect(updated!.confirmed).toBe(true);
  });

  it("dismissAppearance deletes the suggestion", async () => {
    await seedEntry("11111111-0000-0000-0000-000000000006", "Corvin Ash");
    await seedScene("33333333-0000-0000-0000-000000000006", "chapter-1", "Corvin Ash said nothing.");
    const [created] = await detectAppearances(PROJECT_ID);

    await dismissAppearance(created!.id);
    const remaining = await listAppearancesForEntry("11111111-0000-0000-0000-000000000006");
    expect(remaining).toHaveLength(0);
  });

  it("skips names shorter than 3 characters to avoid noisy matches", async () => {
    await seedEntry("11111111-0000-0000-0000-000000000007", "Jo");
    await seedScene("33333333-0000-0000-0000-000000000007", "chapter-1", "Jo walked in.");

    const created = await detectAppearances(PROJECT_ID);
    expect(created).toHaveLength(0);
  });
});
