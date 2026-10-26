import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startNormalRoute } from "./helpers/normal-route.js";
import { findStockRow } from "./helpers/shop-stock.js";

const content = JSON.parse(
  readFileSync(new URL("../../shared/items.json", import.meta.url)),
);
const weapons = content.weapons.filter((item) =>
  item.icon_key?.startsWith("weapons/catalog/"),
);
const representatives = new Set([
  "short_sword",
  "iron_dagger",
  "iron_axe",
  "wooden_staff",
  "short_bow",
  "war_hammer",
]);
const proof = path.resolve(`tmp/weapon-catalog-art-${Date.now()}`);
mkdirSync(proof, { recursive: true });

for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test.describe(`${width} weapon catalog artwork`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390 });
    test("all weapon icons survive owned gear and real equips; offered stock uses the same art", async ({
      page,
    }) => {
      test.setTimeout(240000);
      expect(weapons).toHaveLength(33);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (
          response.url().includes("/sprites/items/") &&
          response.status() >= 400
        )
          errors.push(`Art HTTP${response.status()}: ${response.url()}`);
      });
      await startNormalRoute(page, 24);
      await page.evaluate(() =>
        window.__kithlandsTest.setPartyLevels(
          [0, 1, 2, 3].map((slot) => ({ slot, level: 25 })),
          "World",
        ),
      );
      const grants = {};
      for (const item of weapons) {
        grants[item.id] = await page.evaluate(async (id) => {
          const b = window.__kithlandsTest;
          const before = new Set(
            b.gameState("World").items.map((item) => item.instance_id),
          );
          const result = await b.debugGiveItem(id, 1, "World");
          if (result.error) throw Error(result.error);
          const added = b
            .gameState("World")
            .items.filter(
              (item) => item.instance_id && !before.has(item.instance_id),
            );
          if (added.length !== 1) throw Error(`Expected one ${id}`);
          return added[0];
        }, item.id);
      }
      const choose = (node) => (width === 390 ? node.tap() : node.click());
      await page.keyboard.press("m");
      await choose(page.getByRole("button", { name: /^Character/i }));
      const character = page.getByRole("dialog", {
        name: "Character",
        exact: true,
      });
      let partyIndex = 0;
      const verify = async (image, item) => {
        await expect(image).toHaveAttribute(
          "src",
          `/sprites/items/${item.icon_key}`,
        );
        await expect
          .poll(() =>
            image.evaluate(
              (img) =>
                img.complete &&
                img.naturalWidth === 64 &&
                img.naturalHeight === 64,
            ),
          )
          .toBe(true);
        await image.scrollIntoViewIfNeeded();
        await expect(image).toBeVisible();
      };
      const equipped = [];
      for (const item of weapons) {
        const target =
          item.type === "staff"
            ? 1
            : ["bow", "dagger"].includes(item.type)
              ? 2
              : 0;
        while (partyIndex !== target) {
          await expect(character.locator(".equipment-character")).toHaveText(
            ["Hero", "Sparks", "Shade", "Willow"][partyIndex],
          );
          await choose(
            character.getByRole("button", {
              name: "Next character",
              exact: true,
            }),
          );
          partyIndex = (partyIndex + 1) % 4;
          await expect(character.locator(".equipment-character")).toHaveText(
            ["Hero", "Sparks", "Shade", "Willow"][partyIndex],
          );
        }
        await choose(character.locator('[data-slot-id="main_hand"]'));
        const row = character.locator(
          `.equipment-item-row[data-item-key="instance:${grants[item.id].instance_id}"]`,
        );
        await choose(row);
        await verify(row.locator("img.equipment-item-art"), item);
        expect(grants[item.id].icon_key).toBe(item.icon_key);
        if (width === 1440)
          await row.screenshot({
            path: path.join(proof, `owned-${item.id}.png`),
          });
        const response = page.waitForResponse(
          (r) => r.url().endsWith("/equip") && r.request().method() === "POST",
        );
        await choose(
          character.getByRole("button", {
            name: "Equip in Weapon",
            exact: true,
          }),
        );
        const result = await (await response).json();
        expect(result.error).toBeUndefined();
        equipped.push({
          id: item.id,
          instance: grants[item.id].instance_id,
          partyIndex,
          icon_key: item.icon_key,
        });
        await choose(
          character.getByRole("button", {
            name: "Close gear drawer",
            exact: true,
          }),
        );
        await verify(
          character.locator(
            '[data-slot-id="main_hand"] img.equipment-item-art',
          ),
          item,
        );
        if (representatives.has(item.id))
          await page.screenshot({
            path: path.join(proof, `${width}-equipped-${item.id}.png`),
          });
      }
      await choose(
        character.getByRole("button", { name: "Close equipment", exact: true }),
      );
      const catalog = await page.evaluate(async () => {
        const api = await import("/src/api.js"),
          b = window.__kithlandsTest;
        let gs = b.gameState("World");
        gs = await api.transitionLocation(
          gs.id,
          "enter-settlement",
          gs.settlement_entry_node_id,
        );
        if (gs.error) throw Error(gs.error);
        const door = gs.settlement_map.layers
          .flatMap((layer) => layer.objects || [])
          .find((object) =>
            object.properties?.some(
              (p) => p.name === "building_type" && p.value === "shop",
            ),
          );
        if (!door) throw Error("No merchant entrance");
        gs = await api.transitionLocation(gs.id, door.name);
        if (gs.error) throw Error(gs.error);
        b.startScene("Town", {
          gameState: gs,
          spawn: gs.current_location.interior,
        });
        await b.waitForSceneReady("Town");
        const s = window.__normalRouteGame.scene.getScene("Town"),
          grid = s.tileData || s.tiles,
          merchant = s.npcs.find((n) => n.isProprietor);
        if (!merchant) throw Error("No proprietor");
        for (let y = 0; y < grid.length; y++)
          for (let x = 0; x < grid[y].length; x++) {
            const distance = (n) => Math.abs(x - n.x) + Math.abs(y - n.y);
            if (
              !s.canWalkTile(grid[y][x]) ||
              distance(merchant) > 2 ||
              s.npcs.some(
                (n) => n !== merchant && distance(n) <= distance(merchant),
              ) ||
              s.npcs.some((n) => n.x === x && n.y === y) ||
              (s.chests || []).some((n) => distance(n) <= 1) ||
              (s.hiddenItems || []).some(
                (n) => Math.abs(x - n.tileX) + Math.abs(y - n.tileY) <= 1,
              )
            )
              continue;
            b.teleportTownPlayer(x, y);
            return api.getShop(gs.id, gs.current_location.map_id);
          }
        throw Error("No clear interaction tile");
      });
      await page.waitForFunction(() => {
        const s = window.__normalRouteGame.scene.getScene("Town");
        return s.npcs[s.nearNpcIndex]?.isProprietor;
      });
      await page.evaluate(() => window.__kithlandsTest.interact("Town"));
      const shop = page.locator(".kith-shop");
      await expect(shop).toBeVisible();
      const offered = weapons.filter((item) =>
        catalog.shop_items.some((stock) => stock.id === item.id),
      );
      expect(offered.length).toBeGreaterThan(8);
      const pages = new Set();
      for (const item of offered) {
        expect(
          catalog.shop_items.find((stock) => stock.id === item.id).icon_key,
        ).toBe(item.icon_key);
        const row = await findStockRow(page, shop, item.name);
        await verify(row.locator("img"), item);
        const names = await shop.locator(".shop-stock-name").allTextContents();
        const pageKey = names.join("|");
        if (!pages.has(pageKey)) {
          pages.add(pageKey);
          await page.screenshot({
            path: path.join(proof, `${width}-stock-${pages.size}.png`),
          });
        }
        if (["short_bow", "war_hammer", "steel_dagger"].includes(item.id)) {
          await choose(row);
          await verify(shop.locator(".shop-preview img"), item);
          await page.screenshot({
            path: path.join(proof, `${width}-preview-${item.id}.png`),
          });
          if (width <= 620)
            await choose(
              shop.getByRole("button", { name: "Back to stock", exact: true }),
            );
        }
      }
      expect(errors).toEqual([]);
      writeFileSync(
        path.join(proof, `${width}-audit.json`),
        JSON.stringify(
          {
            grants,
            equipped,
            catalog,
            offered: offered.map((item) => item.id),
            errors,
          },
          null,
          2,
        ),
      );
      await choose(
        shop.getByRole("button", { name: "Leave Shop", exact: true }),
      );
      await expect(shop).toHaveCount(0);
    });
  });
}
