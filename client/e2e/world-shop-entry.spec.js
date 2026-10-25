import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
  openNormalMerchant,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";
const proof = path.resolve(`tmp/world-shop-entry-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ video: "on" });
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  console.log(
    "world-shop-failure",
    await page.evaluate(() => {
      const key = window.__kithlandsTest.activeSceneKey(),
        s = window.__normalRouteGame.scene.getScene(key);
      return {
        key,
        x: s.playerX,
        y: s.playerY,
        animating: s.animating,
        input: s.input.enabled,
        keyboard: s.input.keyboard.enabled,
        location: s.gameState?.current_location,
        flags: window.__kithlandsTest.sceneFlags(key),
        text: document.body.innerText,
      };
    }),
  );
  await page.screenshot({
    path: info.outputPath(`world-shop-failed-${Date.now()}.png`),
  });
});
for (const width of [1440, 774, 390]) {
  test(`direct world shop sells and returns correctly at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    // Seed 24 retains the crowded household-shop layout from the failing route.
    await startNormalRoute(page, 24);
    const shop = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("World");
      return s.spawns.find(
        (p) =>
          p.building_type === "shop" &&
          p.node_id !== s.gameState.settlement_entry_node_id,
      );
    });
    expect(shop).toBeTruthy();
    expect(shop.interior_template.id).toBe("shop_household_shop_01");
    while ((await walkNormally(page, "World", shop)) === "Battle")
      await fightNormally(page);
    await page.getByRole("button", { name: /^(Shop|Enter) —/ }).click();
    if (
      (await page.evaluate(() => window.__kithlandsTest.activeSceneKey())) ===
      "Battle"
    )
      await fightNormally(page);
    await routeReady(page, "Town");
    const approach = await page.evaluate(() => {
      const s = window.__normalRouteGame.scene.getScene("Town"),
        grid = s.tileData || s.tiles;
      const npc = s.npcs.find((n) => n.isProprietor),
        queue = [{ x: s.playerX, y: s.playerY }],
        seen = new Set();
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i],
          id = `${p.x},${p.y}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const distance = (n) => Math.abs(p.x - n.x) + Math.abs(p.y - n.y);
        if (
          distance(npc) <= 2 &&
          !s.npcs.some((n) => n !== npc && distance(n) <= distance(npc)) &&
          !(s.chests || []).some((n) => distance(n) <= 1) &&
          !(s.hiddenItems || []).some(
            (n) => Math.abs(p.x - n.tileX) + Math.abs(p.y - n.tileY) <= 1,
          )
        )
          return p;
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ]) {
          const n = { x: p.x + dx, y: p.y + dy },
            t = grid[n.y]?.[n.x];
          if (
            Number.isInteger(t) &&
            s.canWalkTile(t) &&
            !s.npcs.some((npc) => npc.x === n.x && npc.y === n.y)
          )
            queue.push(n);
        }
      }
      throw Error("No proprietor route");
    });
    await walkNormally(page, "Town", approach);
    expect(
      await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Town");
        return s.npcs[s.nearNpcIndex]?.isProprietor;
      }),
      "the planned tile selects the proprietor, not a nearby NPC",
    ).toBe(true);
    await openNormalMerchant(page, approach);
    await expect(page.locator(".kith-shop")).toBeVisible();
    await page.screenshot({ path: path.join(proof, `${width}-stock.png`) });
    await expect(page.locator(".shop-status")).not.toHaveText(
      "Stock could not be loaded.",
    );
    await page.getByRole("button", { name: /^Items/ }).click();
    await page.getByRole("button", { name: /^Potion\b/ }).click();
    const before = await page.evaluate(() =>
      window.__kithlandsTest.gameState(),
    );
    await page.locator(".shop-purchase").click();
    await expect(page.locator(".shop-status")).toContainText(
      /Bought|Purchased/i,
    );
    const after = await page.evaluate(() => window.__kithlandsTest.gameState());
    expect(after.gold).toBeLessThan(before.gold);
    expect(after.current_location.kind).toBe("interior");
    expect(after.current_location.interior.node_id).toBe(shop.node_id);
    await page.screenshot({ path: path.join(proof, `${width}-purchased.png`) });
    await page.getByRole("button", { name: /^Leave Shop/ }).click();
    await page.keyboard.press("Escape");
    await routeReady(page, "World");
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.gameState().current_location.world_node_id,
      ),
    ).toBe(shop.node_id);
    await page.screenshot({
      path: path.join(proof, `${width}-returned-world.png`),
    });
  });
}
