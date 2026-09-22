import { test, expect } from "@playwright/test";

/**
 * Regression test for a real bug fixed 2026-09-19 (see docs/DECISIONS.md): the manuscript editor's
 * live "words this scene" counter was wired to a `useMemo` keyed on `activeScene?.content`, which
 * only changes after autosave writes back and the live query re-reads it from IndexedDB — so the
 * counter silently lagged a full ~1.5s debounce cycle behind what the author actually typed. The
 * pre-existing smoke test's `toContainText` assertion never caught this because Playwright's
 * default auto-retry window is longer than the debounce, letting autosave finish and mask the lag.
 *
 * This test uses a deliberately short assertion timeout — shorter than the AUTOSAVE_IDLE_MS
 * debounce in ManuscriptPage.tsx — so it fails against the old (memo-on-content) implementation and
 * passes only if the count updates synchronously from the editor's own `onUpdate` handler.
 */
test("live word count updates before autosave settles, not after", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByText("New book").first().click();
  await page.getByLabel("Title").fill("Live Count Test");
  await page.getByLabel("Genre").fill("Epic Fantasy");
  await page.getByRole("button", { name: "Create book" }).click();
  await page.waitForURL(/\/project\/.+\/manuscript/);

  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.type("One two three four five six seven");

  // Autosave debounce is 1500ms (AUTOSAVE_IDLE_MS); a 400ms window leaves no way for a
  // debounce-triggered re-read to be what's satisfying this assertion.
  await expect(page.getByText(/words this scene/)).toContainText("7 words", { timeout: 400 });

  // The debounce eventually settles too, so the flow as a whole is still verified end to end.
  await expect(page.getByText(/words this scene/)).toContainText("Saved", { timeout: 3000 });
});
