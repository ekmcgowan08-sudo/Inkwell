import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility scan (axe-core) across every core screen, in a real Chromium browser.
 * Closes the "manual practices only, never machine-checked" gap in docs/TESTING.md. Scans the
 * WCAG 2.0/2.1 A and AA rule sets — axe-core's standard default tag set for this kind of sweep.
 */
async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const details = results.violations
    .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)
    .join("\n");
  expect(results.violations, `Accessibility violations on ${label}:\n${details}`).toEqual([]);
}

test("accessibility: dashboard, manuscript, story bible, storyboard, timeline, AI assistant, findings, exports, settings", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Your Books")).toBeVisible();
  await scan(page, "Dashboard");

  await page.getByText("New book").first().click();
  await scan(page, "New book dialog");
  await page.getByLabel("Title").fill("Court of Nine Ravens");
  await page.getByLabel("Genre").fill("Epic Fantasy");
  await page.getByRole("button", { name: "Create book" }).click();
  await page.waitForURL(/\/project\/.+\/manuscript/);

  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.type("Nine ravens circled the tower.");
  await page.waitForTimeout(1800); // let autosave settle so "Saved" state is what's scanned
  await scan(page, "Manuscript editor");

  await page.getByRole("link", { name: /Story Bible/ }).click();
  await scan(page, "Story Bible");

  await page.getByRole("link", { name: /Storyboard/ }).click();
  await scan(page, "Storyboard");

  await page.getByRole("link", { name: /Timeline & Goals/ }).click();
  await scan(page, "Timeline & Goals");

  await page.getByRole("link", { name: /AI Assistant/ }).click();
  await scan(page, "AI Assistant");

  await page.getByRole("link", { name: /AI Findings/ }).click();
  await scan(page, "AI Findings");

  await page.getByRole("link", { name: /Versions & Backups/ }).click();
  await scan(page, "Versions & Backups");

  await page.getByRole("link", { name: /Exports/ }).click();
  await scan(page, "Exports");

  await page.getByRole("link", { name: /Book Settings/ }).click();
  await scan(page, "Book Settings");
});
