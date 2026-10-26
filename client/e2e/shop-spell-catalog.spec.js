import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  walkNormally,
  routeReady,
  openNormalMerchant,
} from "./helpers/normal-route.js";
import { findStockRow } from "./helpers/shop-stock.js";

const proof = path.resolve(`tmp/shop-spell-catalog-${Date.now()}`);
mkdirSync(proof, { recursive: true });

for (const [width, height] of [
  [1440, 900],
  [858, 842],
  [800, 600],
  [610, 844],
  [390, 844],
]) {
  test.describe(`spell catalog ${width}`, () => {
    const mobile = width <= 620;
    test.use({ viewport: { width, height }, hasTouch: mobile });
    test("stable compact pages, keyboard and authoritative learning gates", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await startNormalRoute(page, 4);
      // Isolated eligibility fixture: the leader opens tier-three merchant stock,
      // but Willow remains level one. This is not progression proof.
      await page.evaluate(async () => {
        await window.__kithlandsTest.setPartyLevels(
          [
            { slot: 0, level: 11 },
            { slot: 1, level: 11 },
            { slot: 2, level: 11 },
          ],
          "World",
        );
        await window.__kithlandsTest.setGold(600, "World");
      });
      const home = await page.evaluate(() => {
        const scene = window.__normalRouteGame.scene.getScene("World");
        return scene.spawns.find(
          (s) => s.node_id === scene.gameState.settlement_entry_node_id,
        );
      });
      await walkNormally(page, "World", home);
      await page.getByRole("button", { name: /^Enter —/ }).click();
      await routeReady(page, "Settlement");
      await walkNormally(page, "Settlement", { x: 18, y: 9 });
      await page.keyboard.press("Enter");
      await routeReady(page, "Town");
      await openNormalMerchant(page);
      const shop = page.locator(".kith-shop");
      const activate = (node) => (mobile ? node.tap() : node.click());
      await activate(shop.getByRole("button", { name: /^Spells/ }));
      if (!mobile)
        await expect(
          shop.getByRole("button", { name: /^Spells/ }),
        ).toBeFocused();
      await expect(shop.locator(".shop-stock-name").first()).toContainText(
        "Tier",
      );
      const initial = await shop
        .locator(".shop-stock-row")
        .first()
        .boundingBox();
      const initialNames = await shop
        .locator(".shop-stock-name")
        .allTextContents();
      for (let i = 0; i < 3; i++) {
        const row = shop.locator(".shop-stock-row").nth(i);
        await activate(row);
        if (mobile)
          await activate(shop.getByRole("button", { name: /^Back to stock/ }));
        else {
          await expect(row).toBeFocused();
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("Enter");
          await page.keyboard.press("Tab");
        }
        expect(
          await shop.locator(".shop-stock-name").allTextContents(),
        ).toEqual(initialNames);
        const after = await shop
          .locator(".shop-stock-row")
          .first()
          .boundingBox();
        expect(after.y).toBe(initial.y);
      }
      const geometry = await shop.locator(".shop-stock").evaluate((stock) => ({
        overflow: stock.scrollHeight - stock.clientHeight,
        rows: [...stock.querySelectorAll(".shop-stock-row")].map((row) => {
          const b = row.getBoundingClientRect(),
            p = stock.getBoundingClientRect();
          return {
            height: b.height,
            inside: b.top >= p.top && b.bottom <= p.bottom,
          };
        }),
      }));
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.rows.every((row) => row.height >= 46 && row.inside)).toBe(
        true,
      );
      await page.screenshot({
        path: path.join(proof, `${width}-compact-stable-stock.png`),
      });
      const allNames = [];
      for (let i = 0; i < 30; i++) {
        allNames.push(
          ...(await shop.locator(".shop-stock-name").allTextContents()),
        );
        const next = shop.getByRole("button", { name: /^Next page/ });
        if (await next.isDisabled()) break;
        await activate(next);
      }
      expect(new Set(allNames).size).toBe(allNames.length);
      expect(allNames.length).toBeGreaterThan(initialNames.length);
      const locked = await findStockRow(page, shop, "Cure Poison");
      await activate(locked);
      await expect(shop.locator(".shop-preview")).toContainText("Tier 2");
      await expect(shop.locator(".shop-spell-requirements")).toContainText(
        "not character level",
      );
      await expect(
        shop.getByRole("button", { name: /Willow.*level too low/ }),
      ).toBeDisabled();
      await expect(
        shop.getByRole("button", { name: /^Learn(?: Alt|$)/ }),
      ).toBeDisabled();
      await page.screenshot({
        path: path.join(proof, `${width}-under-level-disabled.png`),
      });
      const rejected = await page.evaluate(async () => {
        const api = await import("/src/api.js");
        const state = window.__kithlandsTest.gameState("Town");
        const node = state.current_location.map_id;
        const stock = await api.getShop(state.id, node);
        const offer = stock.shop_items.find((i) => i.id === "cure_poison");
        const before = await api.getGame(state.id);
        // Adversarial request bypasses the disabled UI to verify Go's gate.
        const result = await api.learnSpell(
          state.id,
          node,
          offer.stock_id,
          "Willow",
        );
        const after = await api.getGame(state.id);
        return {
          result,
          before: { gold: before.gold, party: before.party },
          after: { gold: after.gold, party: after.party },
          catalogNames: stock.shop_items
            .filter((i) => i.type === "spell")
            .map((i) => i.name),
        };
      });
      expect(rejected.result.error).toContain("level too low");
      expect(rejected.result.error).toContain("level 3 required");
      expect(rejected.after).toEqual(rejected.before);
      expect(
        allNames
          .map((n) => n.replace(/(?:black|white) · Tier \d+$/, ""))
          .sort(),
      ).toEqual(rejected.catalogNames.sort());
      if (mobile)
        await activate(shop.getByRole("button", { name: /^Back to stock/ }));
      await activate(await findStockRow(page, shop, "Frost"));
      await expect(
        shop.locator('.shop-member[aria-pressed="true"]'),
      ).toContainText("Sparks");
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/learn") &&
          r.request().postDataJSON()?.char_name === "Sparks",
      );
      if (mobile)
        await shop.getByRole("button", { name: /^Learn(?: Alt|$)/ }).tap();
      else {
        const key = await shop
          .getByRole("button", { name: /^Learn(?: Alt|$)/ })
          .getAttribute("aria-keyshortcuts");
        await page.keyboard.press(key);
      }
      const learned = await (await response).json();
      expect(learned.error).toBeUndefined();
      expect(learned.gold).toBe(500);
      expect(
        learned.party
          .find((m) => m.name === "Sparks")
          .spells.some((s) => s.id === "frost"),
      ).toBe(true);
      await expect(shop.locator(".shop-status")).toHaveText(
        "Sparks learned Frost!",
      );
      await expect(
        shop.getByRole("button", { name: /^Learn(?: Alt|$)/ }),
      ).toBeDisabled();
      await page.screenshot({
        path: path.join(proof, `${width}-eligible-learned.png`),
      });
      writeFileSync(
        path.join(proof, `${width}-audit.json`),
        JSON.stringify(
          {
            geometry,
            allNames,
            rejected,
            learned: { gold: learned.gold, party: learned.party },
          },
          null,
          2,
        ),
      );
      await page.keyboard.press("Escape");
      if (mobile) await page.keyboard.press("Escape");
      await expect(shop).toHaveCount(0);
    });
  });
}
