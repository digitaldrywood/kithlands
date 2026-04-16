import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));

async function startQuickGame(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

function screenshotPath() {
  return path.join(SPEC_DIR, `terrain-contrast-proof-${RUN_ID}.png`);
}

test.describe("terrain contrast proof", () => {
  test("captures an overworld window with varied terrain and visible blending", async ({
    page,
  }) => {
    await startQuickGame(page);

    const proof = await page.evaluate((runId) => {
      const gameState = window.__kithlandsTest.gameState("World");
      const tilemap = gameState?.tilemap;
      if (!tilemap?.tiles) {
        throw new Error("World tilemap is unavailable");
      }

      const WALKABLE = new Set([0, 1, 5, 6, 9, 11, 12, 13, 16, 18]);
      const NATURAL = new Set([0, 2, 3, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
      const WATER_FAMILY = new Set([2, 14, 15]);
      const FOREST_FAMILY = new Set([3, 10]);
      const SAND_FAMILY = new Set([12]);
      const HEIGHT_FAMILY = new Set([11, 16, 17]);
      const tiles = tilemap.tiles;
      const radiusX = 9;
      const radiusY = 6;

      let best = null;
      for (let y = radiusY; y < tilemap.height - radiusY; y++) {
        for (let x = radiusX; x < tilemap.width - radiusX; x++) {
          const centerTile = tiles[y][x];
          if (!WALKABLE.has(centerTile)) continue;

          const counts = new Map();
          let edgeContacts = 0;
          let hasWater = false;
          let hasForest = false;
          let hasSand = false;
          let hasHeight = false;
          for (let wy = y - radiusY; wy <= y + radiusY; wy++) {
            for (let wx = x - radiusX; wx <= x + radiusX; wx++) {
              const tile = tiles[wy][wx];
              if (NATURAL.has(tile)) {
                counts.set(tile, (counts.get(tile) || 0) + 1);
              }
              if (WATER_FAMILY.has(tile)) hasWater = true;
              if (FOREST_FAMILY.has(tile)) hasForest = true;
              if (SAND_FAMILY.has(tile)) hasSand = true;
              if (HEIGHT_FAMILY.has(tile)) hasHeight = true;
              if (wx > x - radiusX && tiles[wy][wx - 1] !== tile)
                edgeContacts++;
              if (wy > y - radiusY && tiles[wy - 1][wx] !== tile)
                edgeContacts++;
            }
          }

          const uniqueTiles = counts.size;
          const score =
            uniqueTiles * 100 +
            edgeContacts +
            (hasWater ? 400 : 0) +
            (hasForest ? 260 : 0) +
            (hasSand ? 240 : 0) +
            (hasHeight ? 100 : 0);
          if (!best || score > best.score) {
            best = {
              x,
              y,
              score,
              uniqueTiles,
              hasWater,
              hasForest,
              hasSand,
              hasHeight,
              tileCounts: Array.from(counts.entries()).sort(
                (a, b) => b[1] - a[1],
              ),
            };
          }
        }
      }

      if (!best) {
        throw new Error("Could not find a proof window with walkable terrain");
      }

      window.__kithlandsTest.setPlayerTile(best.x, best.y, "World");
      const overlay = document.createElement("div");
      overlay.id = "terrain-contrast-proof";
      overlay.style.position = "fixed";
      overlay.style.left = "8px";
      overlay.style.top = "8px";
      overlay.style.zIndex = "9999";
      overlay.style.background = "rgba(12, 18, 28, 0.88)";
      overlay.style.border = "1px solid rgba(147, 197, 253, 0.65)";
      overlay.style.borderRadius = "8px";
      overlay.style.padding = "10px 12px";
      overlay.style.color = "#e5eefb";
      overlay.style.font = "12px monospace";
      overlay.style.whiteSpace = "pre";
      overlay.textContent = [
        `Terrain proof ${runId}`,
        `tile window unique terrains: ${best.uniqueTiles}`,
        `camera target: (${best.x}, ${best.y})`,
        `water:${best.hasWater} forest:${best.hasForest} sand:${best.hasSand} height:${best.hasHeight}`,
        `top tiles: ${best.tileCounts
          .slice(0, 5)
          .map(([tile, count]) => `${tile}:${count}`)
          .join("  ")}`,
      ].join("\n");
      document.body.appendChild(overlay);
      return best;
    }, RUN_ID);

    await page.waitForTimeout(600);
    await page.screenshot({
      path: screenshotPath(),
      fullPage: true,
    });

    expect(proof.uniqueTiles).toBeGreaterThanOrEqual(5);
  });
});
