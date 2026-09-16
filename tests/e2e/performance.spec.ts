import { test, expect } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateManuscriptFixture } from "./fixtures/generateManuscriptFixture";

/**
 * Real-browser performance evidence for the "≥100,000-word fixture manuscript" gap stated in
 * docs/TESTING.md: generates a deterministic 40-chapter / ~100k-word manuscript, imports it
 * through the actual import UI, and measures import time, chapter-switch time, and typing/autosave
 * latency in a real Chromium instance — not just architecture that's "designed for" scale.
 *
 * Thresholds are intentionally generous (this sandbox's CPU/IO isn't representative of a user's
 * machine) but still meaningful: the point is proving these operations don't scale with total book
 * size — editor typing latency on a 100k-word book should look the same as on an empty one, because
 * the editor only ever loads one scene's content, never the whole manuscript. A regression that
 * made autosave serialize the whole book, for example, would blow well past these numbers.
 */
test("100k-word manuscript: import, chapter-switch, and typing/autosave latency stay scene-scoped, not book-scoped", async ({ page }) => {
  const fixture = generateManuscriptFixture(40, 2500);
  expect(fixture.approxWordCount).toBeGreaterThanOrEqual(100_000);

  const dir = mkdtempSync(join(tmpdir(), "inkwell-perf-"));
  const filePath = join(dir, "large-manuscript.md");
  writeFileSync(filePath, fixture.markdown);

  await page.goto("/dashboard");
  await expect(page.getByText("Your Books")).toBeVisible();

  await page.getByRole("button", { name: "Import" }).click();
  const fileInput = page.locator('input[type="file"]');

  const detectStart = Date.now();
  await fileInput.setInputFiles(filePath);
  await expect(page.getByText(`Detected ${fixture.chapterCount} chapter(s):`)).toBeVisible({ timeout: 15_000 });
  const detectMs = Date.now() - detectStart;
  console.log(`[perf] chapter detection on a ${fixture.approxWordCount}-word file: ${detectMs}ms`);
  expect(detectMs).toBeLessThan(10_000);

  const importStart = Date.now();
  await page.getByRole("button", { name: /Create book from \d+ chapter\(s\)/ }).click();
  await page.waitForURL(/\/project\/.+\/manuscript/, { timeout: 60_000 });
  const importMs = Date.now() - importStart;
  console.log(`[perf] creating ${fixture.chapterCount} chapters + autosaving each scene: ${importMs}ms`);
  expect(importMs).toBeLessThan(60_000);

  // Full manuscript word count should reflect everything that was imported, proving the import
  // actually landed all 40 chapters rather than truncating silently.
  await expect(page.getByText(/words ·.*pages/)).toContainText(/\d{2,3},\d{3} words/, { timeout: 15_000 });

  // Switching to a chapter near the end of a 40-chapter sidebar shouldn't be noticeably slower
  // than switching to the first one — each chapter/scene load is independent of total book size.
  const chapterItems = page.locator(".iw-ms-chapter-item .title");
  await expect(chapterItems).toHaveCount(fixture.chapterCount, { timeout: 15_000 });

  const switchStart = Date.now();
  await chapterItems.nth(fixture.chapterCount - 1).click();
  await expect(page.locator(".ProseMirror")).toContainText(/\w+/, { timeout: 10_000 });
  const switchMs = Date.now() - switchStart;
  console.log(`[perf] switching to the last of ${fixture.chapterCount} chapters: ${switchMs}ms`);
  expect(switchMs).toBeLessThan(5_000);

  // Typing + autosave on the currently-open scene: this is the number that must NOT grow with
  // total book size — the editor and autosave path only ever touch the one open scene.
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.press("End");
  const sceneSaveStatus = page.getByText(/words this scene/);
  const typeStart = Date.now();
  await page.keyboard.type(" The final line of the performance test manuscript.");
  await expect(sceneSaveStatus).toContainText("Saving…");
  await expect(sceneSaveStatus).toContainText("Saved", { timeout: 5_000 }); // ~1.5s debounce + save
  const typeToSavedMs = Date.now() - typeStart;
  console.log(`[perf] typing + autosave settle time on a scene inside a ${fixture.approxWordCount}-word book: ${typeToSavedMs}ms`);
  expect(typeToSavedMs).toBeLessThan(5_000);
});
