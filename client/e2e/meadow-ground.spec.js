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
      if (s.cameras.main.zoom !== (s.gameplayLayout.portrait ? 2 : 1))
        throw new Error("Unexpected world framing");
      if (s.worldUICamera && s.worldUICamera.zoom !== 1)
        throw new Error("World zoom changed fixed-control size");
      const props = s.resourceArt
        .getChildren()
        .filter((object) => object.resourceNodeID);
      if (
        props.length !== s.gameState.resources.filter((n) => !n.gathered).length
      )
        throw new Error("A live resource is missing its approved prop");
      for (const prop of props) {
        if (prop.width !== 64 || prop.height !== 48 || prop.originY !== 1)
          throw new Error(`Invalid resource bounds: ${prop.resourceNodeID}`);
        if (!prop.texture.key.startsWith("resource_"))
          throw new Error(`Resource fallback art: ${prop.resourceNodeID}`);
      }
      const roadTextures = () =>
        s.tileSprites.list
          .filter((image) => s.tileData[image.y / 32]?.[image.x / 32] === 1)
          .map((image) => image.texture.key);
      const warmed = roadTextures();
      if (!warmed.length || warmed.some((key) => !key.endsWith(":worn")))
        throw new Error("Meadow road is not using the worn path renderer");
      s.drawMap();
      if (JSON.stringify(roadTextures()) !== JSON.stringify(warmed))
        throw new Error("Redraw changed the cached road identity");
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
      const rare = s.gameState.resources.find((n) => n.required_level);
      if (!rare) throw new Error("Missing rare mineral habitat");
      resources.push({ label: "rare-mineral", x: rare.x, y: rare.y });
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
      if (
        ["herb", "wood", "mineral", "rare-mineral"].includes(location.label)
      ) {
        const adjacent = await page.evaluate(({ x, y }) => {
          const s = window.__normalRouteGame.scene.getScene("World");
          return [
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y + 1 },
          ].find((p) => s.canWalkTile(s.tileData[p.y]?.[p.x]));
        }, location);
        expect(adjacent).toBeTruthy();
        await page.evaluate(({ x, y }) => {
          window.__kithlandsTest.setPlayerTile(x, y, "World");
          window.__kithlandsTest.centerCameraOnPlayer("World");
        }, adjacent);
        await page.waitForTimeout(250);
        await page.screenshot({
          path: path.join(proof, `${width}-${location.label}-beside.png`),
        });
      }
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
