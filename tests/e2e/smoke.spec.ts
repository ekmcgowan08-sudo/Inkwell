import { test, expect } from "@playwright/test";

/**
 * End-to-end smoke test against the local-only build (no Supabase configured
 * — see apps/web/.env, or the absence of one). Exercises the golden path a
 * brand-new author would take: dashboard -> new book -> write -> story
 * bible -> storyboard -> timeline -> AI assistant (deterministic test
 * provider) -> findings scan -> export. Browser-verified evidence for
 * docs/TESTING.md.
 */
test("golden path: create a book and use every core module", async ({ page }) => {
  // Google Fonts requests can fail in network-restricted CI/sandbox
  // environments (blocked by an egress proxy) without that being a defect
  // in the app itself — the UI has system-font fallbacks for exactly this
  // case. Real application errors are anything else.
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (/Failed to load resource/.test(msg.text())) return;
    consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto("/dashboard");
  await expect(page.getByText("Your Books")).toBeVisible();

  await page.getByText("New book").first().click();
  await page.getByLabel("Title").fill("Court of Nine Ravens");
  await page.getByLabel("Genre").fill("Epic Fantasy");
  await page.getByRole("button", { name: "Create book" }).click();
  await page.waitForURL(/\/project\/.+\/manuscript/);

  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.type("Nine ravens circled the tower the night Isolde Vane was cast out.");
  await expect(page.getByText(/words this scene/)).toContainText("12 words");
  await page.waitForTimeout(2000); // autosave debounce
  await expect(page.getByText(/words this scene/)).toContainText("Saved");

  await page.getByRole("link", { name: /Story Bible/ }).click();
  await page.getByText(/Add character/i).click();
  await expect(page.locator("input.iw-display").nth(1)).toHaveValue("New Character");

  await page.getByRole("link", { name: /Storyboard/ }).click();
  await expect(page.locator("#iw-main-content").getByText("Storyboard")).toBeVisible();

  await page.getByRole("link", { name: /Timeline & Goals/ }).click();
  await expect(page.getByText("Today's Goal")).toBeVisible();
  await page.getByRole("button", { name: /Add event to timeline/ }).click();
  await expect(page.locator("#iw-main-content input.iw-display")).toHaveValue("New event");

  await page.getByRole("link", { name: /AI Assistant/ }).click();
  await page.getByPlaceholder(/Ask about plot/).fill("Is there anything inconsistent?");
  await page.keyboard.press("Enter");
  await expect(page.locator(".iw-ai-bubble.assistant").last()).toContainText("test-provider", { timeout: 5000 });

  await page.getByRole("link", { name: /AI Findings/ }).click();
  await page
    .getByRole("button", { name: /Run consistency scan/ })
    .first()
    .click();

  await page.getByRole("link", { name: /Exports/ }).click();
  await expect(page.getByText("Complete Inkwell project backup")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Court of Nine Ravens")).toBeVisible();

  expect(consoleErrors, `Unexpected console/page errors:\n${consoleErrors.join("\n")}`).toHaveLength(0);
});
