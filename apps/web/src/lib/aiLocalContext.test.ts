import { describe, expect, it, beforeEach } from "vitest";
import { db } from "./db";
import { createProject, createSeries } from "./repos/projects";
import { createChapter, autosaveScene, listChapters, listScenes } from "./repos/manuscript";
import { createEntry } from "./repos/storyBible";
import { buildLocalContext } from "./aiLocalContext";

const USER_ID = "11111111-1111-1111-1111-111111111111";

async function paragraph(sceneId: string, text: string) {
  await autosaveScene(sceneId, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
}

describe("buildLocalContext — series scope", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("includes a book-labeled slice of the other book in the series only when seriesScope is true", async () => {
    const series = await createSeries(USER_ID, "The Ravens Trilogy");
    const bookOne = await createProject(USER_ID, { title: "Book One", seriesId: series.id });
    const bookTwo = await createProject(USER_ID, { title: "Book Two", seriesId: series.id });

    const [chapterOne] = await listChapters(bookOne.id);
    const [sceneOne] = await listScenes(chapterOne!.id);
    await paragraph(sceneOne!.id, "Book one content.");

    const [chapterTwo] = await listChapters(bookTwo.id);
    const [sceneTwo] = await listScenes(chapterTwo!.id);
    await paragraph(sceneTwo!.id, "Book two content.");
    await createEntry(bookTwo.id, "character", "Book Two Character");

    const withoutSeries = await buildLocalContext(bookOne.id, false);
    expect(withoutSeries.chapterSummaries.some((c) => c.title.includes("Book Two"))).toBe(false);
    expect(withoutSeries.storyBibleDigest).toHaveLength(0);

    const withSeries = await buildLocalContext(bookOne.id, true);
    const siblingChapter = withSeries.chapterSummaries.find((c) => c.chapterId === chapterTwo!.id);
    expect(siblingChapter?.title).toBe(`[Book Two] ${chapterTwo!.title}`);
    expect(siblingChapter?.summary).toContain("Book two content");

    const siblingEntry = withSeries.storyBibleDigest.find((e) => e.name.includes("Book Two Character"));
    expect(siblingEntry?.name).toBe("[Book Two] Book Two Character");

    // The active book's own content must still be present alongside the series content.
    expect(withSeries.chapterSummaries.some((c) => c.chapterId === chapterOne!.id)).toBe(true);
  });

  it("is a no-op for a standalone project (no seriesId), even with seriesScope true", async () => {
    const standalone = await createProject(USER_ID, { title: "Standalone Book" });
    const ctx = await buildLocalContext(standalone.id, true);
    expect(ctx.chapterSummaries.every((c) => !c.title.startsWith("["))).toBe(true);
  });
});
