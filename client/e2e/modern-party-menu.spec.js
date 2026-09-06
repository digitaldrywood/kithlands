import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
const proof = new URL(`../tmp/modern-menu-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 720, height: 847 },
  { width: 390, height: 844 },
]) {
  test(`modern party menu at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.startCustomGame({
        town_name: "Cadott, WI",
        people: [{ name: "Bob", relation: "friendly" }],
        places: ["General Store"],
        big_building: "Town Hall",
        difficulty: "normal",
        party: [
          { name: "Hero", class_id: "warrior" },
          { name: "Sparks", class_id: "cinder" },
          { name: "Shade", class_id: "rogue" },
          { name: "Willow", class_id: "mender" },
        ],
      }),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    await page.keyboard.press("m");
    const menu = page.getByRole("dialog", { name: "Your party", exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.locator(".party-card")).toHaveCount(4);
    await page.screenshot({
      path: new URL(`overview-${viewport.width}.png`, proof).pathname,
    });
    const box = await menu.locator(".viewport-dialog-panel").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    const nav = menu.locator(".party-nav-scroll");
    await nav.hover();
    await page.mouse.wheel(0, 700);
    await expect(
      menu.getByRole("button", { name: "Exit to main menu", exact: true }),
    ).toBeInViewport();
    await expect(
      nav.getByRole("button", { name: "Back to game" }),
    ).toBeInViewport();
    await page.screenshot({
      path: new URL(`scrolled-${viewport.width}.png`, proof).pathname,
    });
    await menu
      .getByRole("button", { name: "Select Shade", exact: true })
      .click();
    await expect(
      menu.getByRole("button", { name: "Select Shade", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("c");
    await expect(menu).toBeHidden();
    await expect(page.locator(".kith-equipment-screen")).toBeVisible();
    await expect(page.locator(".equipment-character")).toHaveText("Shade");
    await page
      .getByRole("button", { name: "Close equipment", exact: true })
      .click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await page.keyboard.press("m");
    await expect(menu).toBeVisible();
    await menu
      .getByRole("button", { name: "Exit to main menu", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Exit to main menu?" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Keep playing", exact: true })
      .click();
    await expect(menu).toBeHidden();
  });
}
