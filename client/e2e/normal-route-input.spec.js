import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startNormalRoute, walkNormally } from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/normal-route-input-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 390]) {
  test(`normal route waits for the first game frame before releasing a step ${width}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width, height: 900 });
    await startNormalRoute(page, 6);
    const target = await page.evaluate(() => {
      const game = window.__normalRouteGame,
        s = game.scene.getScene("World");
      const target = [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ]
        .map(([x, y]) => ({ x: s.playerX + x, y: s.playerY + y }))
        .find((p) => s.canWalkTile(s.tileData[p.y]?.[p.x]));
      if (!target) throw new Error("No adjacent walkable tile");
      window.__slowStep = {
        before: { x: s.playerX, y: s.playerY },
        target,
        events: [],
      };
      const record = (e) => {
        if (e.key.startsWith("Arrow"))
          window.__slowStep.events.push({
            type: e.type,
            key: e.key,
            at: performance.now(),
          });
      };
      document.addEventListener("keydown", record);
      document.addEventListener("keyup", record);
      // A deliberate renderer stall models a loaded frame; game state/input
      // remain untouched, and native input must wait until a step is accepted.
      game.loop.sleep();
      setTimeout(() => {
        window.__slowStep.wokeAt = performance.now();
        game.loop.wake();
      }, 250);
      return target;
    });
    try {
      await walkNormally(page, "World", target);
    } finally {
      const data = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("World");
        return {
          ...window.__slowStep,
          after: { x: s.playerX, y: s.playerY },
          animating: s.animating,
        };
      });
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify(data, null, 2),
      );
      await page.screenshot({ path: path.join(proof, `${width}-after.png`) });
    }
    const data = await page.evaluate(() => window.__slowStep);
    expect(data.events.find((e) => e.type === "keydown").at).toBeLessThan(
      data.wokeAt,
    );
    expect(data.events.find((e) => e.type === "keyup").at).toBeGreaterThan(
      data.wokeAt,
    );
    const position = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("World");
      return { x: s.playerX, y: s.playerY };
    });
    expect(position).toEqual(target);
  });
}
