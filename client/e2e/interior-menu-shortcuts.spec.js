import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { startNormalRoute } from "./helpers/normal-route.js";
const proof = path.resolve(`tmp/interior-menu-shortcuts-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 390]) {
  test.describe(`${width} shared menu`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });
    test("help and sound have working visible keyboard shortcuts", async ({
      page,
    }) => {
      await startNormalRoute(page, 4);
      const before = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("World");
        return { x: s.playerX, y: s.playerY };
      });
      await page.keyboard.press("m");
      await expect(
        page.getByRole("dialog", { name: "Your party" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Help & controls/ }),
      ).toContainText("H");
      await page.keyboard.press("h");
      await expect(page.locator(".kith-codex")).toBeVisible();
      await page.screenshot({ path: path.join(proof, `${width}-help.png`) });
      await page.keyboard.press("Escape");
      await expect(page.locator(".kith-codex")).toHaveCount(0);
      await page.keyboard.press("m");
      await expect(
        page.getByRole("dialog", { name: "Your party" }),
      ).toBeVisible();
      const sound = page.getByRole("button", { name: /^Sound:/ }),
        label = await sound.textContent();
      await expect(sound).toContainText("V");
      await page.keyboard.press("v");
      await expect(sound).not.toHaveText(label);
      await page.keyboard.press("v");
      await expect(sound).toHaveText(label);
      await page.screenshot({ path: path.join(proof, `${width}-sound.png`) });
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Your party" }),
      ).toHaveCount(0);
      const after = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("World");
        return {
          x: s.playerX,
          y: s.playerY,
          locked: !!s._modalLocks?.size,
          enabled: s.input.enabled,
        };
      });
      expect(after).toEqual({ ...before, locked: false, enabled: true });
    });
  });
}
