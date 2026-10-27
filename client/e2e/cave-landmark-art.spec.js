import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { startNormalRoute } from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/cave-landmark-art-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test(`cave variant is readable in the World scene at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await startNormalRoute(page, 24);
    // The starter world selects ruins. Give its existing marker a stable cave
    // variant ID for this visual fixture; no server state or save is changed.
    const marker = await page.evaluate(() => {
      const scene = window.__normalRouteGame.scene.getScene("World");
      scene.spawns.find((spawn) => spawn.node_id === "wilderness_2").node_id =
        "dungeon_1";
      return window.__kithlandsTest
        .redrawWorldMap()
        .find((item) => item.nodeId === "dungeon_1");
    });
    expect(marker).toMatchObject({
      variantId: "dungeon-cave",
      key: "world_landmark_dungeon_cave",
      width: 64,
      height: 64,
    });
    const spawn = await page.evaluate(() =>
      window.__normalRouteGame.scene
        .getScene("World")
        .spawns.find((item) => item.node_id === "dungeon_1"),
    );
    expect(marker.y).toBe(spawn.y * 32 + 16 - 12);
    await page.evaluate(() => {
      window.__kithlandsTest.approachWorldSpawn("dungeon_1");
      window.__kithlandsTest.centerCameraOnPlayer("World");
    });
    await expect(
      page.getByRole("button", { name: `Enter — ${marker.name}`, exact: true }),
    ).toBeVisible();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.__normalRouteGame.events.once("postrender", resolve);
        }),
    );
    await page.screenshot({ path: path.join(proof, `${width}-approach.png`) });
    expect(errors).toEqual([]);
  });
}
