import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
const proof = new URL(`../tmp/exploration-hud-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 610, 390]) {
  test(`exploration controls and exit at ${width}`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: width === 1440 ? 900 : width === 390 ? 844 : 837,
    });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    const hud = page.getByRole("region", { name: "Exploration controls" });
    await expect(hud).toBeVisible();
    await expect(
      hud.getByRole("button", { name: /^Objective|^Party/ }),
    ).toHaveCount(0);
    await expect(hud.locator('[data-route="true"]')).toHaveCount(0);
    await expect(
      hud.getByRole("button", { name: "Menu", exact: true }),
    ).toHaveCount(1);
    await page.screenshot({
      path: new URL(`world-${width}.png`, proof).pathname,
    });
    for (const item of await hud.locator("button:visible").all())
      await expect(item).toBeInViewport();
    await hud.getByRole("button", { name: "Menu", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Your party", exact: true });
    await expect(menu).toBeVisible();
    await expect(hud).toBeHidden();
    const exit = menu.getByRole("button", {
      name: "Exit to main menu",
      exact: true,
    });
    await expect(exit.locator(":scope > span")).toHaveText("Exit game");
    await expect(exit.locator("kbd")).toHaveText("Alt+1");
    await expect(exit).toHaveAttribute("aria-keyshortcuts", "Alt+1");
    await menu
      .locator(".party-nav-scroll")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(exit).toBeInViewport();
    await page.screenshot({
      path: new URL(`menu-${width}.png`, proof).pathname,
    });
    await exit.click();
    await page
      .getByRole("button", { name: "Keep playing", exact: true })
      .click();
    await expect(hud).toBeVisible();
    await hud.getByRole("button", { name: "Menu", exact: true }).click();
    await exit.click();
    await page
      .getByRole("button", { name: "Exit without saving", exact: true })
      .click();
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Title",
    );
    await expect(hud).toHaveCount(0);
  });
}
