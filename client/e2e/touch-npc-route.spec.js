import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const proof = path.resolve(`tmp/touch-npc-route-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ hasTouch: true });
for (const [width, height] of [
  [375, 667],
  [390, 844],
  [540, 720],
]) {
  test(`tap-to-walk routes around the keeper at ${width}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await startNormalRoute(page, 4);
    const node = await page.evaluate(() => {
      const state = window.__kithlandsTest.gameState();
      return state.quests[state.current_quest].actions[0].location;
    });
    const spawn = await page.evaluate(
      (id) =>
        window.__normalRouteGame.scene
          .getScene("World")
          .spawns.find((s) => s.node_id === id),
      node,
    );
    while ((await walkNormally(page, "World", spawn)) === "Battle")
      await fightNormally(page);
    await page
      .getByRole("button")
      .filter({ hasText: `— ${spawn.name}` })
      .tap();
    await routeReady(page, "Town");
    const keeper = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("Town");
      return { x: s.npcs[0].x, y: s.npcs[0].y };
    });
    expect(keeper).toEqual({ x: 13, y: 6 });
    await walkNormally(page, "Town", { x: 12, y: 6 });
    const canvas = await page.locator("canvas").boundingBox();
    await page.touchscreen.tap(canvas.x + 4, canvas.y + 4);
    const target = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("Town"),
        c = s.cameras.main,
        r = s.game.canvas.getBoundingClientRect();
      const p = c.matrix.transformPoint(
        s.offsetX + 14 * 32 + 16 - c.scrollX,
        s.offsetY + 6 * 32 + 16 - c.scrollY,
      );
      return {
        x: r.x + (p.x * r.width) / s.scale.gameSize.width,
        y: r.y + (p.y * r.height) / s.scale.gameSize.height,
      };
    });
    await page.screenshot({ path: path.join(proof, `${width}-before.png`) });
    await page.touchscreen.tap(target.x, target.y);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const s = window.__normalRouteGame.scene.getScene("Town");
            return { x: s.playerX, y: s.playerY };
          }),
        { timeout: 8000 },
      )
      .toEqual({ x: 14, y: 6 });
    await page.waitForFunction(
      () => !window.__normalRouteGame.scene.getScene("Town").animating,
    );
    await page.screenshot({ path: path.join(proof, `${width}-after.png`) });
    expect(errors).toEqual([]);
  });
}
