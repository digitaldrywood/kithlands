import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const run = Date.now();
const proof = new URL(`../tmp/title-cover-${run}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 720, height: 847 },
  { width: 390, height: 844 },
]) {
  test(`cover and saved game flow at ${viewport.width}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.goto("/?noEncounters=1");
    const title = page.getByRole("main", { name: "Kithlands main menu" });
    await expect(title).toBeVisible({ timeout: 60000 });
    await expect(title.locator(".title-cover")).toHaveJSProperty(
      "complete",
      true,
    );
    expect(
      await title.locator(".title-cover").evaluate((img) => img.naturalWidth),
    ).toBeGreaterThan(1000);
    await title.getByLabel("Player email").fill("");
    await title.getByRole("button", { name: /New game/ }).click();
    await expect(title.getByRole("status")).toContainText("valid email");
    await title
      .getByLabel("Player email")
      .fill(`cover-${run}-${viewport.width}@kithlands.dev`);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    await page.screenshot({
      path: new URL(`home-${viewport.width}.png`, proof).pathname,
    });
    await title.getByRole("button", { name: /Quick start/ }).click();
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await expect(title).toHaveCount(0);
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    const result = await page.evaluate(() =>
      window.__kithlandsTest.saveGame("A new dawn"),
    );
    expect(result.error).toBeFalsy();
    await page.reload();
    await expect(title).toBeVisible();
    await title.getByRole("button", { name: /Continue/ }).click();
    await expect(
      title.getByRole("button", { name: /A new dawn/ }),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    await page.screenshot({
      path: new URL(`saves-${viewport.width}.png`, proof).pathname,
    });
    await title.getByRole("button", { name: /A new dawn/ }).click();
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await expect(title).toHaveCount(0);
    await page.reload();
    await expect(title).toBeVisible();
    await title.getByRole("button", { name: /New game/ }).click();
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Wizard",
    );
    await expect(title).toHaveCount(0);
  });
}
