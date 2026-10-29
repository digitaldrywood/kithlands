import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { startNormalRoute, walkNormally } from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const proof = path.resolve(`tmp/exploration-notice-${Date.now()}`);
mkdirSync(proof, { recursive: true });

for (const width of [1440, 800, 390]) {
  test.describe(`${width} notice`, () => {
    test.use({
      viewport: {
        width,
        height: width === 1440 ? 900 : width === 390 ? 844 : 600,
      },
      hasTouch: width === 390,
    });
    test("save and gathering receipts stay clear of world controls", async ({
      page,
    }) => {
      test.setTimeout(90000);
      page.setDefaultTimeout(10000);
      await startNormalRoute(page, 6);
      if (width === 390) {
        await page.touchscreen.tap(195, 300);
        await expect(page.locator(".exploration-hud")).toHaveClass(
          /explore-touch/,
        );
      }
      const entrance = await page.evaluate(() => {
        const scene = window.__normalRouteGame.scene.getScene("World");
        return scene.spawns.find(
          (s) => s.node_id === scene.gameState.settlement_entry_node_id,
        );
      });
      expect(await walkNormally(page, "World", entrance)).toBe("World");
      const interaction = page.locator(".explore-interaction");
      await expect(interaction).toBeVisible();
      const saveNow = async () => {
        if (width === 390)
          await page.getByRole("button", { name: "Menu", exact: true }).tap();
        else await page.keyboard.press("m");
        const save = page.getByRole("button", { name: /^Save game/ });
        if (width === 390) await save.tap();
        else {
          await save.focus();
          await page.keyboard.press("Enter");
        }
      };
      await saveNow();
      const notice = page.locator(".explore-notice");
      await expect(notice).toHaveText("Game saved!");
      await expect(notice).toBeVisible();
      await expect(interaction).toBeVisible();
      await page.screenshot({ path: path.join(proof, `${width}-receipt.png`) });
      const receiptBox = await notice.boundingBox();
      const actionBox = await interaction.boundingBox();
      expect(receiptBox.y + receiptBox.height).toBeLessThanOrEqual(
        actionBox.y - 4,
      );
      expect(receiptBox.x).toBeGreaterThanOrEqual(0);
      expect(receiptBox.x + receiptBox.width).toBeLessThanOrEqual(width);
      await expect(notice).toBeHidden({ timeout: 5000 });
      await expect(interaction).toBeVisible();
      expect((await interaction.boundingBox()).y).toBeCloseTo(actionBox.y, 0);
      await page.screenshot({ path: path.join(proof, `${width}-expired.png`) });
      // A transport-failure fixture exercises a long real menu error receipt.
      // The first save and the gathering below still use the actual server.
      await page.route(
        "**/api/game/*/save",
        (route) =>
          route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error:
                "The save service is temporarily unavailable. Your current adventure is safe; keep playing or retry saving when the connection returns.",
            }),
          }),
        { times: 1 },
      );
      await saveNow();
      await expect(notice).toContainText("Save failed:");
      await expect(notice).toBeVisible();
      await page.screenshot({
        path: path.join(proof, `${width}-long-error.png`),
      });
      const errorBox = await notice.boundingBox();
      for (const button of await page
        .locator(".exploration-hud button:visible")
        .all()) {
        const box = await button.boundingBox();
        expect(errorBox.y + errorBox.height).toBeLessThanOrEqual(box.y - 4);
      }
      await expect(notice).toBeHidden({ timeout: 5000 });
      const herb = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("World");
        return s.gameState.resources
          .filter((r) => r.material_id === "meadow_herb" && !r.gathered)
          .sort(
            (a, b) =>
              Math.abs(a.x - s.playerX) +
              Math.abs(a.y - s.playerY) -
              Math.abs(b.x - s.playerX) -
              Math.abs(b.y - s.playerY),
          )[0];
      });
      while ((await walkNormally(page, "World", herb)) === "Battle")
        await fightNormally(page);
      const gather = page.getByRole("button", {
        name: `Gather — ${herb.name}`,
        exact: true,
      });
      if (width === 390) await gather.tap();
      else await gather.click();
      await expect(notice).toContainText(`+${herb.quantity} `);
      await expect(notice).toBeVisible();
      await page.screenshot({
        path: path.join(proof, `${width}-gathered.png`),
      });
      const longReceipt = await notice.boundingBox();
      for (const button of await page
        .locator(".exploration-hud button:visible")
        .all()) {
        const box = await button.boundingBox();
        expect(longReceipt.y + longReceipt.height).toBeLessThanOrEqual(
          box.y - 4,
        );
      }
      if (width === 390) {
        const paintedTop = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("World");
          const buttons = s.children.list.filter(
            (o) =>
              ["Rectangle", "Arc"].includes(o.type) &&
              o.input?.enabled &&
              o.scrollFactorX === 0 &&
              o.scrollFactorY === 0,
          );
          const rect = s.game.canvas.getBoundingClientRect();
          return (
            rect.top +
            (Math.min(...buttons.map((o) => o.getBounds().top)) * rect.height) /
              s.scale.gameSize.height
          );
        });
        expect(Number.isFinite(paintedTop)).toBe(true);
        expect(longReceipt.y + longReceipt.height).toBeLessThanOrEqual(
          paintedTop - 4,
        );
      }
      await expect(notice).toBeHidden({ timeout: 5000 });
      await page.screenshot({
        path: path.join(proof, `${width}-gathering-expired.png`),
      });
    });
  });
}
