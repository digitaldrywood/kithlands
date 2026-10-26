import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const proof = path.resolve(`tmp/public-trails-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test.describe(`${width} public trail`, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 600 });
    test("normal route connects resources, a shop approach and saved harvest deadlines", async ({
      page,
    }) => {
      test.setTimeout(480000);
      page.setDefaultTimeout(15000);
      const errors = [],
        steps = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const capture = (stage) =>
        page.screenshot({ path: path.join(proof, `${width}-${stage}.png`) });
      const state = () =>
        page.evaluate(() => window.__kithlandsTest.gameState());
      const walk = async (target) => {
        while ((await walkNormally(page, "World", target)) === "Battle")
          await fightNormally(page);
      };
      await startNormalRoute(page, 24);
      const overview = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("World");
        const roadTiles = s.tileData.flat().filter((t) => t === 1).length;
        const root = s.spawns.find(
          (p) => p.node_id === s.gameState.settlement_entry_node_id,
        );
        const shop = s.spawns.find(
          (p) => p.building_type === "shop" && p.node_id !== root.node_id,
        );
        const herb = s.gameState.resources
          .filter((n) => n.visual === "herb" && !n.gathered)
          .sort(
            (a, b) =>
              Math.abs(a.x - s.playerX) +
              Math.abs(a.y - s.playerY) -
              Math.abs(b.x - s.playerX) -
              Math.abs(b.y - s.playerY),
          )[0];
        return { roadTiles, root, shop, herb };
      });
      expect(overview.roadTiles).toBeGreaterThan(100);
      const roadJoin = await page.evaluate(async () => {
        const s = window.__normalRouteGame.scene.getScene("World");
        const { buildTerrainRenderPlan } =
          await import("/src/scenes/terrainAutotile.js");
        const { meadowGroundPlan } =
          await import("/src/scenes/meadowPresentation.js");
        for (let y = 0; y < s.mapH - 1; y++)
          for (let x = 0; x < s.mapW - 1; x++) {
            if (
              ![
                s.tileData[y][x],
                s.tileData[y][x + 1],
                s.tileData[y + 1][x],
                s.tileData[y + 1][x + 1],
              ].every((t) => t === 1)
            )
              continue;
            const plan = meadowGroundPlan(
              s,
              buildTerrainRenderPlan(s.tileData, x, y),
              x,
              y,
            );
            const tile = s.tileSprites.list.find(
              (t) => t.x === x * 32 && t.y === y * 32,
            );
            const pixel = (image) => [
              ...image.getContext("2d").getImageData(15, 15, 1, 1).data,
            ];
            return {
              actual: pixel(tile.texture.getSourceImage()),
              expected: pixel(
                s.textures.get(plan.overlay.key).getSourceImage(),
              ),
            };
          }
        throw Error("No shared road join in fixture");
      });
      expect(roadJoin.actual).toEqual(roadJoin.expected);
      expect(overview.shop).toBeTruthy();
      await capture("arrival");
      await walk(overview.herb);
      await page
        .getByRole("button", {
          name: `Gather — ${overview.herb.name}`,
          exact: true,
        })
        [width < 600 ? "tap" : "click"]();
      await expect
        .poll(
          async () =>
            (await state()).resources.find((n) => n.id === overview.herb.id)
              .gathered,
        )
        .toBe(true);
      const deadline = (await state()).resources.find(
        (n) => n.id === overview.herb.id,
      ).ready_at;
      expect(deadline).toBeGreaterThan(0);
      await capture("gathered");
      await page
        .getByRole("button", { name: "Menu", exact: true })
        [width < 600 ? "tap" : "click"]();
      await page
        .getByRole("button", { name: /Crafting/i })
        [width < 600 ? "tap" : "click"]();
      const craft = page.getByRole("dialog", { name: "Crafting", exact: true });
      await craft
        .getByRole("button", { name: "Brew Potion", exact: true })
        [width < 600 ? "tap" : "click"]();
      await craft.locator(".craft-confirm")[width < 600 ? "tap" : "click"]();
      await expect(craft.getByRole("status")).toContainText(
        "Brew Potion complete",
      );
      await capture("crafted-potion");
      await craft
        .getByRole("button", { name: /^Close/ })
        [width < 600 ? "tap" : "click"]();
      await page
        .getByRole("dialog", { name: "Your party", exact: true })
        .getByRole("banner")
        .getByRole("button", { name: "Back to game", exact: true })
        [width < 600 ? "tap" : "click"]();
      const start = { x: overview.root.x, y: overview.root.y + 2 };
      await walk(start);
      const route = await page.evaluate(
        ({ start, shop }) => {
          const s = window.__normalRouteGame.scene.getScene("World"),
            goal = { x: shop.x, y: shop.y + 2 };
          const id = (p) => `${p.x},${p.y}`,
            queue = [start],
            prev = new Map([[id(start), null]]);
          for (let i = 0; i < queue.length && !prev.has(id(goal)); i++)
            for (const [dx, dy] of [
              [1, 0],
              [0, 1],
              [-1, 0],
              [0, -1],
            ]) {
              const n = { x: queue[i].x + dx, y: queue[i].y + dy };
              if (prev.has(id(n)) || ![1, 18].includes(s.tileData[n.y]?.[n.x]))
                continue;
              prev.set(id(n), queue[i]);
              queue.push(n);
            }
          if (!prev.has(id(goal)))
            throw Error("Shop has no connected public path");
          const result = [];
          for (let p = goal; p; p = prev.get(id(p))) result.unshift(p);
          return result.slice(1);
        },
        { start, shop: overview.shop },
      );
      expect(route.length).toBeGreaterThan(10);
      await capture("trail-start");
      for (const [i, next] of route.entries()) {
        const current = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("World");
          return { x: s.playerX, y: s.playerY };
        });
        const key =
          next.x > current.x
            ? "ArrowRight"
            : next.x < current.x
              ? "ArrowLeft"
              : next.y > current.y
                ? "ArrowDown"
                : "ArrowUp";
        await page.keyboard.down(key);
        try {
          await page.waitForFunction((next) => {
            const s = window.__normalRouteGame.scene.getScene("World");
            return (
              (s.playerX === next.x && s.playerY === next.y) ||
              window.__kithlandsTest.activeSceneKey() === "Battle"
            );
          }, next);
        } finally {
          await page.keyboard.up(key);
        }
        await page.waitForFunction(
          () =>
            window.__kithlandsTest.activeSceneKey() === "Battle" ||
            !window.__normalRouteGame.scene.getScene("World").animating,
        );
        if (
          (await page.evaluate(() =>
            window.__kithlandsTest.activeSceneKey(),
          )) === "Battle"
        )
          await fightNormally(page);
        const actual = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("World");
          return {
            x: s.playerX,
            y: s.playerY,
            tile: s.tileData[s.playerY][s.playerX],
          };
        });
        expect({ x: actual.x, y: actual.y }).toEqual(next);
        expect([1, 18]).toContain(actual.tile);
        steps.push(actual);
        if (i === Math.floor(route.length / 2)) await capture("trail-middle");
      }
      await expect(
        page.getByRole("button", {
          name: new RegExp(`^(Shop|Enter) — ${overview.shop.name}`),
        }),
      ).toBeVisible();
      await capture("shop-approach");
      const before = await state();
      const tiles = JSON.stringify(before.tilemap.tiles);
      const resources = before.resources.map(
        ({ id, x, y, gathered, ready_at }) => ({
          id,
          x,
          y,
          gathered,
          ready_at,
        }),
      );
      await page
        .getByRole("button", { name: "Menu", exact: true })
        [width < 600 ? "tap" : "click"]();
      await page
        .getByRole("button", { name: "Exit to main menu", exact: true })
        [width < 600 ? "tap" : "click"]();
      await page
        .getByRole("button", { name: "Save and exit", exact: true })
        [width < 600 ? "tap" : "click"]();
      await page
        .getByRole("button", { name: /^Continue Load/ })
        [width < 600 ? "tap" : "click"]();
      await page
        .getByRole("button", { name: /^Most recent adventure/ })
        [width < 600 ? "tap" : "click"]();
      await routeReady(page, "World");
      const loaded = await state();
      expect(JSON.stringify(loaded.tilemap.tiles)).toBe(tiles);
      expect(loaded.world_checkpoint).toEqual(before.world_checkpoint);
      expect(loaded.materials).toEqual(before.materials);
      expect(loaded.items).toEqual(before.items);
      expect(
        loaded.resources.map(({ id, x, y, gathered, ready_at }) => ({
          id,
          x,
          y,
          gathered,
          ready_at,
        })),
      ).toEqual(resources);
      expect(
        loaded.resources.find((n) => n.id === overview.herb.id).ready_at,
      ).toBe(deadline);
      await capture("loaded");
      expect(errors).toEqual([]);
      writeFileSync(
        path.join(proof, `${width}-audit.json`),
        JSON.stringify({ overview, steps, deadline, errors }, null, 2),
      );
    });
  });
}
