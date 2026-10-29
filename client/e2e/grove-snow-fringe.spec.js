import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startNormalRoute } from "./helpers/normal-route.js";
import field from "../../shared/field_presentation.json" with { type: "json" };

const proof = path.resolve(`tmp/grove-snow-fringe-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test(`snow regions feather into highlands without changing terrain at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await startNormalRoute(page, 24);
    const baseline = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("World");
      const marker = window.__kithlandsTest
        .worldLandmarkSnapshot()
        .find((m) => m.family === "natural_grove");
      const grove = s.spawns.find((p) => p.node_id === marker.nodeId);
      let snow;
      for (let y = 1; y < s.tileData.length - 2 && !snow; y++)
        for (let x = 1; x < s.tileData[y].length - 1 && !snow; x++)
          if (s.tileData[y][x] === 16 && s.tileData[y + 1]?.[x] === 11)
            snow = { x, y };
      if (!snow) throw Error("Expected snow bordering highlands");
      for (let y = grove.y - 12; y <= grove.y + 12; y++)
        for (let x = grove.x - 12; x <= grove.x + 12; x++)
          if (
            s.tileData[y]?.[x] === 16 &&
            [
              [0, -1],
              [1, 0],
              [0, 1],
              [-1, 0],
            ].every(([dx, dy]) => s.tileData[y + dy]?.[x + dx] !== 16)
          )
            throw Error("Unexpected isolated snow near the grove");
      window.__kithlandsTest.approachWorldSpawn(grove.node_id);
      window.__kithlandsTest.centerCameraOnPlayer("World");
      return {
        grove: { node: grove.node_id, x: grove.x, y: grove.y },
        snow,
        canonical: JSON.stringify({
          tiles: s.tileData,
          resources: s.gameState.resources,
        }),
      };
    });
    await page.screenshot({ path: path.join(proof, `${width}-grove.png`) });
    const inspect = () =>
      page.evaluate(
        ({ snow, base }) => {
          const s = window.__normalRouteGame.scene.getScene("World");
          const tile = s.tileSprites.list.find(
            (p) => p.x === snow.x * 32 && p.y === (snow.y + 1) * 32,
          );
          const source = tile.texture.getSourceImage();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 16;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(source, 0, 0);
          const pixels = ctx.getImageData(0, 3, 16, 1).data;
          let basePixels = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const hex =
              "#" +
              [pixels[i], pixels[i + 1], pixels[i + 2]]
                .map((v) => v.toString(16).padStart(2, "0"))
                .join("");
            if (base.includes(hex)) basePixels++;
          }
          return {
            basePixels,
            otherPixels: 16 - basePixels,
            key: tile.texture.key,
            canonical: JSON.stringify({
              tiles: s.tileData,
              resources: s.gameState.resources,
            }),
          };
        },
        { snow: baseline.snow, base: field.meadow.ground.tile_hill },
      );
    await page.evaluate(({ x, y }) => {
      window.__kithlandsTest.setPlayerTile(x + 2, y + 1, "World");
      window.__kithlandsTest.centerCameraOnPlayer("World");
    }, baseline.snow);
    const first = await inspect();
    // A mixed row inside the old solid snow-to-hill boundary rejects the cross-shaped edge.
    expect(first.basePixels).toBeGreaterThanOrEqual(2);
    expect(first.otherPixels).toBeGreaterThanOrEqual(2);
    expect(first.canonical).toBe(baseline.canonical);
    await page.evaluate(({ x, y }) => {
      window.__kithlandsTest.setPlayerTile(x + 2, y + 1, "World");
      window.__kithlandsTest.centerCameraOnPlayer("World");
      window.__kithlandsTest.redrawWorldMap();
    }, baseline.snow);
    const redrawn = await inspect();
    expect(redrawn).toEqual(first);
    await page.screenshot({
      path: path.join(proof, `${width}-snow-fringe.png`),
    });
    // Explicit rendering fixtures cover both assets, rather than assuming the
    // generated route happens to select every stable landmark variant.
    const variants = [];
    for (const key of [
      "world_landmark_natural_grove",
      "world_landmark_natural_spring",
    ]) {
      const rendered = await page.evaluate(
        async ({ node, key }) => {
          const s = window.__normalRouteGame.scene.getScene("World");
          const index = s.landmarkMarkerModels.findIndex(
            (m) => m.nodeId === node,
          );
          const image = s.landmarkMarkerContainer.list[index];
          const spawn = s.spawns.find((p) => p.node_id === node);
          window.__kithlandsTest.setPlayerTile(
            spawn.x + 2,
            spawn.y + 2,
            "World",
          );
          window.__kithlandsTest.centerCameraOnPlayer("World");
          image.setTexture(key);
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          return {
            key: image.texture.key,
            width: image.texture.getSourceImage().width,
            height: image.texture.getSourceImage().height,
            canonical: JSON.stringify({
              tiles: s.tileData,
              resources: s.gameState.resources,
            }),
          };
        },
        { node: baseline.grove.node, key },
      );
      expect(rendered).toEqual({
        key,
        width: 64,
        height: 64,
        canonical: baseline.canonical,
      });
      variants.push(key);
      await page.screenshot({ path: path.join(proof, `${width}-${key}.png`) });
    }
    await page.evaluate(() => window.__kithlandsTest.redrawWorldMap());
    expect(errors).toEqual([]);
    writeFileSync(
      path.join(proof, `${width}-audit.json`),
      JSON.stringify(
        {
          grove: baseline.grove,
          snow: baseline.snow,
          first: { ...first, canonical: undefined },
          canonicalMapAndResourcesUnchanged: true,
          variants,
          errors,
        },
        null,
        2,
      ),
    );
  });
}
