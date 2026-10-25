import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const proof = new URL(`../tmp/canonical-art-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 610, 390]) {
  test(`canonical swords and gem artwork in actual screens at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()) + "\nwindow.__artGame=game;",
      });
    });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.evaluate(() =>
      window.__kithlandsTest.setPartyLevels(
        [0, 1, 2, 3].map((slot) => ({ slot, level: 25 })),
        "World",
      ),
    );
    for (const id of [
      "steel_sword",
      "mythril_sword",
      "ember_shard",
      "ember_gem",
      "ember_crystal",
      "ward_shard",
      "ward_gem",
      "ward_crystal",
    ]) {
      const result = await page.evaluate(
        (id) => window.__kithlandsTest.debugGiveItem(id, 1, "World"),
        id,
      );
      expect(result.error).toBeFalsy();
    }
    // Loot sockets are randomized. Explicitly choose a socketed Mythril instance
    // for the socket-art check rather than assuming every rolled sword has one.
    let swordIDs;
    for (let attempt = 0; attempt < 12; attempt++) {
      swordIDs = await page.evaluate(() => {
        const items = window.__kithlandsTest.gameState("World").items;
        return Object.fromEntries(
          ["steel-sword", "mythril-sword"].map((key) => [
            key,
            items.find(
              (i) =>
                i.icon_key === `crafted/${key}.svg` &&
                (key !== "mythril-sword" || i.sockets?.length),
            )?.instance_id,
          ]),
        );
      });
      if (swordIDs["mythril-sword"]) break;
      await page.evaluate(() =>
        window.__kithlandsTest.debugGiveItem("mythril_sword", 1, "World"),
      );
    }
    expect(swordIDs["mythril-sword"]).toBeTruthy();
    await page.keyboard.press("m");
    await page.getByRole("button", { name: /Crafting/i }).click();
    const crafting = page.getByRole("dialog", {
      name: "Crafting",
      exact: true,
    });
    for (const [name, key] of [
      ["Forge Steel Sword", "steel-sword"],
      ["Forge Runic Mythril Sword", "mythril-sword"],
    ]) {
      await crafting.getByRole("button", { name, exact: true }).click();
      const image = crafting.locator(".craft-preview img");
      await expect(image).toHaveAttribute(
        "src",
        `/sprites/items/crafted/${key}.svg`,
      );
      await expect
        .poll(() =>
          image.evaluate((img) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true);
      await page.screenshot({
        path: new URL(`${width}-craft-${key}.png`, proof).pathname,
      });
    }
    await crafting.getByRole("button", { name: /Close/ }).click();
    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
    );
    const character = page.getByRole("dialog", { name: "Character" });
    for (const [name, key] of [
      ["Steel Sword", "steel-sword"],
      ["Mythril Sword", "mythril-sword"],
    ]) {
      await page.locator('[data-slot-id="main_hand"]').click();
      const row = page.locator(
        `.equipment-item-row[data-item-key="instance:${swordIDs[key]}"]`,
      );
      await row.click();
      await expect(row.locator("img")).toHaveAttribute(
        "src",
        `/sprites/items/crafted/${key}.svg`,
      );
      await page.screenshot({
        path: new URL(`${width}-inventory-${key}.png`, proof).pathname,
      });
      await page
        .getByRole("button", { name: "Equip in Weapon", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Close gear drawer", exact: true })
        .click();
      const image = page.locator(
        '[data-slot-id="main_hand"] img.equipment-item-art',
      );
      await expect(image).toHaveAttribute(
        "src",
        `/sprites/items/crafted/${key}.svg`,
      );
      await expect
        .poll(() =>
          image.evaluate((img) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true);
      await image.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: new URL(`${width}-loadout-${key}.png`, proof).pathname,
      });
    }
    await page.locator('[data-slot-id="main_hand"]').click();
    await page.getByRole("button", { name: "Socket", exact: true }).click();
    const gems = page.getByRole("dialog", { name: "Gem Workshop" });
    // Both bag and transmutation use the authoritative gem art.
    const state = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World"),
    );
    for (const gem of state.gems)
      expect(gem.icon_key).toBe(`gems/${gem.id.replaceAll("_", "-")}.svg`);
    const imgs = gems.locator(".gem-art img");
    await expect.poll(() => imgs.count()).toBeGreaterThan(1);
    await expect
      .poll(() =>
        imgs.evaluateAll((nodes) =>
          nodes.every((n) => n.complete && n.naturalWidth > 0),
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: new URL(`${width}-gem-bag.png`, proof).pathname,
    });
    await gems
      .getByRole("navigation", { name: "Gems pages" })
      .getByRole("button", { name: "Next", exact: true })
      .click();
    await expect
      .poll(() =>
        gems
          .locator(".gem-art img")
          .evaluateAll((nodes) =>
            nodes.every((n) => n.complete && n.naturalWidth > 0),
          ),
      )
      .toBe(true);
    await page.screenshot({
      path: new URL(`${width}-gem-bag-page2.png`, proof).pathname,
    });
    await gems
      .getByRole("navigation", { name: "Gems pages" })
      .getByRole("button", { name: "Previous", exact: true })
      .click();
    await gems.locator('[data-gem-id="ember_crystal"]').click();
    await gems.locator('[data-focus-key="confirm-socket"]').click();
    await expect(gems.locator('[data-socket-index="0"] img')).toHaveAttribute(
      "src",
      "/sprites/items/gems/ember-crystal.svg",
    );
    await page.screenshot({
      path: new URL(`${width}-socketed-gem.png`, proof).pathname,
    });
    await gems.getByRole("button", { name: /Transmute/ }).click();
    await page.screenshot({
      path: new URL(`${width}-gem-transmute.png`, proof).pathname,
    });
    await gems.getByRole("button", { name: /Close/ }).click();
    await character
      .getByRole("button", { name: "Close equipment", exact: true })
      .click();
    // Enter a real settlement shop through the server location flow.
    const catalog = await page.evaluate(async () => {
      const api = await import("/src/api.js");
      let gs = window.__kithlandsTest.gameState("World");
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
      gs = await api.transitionLocation(gs.id, door.name);
      if (gs.error) throw Error(gs.error);
      window.__kithlandsTest.startScene("Town", {
        gameState: gs,
        spawn: gs.current_location.interior,
      });
      return api.getShop(gs.id, gs.current_location.map_id);
    });
    await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("Town"));
    const npc = await page.evaluate(
      () => window.__kithlandsTest.townNpcPositions("Town")[0],
    );
    await page.evaluate(
      ({ x, y }) => window.__kithlandsTest.teleportTownPlayer(x, y + 1),
      npc,
    );
    await page.evaluate(() => window.__kithlandsTest.interact("Town"));
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((t) => t.text === "Leave Shop"),
    );
    expect(catalog.shop_items.some((i) => i.id === "steel_sword")).toBe(true);
    const steelIcon = page.locator(
      '.shop-stock img[src="/sprites/items/crafted/steel-sword.svg"]',
    );
    await steelIcon.scrollIntoViewIfNeeded();
    await expect(steelIcon).toBeVisible();
    const size = await steelIcon.evaluate((img) => [
      img.naturalWidth,
      img.naturalHeight,
    ]);
    expect(size).toEqual([64, 64]);
    for (const offer of catalog.shop_items.filter(
      (i) => i.id === "steel_sword" || i.id === "mythril_sword",
    ))
      expect(offer.icon_key).toBe(
        `crafted/${offer.id.replaceAll("_", "-")}.svg`,
      );
    await page.screenshot({
      path: new URL(`${width}-shop.png`, proof).pathname,
    });
  });
}
