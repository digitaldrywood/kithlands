import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
} from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/portrait-settlement-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
  [375, 667],
  [540, 720],
]) {
  test.describe(`${width} settlement`, () => {
    test.use({ viewport: { width, height }, hasTouch: width <= 600 });
    test("native streets, menu locks and inn round trip stay aligned", async ({
      page,
    }) => {
      test.setTimeout(180000);
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const capture = (stage) =>
        page.screenshot({ path: path.join(proof, `${width}-${stage}.png`) });
      await startNormalRoute(page, 24);
      const central = await page.evaluate(() =>
        window.__normalRouteGame.scene
          .getScene("World")
          .spawns.find((s) => s.node_id === "central"),
      );
      expect(await walkNormally(page, "World", central)).toBe("World");
      await page
        .getByRole("button", { name: `Enter — ${central.name}`, exact: true })
        [width <= 600 ? "tap" : "click"]();
      await routeReady(page, "Settlement");
      await capture("arrival");
      const geometry = () =>
        page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Settlement"),
            c = s.cameras.main;
          const r = s.game.canvas.getBoundingClientRect(),
            ratio = r.width / s.scale.gameSize.width;
          return {
            zoom: c.zoom,
            cssActorHeight: s.player.displayHeight * c.zoom * ratio,
            viewport: { x: c.x, y: c.y, width: c.width, height: c.height },
            dpadTop: s.gameplayLayout.controlArea.dpadTop,
            prompt: s.interactPrompt && {
              font: parseFloat(s.interactPrompt.style.fontSize) * ratio,
              bounds: {
                top: s.interactPrompt.getBounds().top,
                bottom: s.interactPrompt.getBounds().bottom,
              },
            },
            trail: s.dungeonEntryButton && {
              height: s.dungeonEntryButton.bg.getBounds().height * ratio,
              font:
                parseFloat(s.dungeonEntryButton.label.style.fontSize) * ratio,
            },
            uiCamera: !!s.interiorUICamera,
            x: s.playerX,
            y: s.playerY,
          };
        });
      const before = await geometry();
      if (width <= 600) {
        expect(before.zoom).toBeGreaterThan(1);
        expect(before.cssActorHeight).toBeGreaterThan(24);
        expect((before.viewport.height * width) / 800).toBeGreaterThan(200);
        expect(before.viewport.y + before.viewport.height).toBeLessThan(
          before.dpadTop,
        );
        expect(before.prompt.font).toBeGreaterThanOrEqual(15.9);
        expect(before.prompt.bounds.top).toBeGreaterThan(
          before.viewport.y + before.viewport.height,
        );
        expect(before.uiCamera).toBe(true);
        expect(before.trail.height).toBeGreaterThanOrEqual(44);
        expect(before.trail.font).toBeGreaterThanOrEqual(15.9);
      } else {
        expect(before.zoom).toBe(1);
        expect(before.uiCamera).toBe(false);
      }
      await expect(
        page
          .getByRole("navigation", { name: "Settlement controls" })
          .getByRole("button", { name: /Menu/ }),
      ).toHaveCount(1);
      if (width <= 600) await page.getByRole("button", { name: /^Menu/ }).tap();
      else await page.keyboard.press("m");
      await expect(
        page.getByRole("heading", { name: "Your party", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(120);
      expect(
        await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Settlement");
          return { x: s.playerX, y: s.playerY };
        }),
      ).toEqual({ x: before.x, y: before.y });
      await capture("menu");
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("heading", { name: "Your party", exact: true }),
      ).toHaveCount(0);
      if (width <= 600) {
        const canvas = await page.locator("canvas").boundingBox();
        // First touch only reveals controls; it cannot initiate a street walk.
        await page.touchscreen.tap(canvas.x + 3, canvas.y + 3);
        await page.waitForTimeout(100);
        const target = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Settlement"),
            c = s.cameras.main;
          for (const [dx, dy] of [
            [0, -1],
            [-1, 0],
            [1, 0],
          ]) {
            const x = s.playerX + dx,
              y = s.playerY + dy;
            if (
              s.tileData[y]?.[x] !== 0 ||
              s.npcs.some((n) => n.x === x && n.y === y)
            )
              continue;
            const p = c.matrix.transformPoint(
              s.offsetX + (x + 0.5) * 32 - c.scrollX,
              s.offsetY + (y + 0.5) * 32 - c.scrollY,
            );
            return { x, y, screenX: p.x, screenY: p.y };
          }
          throw Error("No adjacent street tile");
        });
        await page.touchscreen.tap(
          canvas.x + (target.screenX * canvas.width) / 800,
          canvas.y + (target.screenY * canvas.width) / 800,
        );
        await page.waitForFunction(({ x, y }) => {
          const s = window.__normalRouteGame.scene.getScene("Settlement");
          return s.playerX === x && s.playerY === y && !s.animating;
        }, target);
        await capture("tap-walk");
      }
      const door = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Settlement");
        const door = s.model.interactions.find((o) => o.name === "inn-door");
        return { x: Math.floor(door.x / 32), y: Math.floor(door.y / 32) + 1 };
      });
      expect(await walkNormally(page, "Settlement", door)).toBe("Settlement");
      await page.waitForFunction(
        () =>
          window.__kithlandsTest.settlementSnapshot().currentInteraction ===
          "inn-door",
      );
      await capture("inn-door");
      const enterInn = async () => {
        if (width <= 600) {
          const canvas = await page.locator("canvas").boundingBox();
          const a = await page.evaluate(
            () =>
              window.__normalRouteGame.scene.getScene("Settlement")
                .gameplayLayout.action,
          );
          await page.touchscreen.tap(
            canvas.x + (a.x * canvas.width) / 800,
            canvas.y + (a.y * canvas.width) / 800,
          );
        } else await page.keyboard.press("Enter");
      };
      if (width === 390) {
        let failures = 0;
        await page.route("**/api/game/*/transition", async (route) => {
          if (
            route.request().postDataJSON().transition_id === "inn-door" &&
            failures++ === 0
          )
            await route.abort("failed");
          else await route.continue();
        });
        await enterInn();
        await page.waitForFunction(
          () =>
            window.__normalRouteGame.scene.getScene("Settlement").messageText
              ?.text === "Could not enter. Please try again.",
        );
        expect(
          await page.evaluate(
            () =>
              window.__normalRouteGame.scene.getScene("Settlement").animating,
          ),
        ).toBe(false);
        await capture("network-error-notice");
        await page.waitForFunction(
          () =>
            !window.__normalRouteGame.scene.getScene("Settlement").messageText,
        );
        await capture("notice-expired");
      }
      await enterInn();
      await routeReady(page, "Town");
      await expect(
        page.getByRole("navigation", { name: "Settlement controls" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("navigation", { name: "Interior controls" }),
      ).toBeVisible();
      await capture("inn");
      await page.keyboard.press("Escape");
      await routeReady(page, "Settlement");
      await expect(
        page.getByRole("navigation", { name: "Interior controls" }),
      ).toHaveCount(0);
      expect((await geometry()).zoom).toBe(width <= 600 ? 1.65 : 1);
      await capture("returned-town");
      const exit = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Settlement"),
          o = s.model.interactions.find((o) => o.name === "south-exit");
        return { x: Math.floor(o.x / 32), y: Math.floor(o.y / 32) };
      });
      expect(await walkNormally(page, "Settlement", exit)).toBe("Settlement");
      await page.keyboard.press("Enter");
      await routeReady(page, "World");
      await expect(
        page.getByRole("navigation", { name: "Settlement controls" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: "Exploration controls" }),
      ).toBeVisible();
      await capture("returned-world");
      expect(errors).toEqual([]);
      writeFileSync(
        path.join(proof, `${width}-audit.json`),
        JSON.stringify({ before, errors }, null, 2),
      );
    });
  });
}
