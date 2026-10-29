import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const proof = new URL(
  `../tmp/crafting-sources-${Date.now()}/`,
  import.meta.url,
);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [610, 837],
  [390, 844],
  [800, 600],
]) {
  test(`selected crafting recipe and sources fit ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    await page.keyboard.press("m");
    await page.getByRole("button", { name: /Crafting/i }).click();
    const dialog = page.getByRole("dialog", { name: "Crafting", exact: true });
    const selected = dialog.getByRole("button", {
      name: "Forge Runic Mythril Sword",
      exact: true,
    });
    await selected.click();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    const bounds = await selected.evaluate((button) => {
      const row = button.getBoundingClientRect();
      const library = button.closest(".craft-library").getBoundingClientRect();
      const body = button
        .closest(".viewport-dialog-body")
        .getBoundingClientRect();
      return {
        left: row.left - library.left,
        right: library.right - row.right,
        top: row.top - body.top,
        bottom: body.bottom - row.bottom,
      };
    });
    for (const value of Object.values(bounds))
      expect(value).toBeGreaterThanOrEqual(-1);
    await expect(dialog.locator(".craft-source")).toHaveCount(5);
    await expect(dialog.locator(".craft-preview")).toContainText(
      "Quest reward · restore Old Mill",
    );
    await expect(dialog.locator(".craft-confirm")).toBeDisabled();
    const footer = await dialog.locator(".craft-actions").boundingBox();
    expect(footer.y).toBeGreaterThanOrEqual(0);
    expect(footer.y + footer.height).toBeLessThanOrEqual(height);
    await page.screenshot({
      path: new URL(`${width}-selected-rare-recipe.png`, proof).pathname,
    });
    await dialog.locator(".craft-ingredient").last().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: new URL(`${width}-quest-and-store-sources.png`, proof).pathname,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
}
