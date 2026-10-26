import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startNormalRoute, walkNormally } from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/menu-choice-navigation-${Date.now()}`);
mkdirSync(proof, { recursive: true });
async function snapshot(page) {
  return page.evaluate(() => {
    const scene = window.__normalRouteGame.scene.getScene("World");
    const gs = scene.gameState;
    return {
      gold: gs.gold,
      potions: gs.potions,
      materials: gs.materials,
      items: gs.items,
      equipment: gs.equipment,
      party: gs.party,
      x: scene.playerX,
      y: scene.playerY,
    };
  });
}
async function verticalBrowse(page, choices) {
  const below = await choices.evaluateAll((nodes) => {
    const first = nodes[0].getBoundingClientRect();
    return nodes.findIndex((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.top >= first.bottom - 1 && Math.abs(rect.left - first.left) < 4
      );
    });
  });
  await page.keyboard.press("ArrowDown");
  await expect(choices.nth(below < 0 ? 0 : below)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(choices.first()).toBeFocused();
}
test.afterEach(async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath(`last-${Date.now()}.png`) });
});
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test.describe(`${width} menu choice navigation`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390 });
    test("recipe arrows browse without crafting until explicit confirmation", async ({
      page,
    }) => {
      test.setTimeout(90000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await startNormalRoute(page, 24);
      const herb = await page.evaluate(() =>
        window.__normalRouteGame.scene
          .getScene("World")
          .gameState.resources.find(
            (node) => node.material_id === "meadow_herb",
          ),
      );
      expect(herb).toBeTruthy();
      expect(await walkNormally(page, "World", herb)).toBe("World");
      const gather = page.getByRole("button", {
        name: `Gather — ${herb.name}`,
        exact: true,
      });
      if (width === 390) await gather.tap();
      else await gather.click();
      await expect
        .poll(
          async () =>
            (await snapshot(page)).materials.find((m) => m.id === "meadow_herb")
              .count,
        )
        .toBeGreaterThanOrEqual(2);
      await page.keyboard.press("m");
      await page.getByRole("button", { name: /Crafting/i }).click();
      const dialog = page.getByRole("dialog", {
        name: "Crafting",
        exact: true,
      });
      const recipes = dialog.locator(".craft-library .craft-recipe");
      const mutations = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().endsWith("/field-craft"))
          mutations.push(r.postDataJSON());
      });
      const before = await snapshot(page);
      await recipes.first().focus();
      await expect(recipes.first()).toHaveAttribute(
        "aria-keyshortcuts",
        /^Alt\+/,
      );
      await page.keyboard.press(width === 390 ? "ArrowRight" : "ArrowDown");
      await expect(recipes.nth(1)).toBeFocused();
      await expect(recipes.first()).toHaveAttribute("aria-pressed", "true");
      expect(await snapshot(page)).toEqual(before);
      expect(mutations).toEqual([]);
      await page.screenshot({
        path: path.join(proof, `${width}-recipe-browse.png`),
      });
      await page.keyboard.press("Enter");
      await expect(recipes.nth(1)).toHaveAttribute("aria-pressed", "true");
      expect(await snapshot(page)).toEqual(before);
      await page.keyboard.press("End");
      await expect(recipes.last()).toBeFocused();
      await page.keyboard.press("Home");
      await expect(recipes.first()).toBeFocused();
      await verticalBrowse(page, recipes);
      await page.keyboard.press(" ");
      await expect(recipes.first()).toHaveAttribute("aria-pressed", "true");
      expect(await snapshot(page)).toEqual(before);
      expect(mutations).toEqual([]);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(recipes.first()).toBeFocused();
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/field-craft"),
      );
      await dialog.locator(".viewport-dialog-footer .primary").focus();
      await page.keyboard.down("Space");
      await page.keyboard.down("Space");
      await page.keyboard.up("Space");
      const crafted = await (await response).json();
      expect(crafted.error).toBeUndefined();
      await expect(dialog).toContainText("Brew Potion complete");
      expect(crafted.potions).toBe(before.potions + 1);
      expect(crafted.gold).toBe(before.gold);
      expect(mutations).toHaveLength(1);
      const after = await snapshot(page);
      writeFileSync(
        path.join(proof, `${width}-craft-audit.json`),
        JSON.stringify({ before, after, crafted, mutations }, null, 2),
      );
      await page.screenshot({
        path: path.join(proof, `${width}-recipe-crafted.png`),
      });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      expect(errors).toEqual([]);
    });
    test("gear arrows stay in the drawer and Enter only previews before Equip", async ({
      page,
    }) => {
      test.setTimeout(90000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await startNormalRoute(page, 24);
      await page.evaluate(() =>
        window.__kithlandsTest.setPartyLevels(
          [0, 1, 2, 3].map((slot) => ({ slot, level: 25 })),
          "World",
        ),
      );
      for (const id of ["steel_sword", "mythril_sword"]) {
        const result = await page.evaluate(
          (id) => window.__kithlandsTest.debugGiveItem(id, 1, "World"),
          id,
        );
        expect(result.error).toBeUndefined();
      }
      await page.keyboard.press("m");
      await page.getByRole("button", { name: /^Character/i }).click();
      const screen = page.getByRole("dialog", {
        name: "Character",
        exact: true,
      });
      await screen.locator('[data-slot-id="main_hand"]').click();
      const choices = screen.locator(
        ".equipment-item-list .equipment-item-row",
      );
      expect(await choices.count()).toBeGreaterThanOrEqual(3);
      const before = await snapshot(page);
      const mutations = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().endsWith("/equip"))
          mutations.push(r.postDataJSON());
      });
      await choices.first().focus();
      await expect(choices.first()).toHaveAttribute(
        "aria-keyshortcuts",
        /^Alt\+/,
      );
      await page.keyboard.press("ArrowRight");
      await expect(choices.nth(1)).toBeFocused();
      expect(
        await page.evaluate(
          () =>
            window.__normalRouteGame.scene.getScene("World")
              .equipmentScreenState.partyIndex,
        ),
      ).toBe(0);
      await page.keyboard.press("End");
      await expect(choices.last()).toBeFocused();
      await page.keyboard.press("Home");
      await expect(choices.first()).toBeFocused();
      await verticalBrowse(page, choices);
      await page.keyboard.press("ArrowLeft");
      await expect(choices.first()).toBeFocused();
      expect(await snapshot(page)).toEqual(before);
      expect(mutations).toEqual([]);
      await page.screenshot({
        path: path.join(proof, `${width}-gear-browse.png`),
      });
      const steel = choices.filter({ hasText: "Steel Sword" }).first();
      await steel.focus();
      await page.keyboard.press("Enter");
      await expect(steel).toHaveAttribute("aria-pressed", "true");
      const confirm = screen.locator(".comparison-actions .primary");
      await expect(confirm).toBeEnabled();
      expect(await snapshot(page)).toEqual(before);
      expect(mutations).toEqual([]);
      await page.screenshot({
        path: path.join(proof, `${width}-gear-preview.png`),
      });
      const response = page.waitForResponse((r) => r.url().endsWith("/equip"));
      await confirm.focus();
      await page.keyboard.down("Space");
      await page.keyboard.down("Space");
      await page.keyboard.up("Space");
      const equipped = await (await response).json();
      expect(equipped.error).toBeUndefined();
      await expect(screen.locator(".drawer-current")).toContainText(
        "Steel Sword",
      );
      expect(equipped.gold).toBe(before.gold);
      expect(mutations).toHaveLength(1);
      writeFileSync(
        path.join(proof, `${width}-gear-audit.json`),
        JSON.stringify(
          { before, after: await snapshot(page), equipped, mutations },
          null,
          2,
        ),
      );
      await page.screenshot({
        path: path.join(proof, `${width}-gear-equipped.png`),
      });
      await page.keyboard.press("Escape");
      await expect(screen).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}
