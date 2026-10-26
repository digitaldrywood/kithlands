import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const proof = path.resolve(`tmp/weapon-item-art-${Date.now()}`);
mkdirSync(proof, { recursive: true });
const weapons = ["hand_axe", "mythril_axe", "arcane_staff"];
for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["default", 800, 600],
  ["comment-panel", 610, 837],
  ["phone", 390, 844],
]) {
  test.describe(label, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 500 });
    test("canonical axe and staff icons in inventory, loadout and shops", async ({
      page,
    }) => {
      test.setTimeout(120000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (
          response.url().includes("/sprites/items/weapons/") &&
          response.status() >= 400
        )
          errors.push(`art HTTP ${response.status()}: ${response.url()}`);
      });
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__weaponArtGame=game;`,
        });
      });
      await page.goto("/?noEncounters=1");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      await page.evaluate(
        (email) => window.__kithlandsTest.startWizardFromTitle(email),
        `weapon-art-${label}-${Date.now()}@kithlands.dev`,
      );
      await page.evaluate(() =>
        window.__kithlandsTest.startCustomGame({
          town_name: "Cadott, WI",
          use_osm: false,
          people: [],
          places: ["Old Mill", "Market", "School"],
          big_building: "Town Hall",
          difficulty: "normal",
          rng_seed: 24,
          party: [
            { name: "Hero", class_id: "warrior" },
            { name: "Sparks", class_id: "cinder" },
            { name: "Shade", class_id: "rogue" },
            { name: "Willow", class_id: "mender" },
          ],
        }),
      );
      // Advanced visual fixture: shop tiers and item grants are not progression proof.
      await page.evaluate(() =>
        window.__kithlandsTest.setPartyLevels(
          [0, 1, 2, 3].map((slot) => ({ slot, level: 25 })),
          "World",
        ),
      );
      const granted = {};
      for (const id of weapons) {
        granted[id] = await page.evaluate(async (id) => {
          const bridge = window.__kithlandsTest;
          const before = new Set(
            bridge.gameState("World").items.map((i) => i.instance_id),
          );
          const result = await bridge.debugGiveItem(id, 1, "World");
          if (result.error) throw Error(result.error);
          const fresh = bridge
            .gameState("World")
            .items.filter((i) => i.instance_id && !before.has(i.instance_id));
          if (fresh.length !== 1)
            throw Error(`Expected one new ${id} instance, got ${fresh.length}`);
          return fresh[0];
        }, id);
      }
      writeFileSync(
        path.join(proof, `${label}-granted.json`),
        JSON.stringify(granted, null, 2),
      );
      const choose = (target) => target[width < 500 ? "tap" : "click"]();
      if (width < 500)
        await choose(page.getByRole("button", { name: "Menu", exact: true }));
      else await page.keyboard.press("m");
      await choose(page.getByRole("button", { name: /^Character/ }));
      const character = page.getByRole("dialog", {
        name: "Character",
        exact: true,
      });
      await expect(character).toBeVisible();
      const verify = async (image, id) => {
        const url = `/sprites/items/weapons/${id.replaceAll("_", "-")}.svg`;
        await expect(image).toHaveAttribute("src", url);
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
      for (const id of weapons) {
        if (id === "arcane_staff")
          await choose(
            character.getByRole("button", {
              name: "Next character",
              exact: true,
            }),
          );
        await expect(character.locator(".equipment-character")).toHaveText(
          id === "arcane_staff" ? "Sparks" : "Hero",
        );
        await choose(character.locator('[data-slot-id="main_hand"]'));
        const row = character.locator(
          `.equipment-item-row[data-item-key="instance:${granted[id].instance_id}"]`,
        );
        await choose(row);
        await page.screenshot({
          path: path.join(proof, `${label}-inventory-${id}.png`),
        });
        await verify(row.locator("img"), id);
        expect(granted[id].icon_key).toBe(
          `weapons/${id.replaceAll("_", "-")}.svg`,
        );
        await choose(
          character.getByRole("button", {
            name: "Equip in Weapon",
            exact: true,
          }),
        );
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
          id,
        );
        await page.screenshot({
          path: path.join(proof, `${label}-loadout-${id}.png`),
        });
      }
      await choose(
        character.getByRole("button", { name: "Close equipment", exact: true }),
      );
      const catalog = await page.evaluate(async () => {
        const api = await import("/src/api.js"),
          bridge = window.__kithlandsTest;
        let gs = bridge.gameState("World");
        gs = await api.transitionLocation(
          gs.id,
          "enter-settlement",
          gs.settlement_entry_node_id,
        );
        if (gs.error) throw Error(gs.error);
        const door = gs.settlement_map.layers
          .flatMap((l) => l.objects || [])
          .find((o) =>
            o.properties?.some(
              (p) => p.name === "building_type" && p.value === "shop",
            ),
          );
        if (!door) throw Error("No settlement merchant door");
        gs = await api.transitionLocation(gs.id, door.name);
        if (gs.error) throw Error(gs.error);
        bridge.startScene("Town", {
          gameState: gs,
          spawn: gs.current_location.interior,
        });
        await bridge.waitForSceneReady("Town");
        const s = window.__weaponArtGame.scene.getScene("Town"),
          grid = s.tileData || s.tiles;
        const merchant = s.npcs.find((n) => n.isProprietor);
        if (!merchant) throw Error("No shop proprietor");
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
            bridge.teleportTownPlayer(x, y);
            return api.getShop(gs.id, gs.current_location.map_id);
          }
        throw Error("No unambiguous proprietor interaction tile");
      });
      await page.waitForFunction(() => {
        const s = window.__weaponArtGame.scene.getScene("Town");
        return s.npcs[s.nearNpcIndex]?.isProprietor;
      });
      await page.evaluate(() => window.__kithlandsTest.interact("Town"));
      const shop = page.locator(".kith-shop");
      await expect(shop).toBeVisible();
      writeFileSync(
        path.join(proof, `${label}-catalog.json`),
        JSON.stringify(catalog, null, 2),
      );
      // The current normal merchant cap is tier three. Mythril Axe is checked
      // in bag/loadout; do not invent a tier-four offer merely for an art test.
      for (const id of ["hand_axe", "arcane_staff"]) {
        expect(catalog.shop_items.find((i) => i.id === id)?.icon_key).toBe(
          `weapons/${id.replaceAll("_", "-")}.svg`,
        );
        const row = shop.locator(".shop-stock-row").filter({
          has: page.locator(
            `img[src="/sprites/items/weapons/${id.replaceAll("_", "-")}.svg"]`,
          ),
        });
        await verify(row.locator("img"), id);
        await page.screenshot({
          path: path.join(proof, `${label}-stock-${id}.png`),
        });
        await choose(row);
        await verify(shop.locator(".shop-preview img"), id);
        await page.screenshot({
          path: path.join(proof, `${label}-preview-${id}.png`),
        });
        if (width <= 620)
          await choose(
            shop.getByRole("button", { name: "Back to stock", exact: true }),
          );
      }
      expect(errors).toEqual([]);
    });
  });
}
