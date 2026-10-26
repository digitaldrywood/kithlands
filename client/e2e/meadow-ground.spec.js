import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startNormalRoute } from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/meadow-ground-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test(`meadow ground and resource habitats at ${width}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await startNormalRoute(page, 24);
    const before = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("World");
      return JSON.stringify({
        tiles: s.tileData,
        resources: s.gameState.resources,
      });
    });
    // Camera/position fixtures inspect generated habitats, not travel pacing.
    const locations = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("World");
      const resources = ["herb", "mineral", "wood"].map((visual) => {
        const n = s.gameState.resources.find((n) => n.visual === visual);
        if (!n) throw new Error(`Missing ${visual} habitat`);
        return { label: visual, x: n.x, y: n.y };
      });
      let sand;
      for (let y = 1; y < s.mapH - 1 && !sand; y++)
        for (let x = 1; x < s.mapW - 1 && !sand; x++)
          if (s.tileData[y][x] === 12 && s.tileData[y][x + 1] === 0)
            sand = { label: "sand-edge", x, y };
      return [
        { label: "arrival", x: s.playerX, y: s.playerY },
        ...resources,
        ...(sand ? [sand] : []),
      ];
    });
    for (const location of locations) {
      await page.evaluate(({ x, y }) => {
        const b = window.__kithlandsTest;
        b.setPlayerTile(x, y, "World");
        b.centerCameraOnPlayer("World");
      }, location);
      await page.waitForTimeout(250);
      await page.screenshot({
        path: path.join(proof, `${width}-${location.label}.png`),
      });
    }
    const after = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("World");
      return JSON.stringify({
        tiles: s.tileData,
        resources: s.gameState.resources,
      });
    });
    expect(after).toBe(before);
    expect(errors).toEqual([]);
    writeFileSync(
      path.join(proof, `${width}-audit.json`),
      JSON.stringify(
        {
          locations,
          errors,
          canonicalMapAndResourcesUnchanged: after === before,
        },
        null,
        2,
      ),
    );
  });
}
