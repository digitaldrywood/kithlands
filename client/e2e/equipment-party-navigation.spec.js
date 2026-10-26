import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startNormalRoute } from "./helpers/normal-route.js";
const proof = path.resolve(`tmp/equipment-party-navigation-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test.describe(`${width} party navigation`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390 });
    test("rapidly browse a four-person party in both directions without changing gear", async ({
      page,
    }) => {
      await startNormalRoute(page, 24);
      const snapshot = () =>
        page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("World");
          return { state: s.gameState, x: s.playerX, y: s.playerY };
        });
      const before = await snapshot();
      await page.keyboard.press("m");
      await page.getByRole("button", { name: /^Character/i }).click();
      const screen = page.getByRole("dialog", {
        name: "Character",
        exact: true,
      });
      const next = screen.getByRole("button", {
        name: "Next character",
        exact: true,
      });
      const previous = screen.getByRole("button", {
        name: "Previous character",
        exact: true,
      });
      if (width === 390) {
        await next.tap();
        await next.tap();
      } else await next.dblclick();
      await expect(screen.locator(".equipment-character")).toHaveText("Shade");
      await expect(screen.locator(".equipment-party-position")).toHaveText(
        "3/4",
      );
      await page.screenshot({
        path: path.join(proof, `${width}-rapid-next.png`),
      });
      if (width === 390) {
        await previous.tap();
        await previous.tap();
      } else await previous.dblclick();
      await expect(screen.locator(".equipment-character")).toHaveText("Hero");
      await expect(screen.locator(".equipment-party-position")).toHaveText(
        "1/4",
      );
      expect(await snapshot()).toEqual(before);
      await page.screenshot({
        path: path.join(proof, `${width}-rapid-back.png`),
      });
      writeFileSync(
        path.join(proof, `${width}-audit.json`),
        JSON.stringify({
          unchanged: true,
          party: ["Hero", "Sparks", "Shade", "Willow"],
        }),
      );
      await page.keyboard.press("Escape");
      await expect(screen).toHaveCount(0);
    });
  });
}
