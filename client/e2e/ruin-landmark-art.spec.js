import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { startNormalRoute } from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/ruin-landmark-art-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test(`ruined landmark keeps a readable entrance at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await startNormalRoute(page, 24);
    const marker = await page.evaluate(() =>
      window.__kithlandsTest
        .worldLandmarkSnapshot()
        .find((m) => m.nodeId === "wilderness_2"),
    );
    expect(marker).toMatchObject({
      family: "ruined_dungeon",
      variantId: "dungeon-ruins",
      key: "world_landmark_dungeon_ruins",
      width: 64,
      height: 64,
    });
    await page.evaluate((nodeId) => {
      window.__kithlandsTest.approachWorldSpawn(nodeId);
      window.__kithlandsTest.centerCameraOnPlayer("World");
    }, marker.nodeId);
    const enter = page.getByRole("button", {
      name: `Enter — ${marker.name}`,
      exact: true,
    });
    await expect(enter).toBeVisible();
    await page.screenshot({ path: path.join(proof, `${width}-ruin.png`) });
    await page.evaluate((nodeId) => {
      const scene = window.__normalRouteGame.scene.getScene("World");
      const spawn = scene.spawns.find((s) => s.node_id === nodeId);
      window.__kithlandsTest.setPlayerTile(spawn.x + 2, spawn.y + 2, "World");
      window.__kithlandsTest.centerCameraOnPlayer("World");
    }, marker.nodeId);
    await page.screenshot({
      path: path.join(proof, `${width}-ruin-clear.png`),
    });
    expect(errors).toEqual([]);
  });
}
