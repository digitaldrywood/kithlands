import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { findStockRow } from "./helpers/shop-stock.js";
import {
  startNormalRoute,
  walkNormally,
  routeReady,
  openNormalMerchant,
} from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/shop-responsive-${Date.now()}`);
mkdirSync(proof, { recursive: true });

async function visit(page) {
  // Keep a campaign fight from replacing this catalog-layout fixture.
  await startNormalRoute(page, 4);
  const home = await page.evaluate(() => {
    const s = window.__normalRouteGame.scene.getScene("World");
    return s.spawns.find(
      (spawn) => spawn.node_id === s.gameState.settlement_entry_node_id,
    );
  });
  await walkNormally(page, "World", home);
  await page.getByRole("button", { name: /^Enter —/ }).click();
  await routeReady(page, "Settlement");
  await walkNormally(page, "Settlement", { x: 18, y: 9 });
  await page.keyboard.press("Enter");
  await routeReady(page, "Town");
  await openNormalMerchant(page);
}

for (const width of [1440, 800, 610, 390]) {
  test.describe(`responsive shop ${width}`, () => {
    const height = width === 800 ? 600 : width === 1440 ? 900 : 844;
    const mobile = width <= 620;
    test.use({ viewport: { width, height }, hasTouch: mobile });
    test("equipment explains class restrictions without weapon wording", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await visit(page);
      const shop = page.locator(".kith-shop");
      const activate = (locator) => (mobile ? locator.tap() : locator.click());
      await activate(shop.getByRole("button", { name: /^Armor/ }));
      await activate(await findStockRow(page, shop, "Cloth Robe"));
      await activate(shop.getByRole("button", { name: /^Hero · Warrior/ }));
      await expect(shop.locator(".shop-comparison .shop-error")).toHaveText(
        "Warrior cannot equip this armor.",
      );
      await expect(shop.locator(".shop-member").first()).toContainText(
        "Class restricted",
      );
      await expect(
        shop.getByRole("button", { name: /^Buy for Hero/ }),
      ).toBeDisabled();
      await page.screenshot({
        path: path.join(proof, `${width}-armor-class-restriction.png`),
      });
      await activate(shop.getByRole("button", { name: /^Willow · Mender/ }));
      await expect(shop.locator(".shop-member").last()).toContainText(
        "Can equip",
      );
      await expect(shop.locator(".shop-comparison .shop-error")).toHaveCount(0);
      await page.screenshot({
        path: path.join(proof, `${width}-armor-compatible.png`),
      });
      await activate(shop.getByRole("button", { name: /^Leave Shop/ }));
      await expect(shop).toHaveCount(0);
    });

    test("ordinary item effects and usage are visible before buying", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await visit(page);
      const shop = page.locator(".kith-shop");
      const activate = (locator) => (mobile ? locator.tap() : locator.click());
      await activate(shop.getByRole("button", { name: /^Items/ }));
      for (const [name, effect] of [
        ["Hi-Potion", "120 HP"],
        ["Potion", "30 HP"],
        ["Ether", "20 MP"],
        ["Hi-Ether", "50 MP"],
        ["X-Ether", "150 MP"],
        ["Antidote", "Poison"],
        ["Echo Herb", "Silence"],
        ["Soft", "Stone"],
        ["Phoenix Down", "1 HP"],
        ["Tent", "50%"],
      ]) {
        await activate(await findStockRow(page, shop, name));
        const preview = shop.locator(".shop-preview");
        await expect(preview.locator(".shop-description")).toContainText(
          effect,
        );
        await expect(preview.locator(".shop-use-context")).toHaveText(
          name === "Tent"
            ? "Use while exploring; cannot be used in battle."
            : "Use in battle or while exploring.",
        );
        if (name === "Hi-Potion") {
          await expect(preview).toContainText("cannot revive");
          await page.screenshot({
            path: path.join(proof, `${width}-hi-potion-details.png`),
          });
        }
        if (name === "Tent")
          await page.screenshot({
            path: path.join(proof, `${width}-tent-details.png`),
          });
        if (mobile)
          await activate(shop.getByRole("button", { name: /^Back to stock/ }));
      }
      await activate(shop.getByRole("button", { name: /^Supplies/ }));
      for (const effect of [
        "smelting fuel",
        "sword grip",
        "removes impurities",
      ]) {
        const names = {
          "smelting fuel": "Smithing charcoal",
          "sword grip": "Leather grip wrap",
          "removes impurities": "Forge flux",
        };
        await activate(await findStockRow(page, shop, names[effect]));
        await expect(shop.locator(".shop-description")).toContainText(effect);
        await expect(shop.locator(".shop-use-context")).toContainText(
          "Crafting in the party menu",
        );
        if (effect === "removes impurities")
          await page.screenshot({
            path: path.join(proof, `${width}-supply-details.png`),
          });
        if (mobile)
          await activate(shop.getByRole("button", { name: /^Back to stock/ }));
      }
      await activate(shop.getByRole("button", { name: /^Items/ }));
      await activate(await findStockRow(page, shop, "Strange Coin"));
      await expect(shop.locator(".shop-description")).toContainText(
        "unknown origin",
      );
      await expect(shop.locator(".shop-use-context")).toHaveCount(0);
      await expect(shop.locator(".shop-gold")).toHaveText("Gold: 100");
      await activate(shop.getByRole("button", { name: /^Leave Shop/ }));
      await expect(shop).toHaveCount(0);
    });
    test("readable stock, comparison, guarded purchase and clean exit", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await visit(page);
      const shop = page.locator(".kith-shop");
      const activate = async (locator) =>
        mobile ? locator.tap() : locator.click();
      await expect(shop).toBeVisible();
      await expect(shop.locator(".shop-gold")).toHaveText("Gold: 100");
      const geometry = await shop.evaluate((root) => ({
        overflow: root.scrollWidth > window.innerWidth,
        controls: [...root.querySelectorAll("button")]
          .filter((b) => b.getClientRects().length)
          .map((b) => ({
            height: b.getBoundingClientRect().height,
            font: parseFloat(getComputedStyle(b).fontSize),
          })),
      }));
      expect(geometry.overflow).toBe(false);
      expect(
        geometry.controls.every((b) => b.height >= 46 && b.font >= 15),
      ).toBe(true);
      await page.screenshot({ path: path.join(proof, `${width}-stock.png`) });
      if (mobile) {
        await activate(shop.getByRole("button", { name: /^Armor/ }));
        await activate(await findStockRow(page, shop, "Leather Armor"));
      } else {
        await shop.getByRole("button", { name: /^Armor/ }).focus();
        await page.keyboard.press("Enter");
        await (await findStockRow(page, shop, "Leather Armor")).focus();
        await page.keyboard.press("Space");
      }
      await expect(shop.locator(".shop-preview")).toContainText(
        "Preview: Leather Armor",
      );
      await expect(shop.locator(".shop-comparison")).toContainText("Absorb:");
      const comparison = shop.locator('.shop-member[aria-pressed="true"]');
      await expect(comparison).toContainText("Hero");
      if (mobile) {
        const visible = await shop
          .locator(".shop-stat-delta")
          .last()
          .evaluate((row) => {
            const bounds = row.getBoundingClientRect();
            const pane = row.closest(".shop-preview").getBoundingClientRect();
            return bounds.bottom <= pane.bottom;
          });
        expect(visible, "all comparison deltas visible before buying").toBe(
          true,
        );
      }
      await page.screenshot({ path: path.join(proof, `${width}-compare.png`) });
      // Native keys exercise trapped focus, reverse Tab and sibling arrows.
      if (!mobile) {
        await comparison.focus();
        await page.keyboard.press("ArrowRight");
        await expect(shop.locator(".shop-member").nth(1)).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await expect(comparison).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(shop.locator(":focus")).toHaveCount(1);
      }
      let buys = 0;
      await page.route("**/buy", async (route) => {
        buys++;
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 450));
        await route.fulfill({ response });
      });
      const receipt = page.waitForResponse((r) => r.url().endsWith("/buy"));
      const equip = shop.getByRole("button", { name: /^Buy for Hero/ });
      const shortcut = await equip.getAttribute("aria-keyshortcuts");
      if (mobile) {
        const box = await equip.boundingBox();
        await page.touchscreen.tap(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
        await page.touchscreen.tap(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
      } else {
        await page.keyboard.press(shortcut);
        await page.keyboard.press(shortcut);
      }
      const purchased = await (await receipt).json();
      expect(purchased.error).toBeUndefined();
      expect(purchased.gold).toBe(75);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__kithlandsTest.gameState("Town").equipment[0].armor_name,
          ),
        )
        .toBe("Leather Armor");
      await expect(shop).toHaveAttribute("aria-busy", "false");
      expect(buys).toBe(1);
      await expect(shop.locator(".shop-status")).toHaveText(
        "Hero equipped Leather Armor!",
      );
      await page.screenshot({
        path: path.join(proof, `${width}-equipped.png`),
      });
      if (mobile) {
        await page.keyboard.press("Escape");
        await expect(shop.locator(".shop-stock")).toBeVisible();
        await page.screenshot({
          path: path.join(proof, `${width}-back-to-stock.png`),
        });
      }
      await page.keyboard.press("Escape");
      await expect(shop).toHaveCount(0);
      // Walk back around the room's furniture after closing the shop.
      await walkNormally(page, "Town", { x: 7, y: 10 });
      expect(
        await page.evaluate(
          () => window.__normalRouteGame.scene.getScene("Town").playerY,
        ),
      ).toBe(10);
      expect(
        await page.evaluate(
          () => window.__kithlandsTest.sceneFlags("Town").modalLocks,
        ),
      ).not.toContain("shop");
      await page.screenshot({
        path: path.join(proof, `${width}-closed-movement.png`),
      });
    });
  });
}
