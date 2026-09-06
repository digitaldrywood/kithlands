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
  const party = hud.getByRole("button", { name: /^Party/ });
  const objective = hud.getByRole("button", { name: /^Objective/ });
  await party.tap();
  await objective.tap();
  await expect(party).toHaveAttribute("aria-expanded", "true");
  await expect(objective).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({
    path: new URL("touch-expanded.png", proof).pathname,
  });
  await party.tap();
  await objective.tap();
  await expect(hud.locator(".explore-party-details")).toBeHidden();
  await expect(hud.locator(".explore-objective-details")).toBeHidden();
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
