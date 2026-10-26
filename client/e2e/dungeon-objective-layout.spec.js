import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  chooseStoryAction,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const proof = path.resolve(`tmp/dungeon-objective-layout-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [858, 842],
  [800, 600],
  [390, 844],
]) {
  test.describe(`${width} dungeon objective`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390 });
    test("keeps the shared tracker above actions through journal and battle return", async ({
      page,
    }) => {
      test.setTimeout(180000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await startNormalRoute(page, 6);
      const enter = page.getByRole("button", {
        name: "Old Mill trail",
        exact: true,
      });
      if (width === 390) await enter.tap();
      else await enter.click();
      await routeReady(page, "Dungeon");
      const tracker = page.locator(".dungeon-objective-hud");
      const audit = async (stage) => {
        await expect(tracker).toBeVisible();
        await expect(tracker).toHaveCount(1);
        const bounds = await page.evaluate(() => {
          const scene = window.__normalRouteGame.scene.getScene("Dungeon");
          const canvas = scene.game.canvas.getBoundingClientRect();
          const layout = scene.layout;
          const footerTop = layout.height - (layout.portrait ? 542 : 133);
          const root = document.querySelector(".dungeon-objective-hud");
          const details = root.querySelector(".explore-objective-details");
          return {
            tracker: root.getBoundingClientRect().toJSON(),
            details: details.hidden
              ? null
              : details.getBoundingClientRect().toJSON(),
            canvas: canvas.toJSON(),
            mapTop: canvas.top + (layout.top / layout.height) * canvas.height,
            footerTop: canvas.top + (footerTop / layout.height) * canvas.height,
          };
        });
        writeFileSync(
          path.join(proof, `${width}-${stage}.json`),
          JSON.stringify(bounds, null, 2),
        );
        await page.screenshot({
          path: path.join(proof, `${width}-${stage}.png`),
        });
        expect(bounds.tracker.top).toBeGreaterThanOrEqual(bounds.mapTop);
        expect(bounds.tracker.bottom).toBeLessThan(bounds.footerTop);
        expect(bounds.tracker.left).toBeGreaterThanOrEqual(bounds.canvas.left);
        expect(bounds.tracker.right).toBeLessThanOrEqual(bounds.canvas.right);
        expect(bounds.tracker.height).toBeGreaterThanOrEqual(44);
        if (bounds.details) {
          expect(bounds.details.top).toBeGreaterThanOrEqual(
            bounds.tracker.bottom,
          );
          expect(bounds.details.bottom).toBeLessThan(bounds.footerTop);
          expect(bounds.details.right).toBeLessThanOrEqual(bounds.canvas.right);
        }
      };
      await audit("collapsed");
      const toggle = tracker.locator(":scope > button");
      if (width === 390) await toggle.tap();
      else {
        await toggle.focus();
        await page.keyboard.press("Enter");
      }
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await audit("expanded");
      if (width !== 390) {
        await page.keyboard.press("Escape");
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(toggle).toBeFocused();
        await page.keyboard.press("Space");
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
      }
      const journal = tracker.getByRole("button", {
        name: "Quest journal",
        exact: true,
      });
      if (width === 390) await journal.tap();
      else {
        await page.keyboard.press("Tab");
        await expect(journal).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(toggle).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(journal).toBeFocused();
        await page.keyboard.press("Enter");
      }
      await expect(
        page.getByRole("dialog", { name: "Quest Log", exact: true }),
      ).toBeVisible();
      await expect(tracker).toBeHidden();
      await page.screenshot({ path: path.join(proof, `${width}-journal.png`) });
      if (width === 390)
        await page
          .getByRole("button", { name: "Close Quest Log", exact: true })
          .tap();
      else await page.keyboard.press("Escape");
      await expect(tracker).toBeVisible();
      if (width === 390) await toggle.tap();
      else {
        await toggle.focus();
        await page.keyboard.press("Space");
      }
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await chooseStoryAction(page, "heron-trail", width === 390);
      await chooseStoryAction(page, "pool-bramblehog", width === 390);
      await routeReady(page, "Battle");
      await expect(tracker).toHaveCount(0);
      await fightNormally(page);
      await routeReady(page, "Dungeon");
      await audit("battle-return");
      expect(errors).toEqual([]);
    });
  });
}
