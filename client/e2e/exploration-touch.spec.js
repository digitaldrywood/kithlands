import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
test("touch exploration retains usable controls and trail action", async ({
  page,
}) => {
  const proof = new URL(
    `../tmp/exploration-touch-${Date.now()}/`,
    import.meta.url,
  );
  mkdirSync(proof, { recursive: true });
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  await page.touchscreen.tap(195, 300);
  const hud = page.locator(".exploration-hud");
  await expect(hud).toHaveClass(/explore-touch/);
  await page.screenshot({ path: new URL("touch-world.png", proof).pathname });
  await expect(
    hud.getByRole("button", { name: /^Party|^Objective/ }),
  ).toHaveCount(0);
  await expect(hud.locator('[data-route="true"]')).toHaveCount(0);
  await hud.getByRole("button", { name: "Menu", exact: true }).tap();
  await expect(
    page.getByRole("dialog", { name: "Your party", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exit to main menu", exact: true })
    .tap();
  await page.getByRole("button", { name: "Keep playing", exact: true }).tap();
  await expect(hud).toBeVisible();
  const entry = hud.locator('[data-route="false"]');
  await expect(entry).toBeVisible();
  await entry.tap();
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Dungeon",
  );
  await expect(hud).toHaveCount(0);
});
