import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
  openNormalMerchant,
} from "./helpers/normal-route.js";
const proof = path.resolve(`tmp/shop-approach-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ video: "on" });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test.describe(`shop approach ${width}`, () => {
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
    });
    test("steps stop before the roof and the clear aisle reaches the merchant", async ({
      page,
    }) => {
      test.setTimeout(120000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const capture = (stage) =>
        page.screenshot({ path: path.join(proof, `${width}-${stage}.png`) });
      const activate = (node) => (width === 390 ? node.tap() : node.click());
      await startNormalRoute(page, 6);
      const campaignName = await page.evaluate(() => {
        const state = window.__kithlandsTest.gameState("World");
        return state.quests[state.current_quest].name;
      });
      await activate(page.getByRole("button", { name: "Menu", exact: true }));
      await activate(page.getByRole("button", { name: /^Quest journal/ }));
      await activate(
        page.getByRole("button", {
          name: "Track The Old Mill of Cadott, WI",
          exact: true,
        }),
      );
      await activate(
        page.getByRole("button", { name: "Close Quest Log", exact: true }),
      );
      const home = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("World");
        return s.spawns.find(
          (p) => p.node_id === s.gameState.settlement_entry_node_id,
        );
      });
      await walkNormally(page, "World", home);
      await activate(page.getByRole("button", { name: /^Enter —/ }));
      await routeReady(page, "Settlement");
      await walkNormally(page, "Settlement", { x: 19, y: 11 });
      await capture("below-steps");
      await page.keyboard.down("ArrowUp");
      try {
        await page.waitForFunction(() => {
          const s = window.__normalRouteGame.scene.getScene("Settlement");
          return s.playerY === 9 && !s.animating;
        });
        // A held input tries the next blocked row; it cannot climb the roof.
        await page.waitForTimeout(450);
      } finally {
        await page.keyboard.up("ArrowUp");
      }
      const exterior = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Settlement");
        return {
          x: s.playerX,
          y: s.playerY,
          feet: s.player.y - s.offsetY,
          door: s.currentInteraction,
          roof: s.tileData[8][19],
        };
      });
      expect(exterior.y).toBe(9);
      expect(exterior.feet).toBe(320);
      expect(exterior.roof).toBe(1);
      expect(exterior.door.name).toBe("general-store-door");
      expect(exterior.door.y).toBe(320);
      await capture("door-prompt");
      await page.keyboard.press("Enter");
      await routeReady(page, "Town");
      const objective = page.locator(
        ".interior-controls [data-objective-tracker]",
      );
      await expect(objective).toHaveCount(1);
      await expect(
        objective.locator(".explore-objective-details"),
      ).toBeHidden();
      await activate(
        objective.getByRole("button", { name: "Objective ▾", exact: true }),
      );
      await expect(objective.locator("strong")).toHaveText(
        "The Old Mill of Cadott, WI",
      );
      await expect(objective.locator("p")).toContainText("Old Mill trail");
      await capture("inside-tracked-story");
      await activate(
        objective.getByRole("button", { name: "Quest journal", exact: true }),
      );
      const journal = page.getByRole("dialog", {
        name: "Quest Log",
        exact: true,
      });
      await expect(journal).toBeVisible();
      await expect(page.locator(".interior-controls")).toBeHidden();
      await activate(
        journal.getByRole("button", {
          name: `Track ${campaignName}`,
          exact: true,
        }),
      );
      await activate(
        page.getByRole("button", { name: "Close Quest Log", exact: true }),
      );
      await expect(objective.locator("strong")).toHaveText(campaignName);
      await capture("inside-tracked-campaign");
      await objective
        .getByRole("button", { name: "Objective ▴", exact: true })
        .focus();
      await page.keyboard.press("Escape");
      await expect(
        objective.locator(".explore-objective-details"),
      ).toBeHidden();
      await expect(page.locator("#game > canvas")).toBeFocused();
      await capture("inside-entry");
      const start = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Town");
        return {
          x: s.playerX,
          y: s.playerY,
          aisle: s.canWalkTile(s.tiles[6][7]),
        };
      });
      expect(start.x).toBe(7);
      expect(start.aisle).toBe(true);
      await page.keyboard.down("ArrowUp");
      try {
        await page.waitForFunction(() => {
          const s = window.__normalRouteGame.scene.getScene("Town");
          return s.playerY === 5 && !s.animating;
        });
      } finally {
        await page.keyboard.up("ArrowUp");
      }
      const merchant = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Town");
        const npc = s.npcs[s.nearNpcIndex];
        return {
          x: s.playerX,
          y: s.playerY,
          npc: { name: npc.name, role: npc.role, x: npc.x, y: npc.y },
        };
      });
      expect(merchant.x).toBe(7);
      expect(merchant.npc.role).toBe("shopkeeper");
      await capture("counter-prompt");
      await openNormalMerchant(page);
      await activate(page.getByRole("button", { name: /^Spells/ }));
      await activate(page.getByRole("button", { name: /^Frost/ }));
      await capture("spell-preview");
      await activate(page.locator(".shop-purchase"));
      await expect(page.locator(".shop-status")).toHaveText(
        "Sparks learned Frost!",
      );
      await capture("purchase");
      const bought = await page.evaluate(() =>
        window.__kithlandsTest.gameState("Town"),
      );
      expect(bought.gold).toBe(0);
      expect(bought.party.find((p) => p.name === "Sparks").spells).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "frost" })]),
      );
      await activate(page.getByRole("button", { name: /^Leave Shop/ }));
      await page.keyboard.press("Escape");
      await routeReady(page, "Settlement");
      await capture("returned");
      const returned = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Settlement");
        return {
          x: s.playerX,
          y: s.playerY,
          gold: s.gameState.gold,
          party: s.gameState.party,
        };
      });
      expect(returned.x).toBe(19);
      expect(returned.y).toBe(10);
      expect(returned.gold).toBe(0);
      expect(returned.party).toEqual(bought.party);
      await walkNormally(page, "Settlement", { x: 12, y: 15 });
      await capture("returned-trail-junction");
      const trail = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Settlement");
        return {
          location: s.gameState.current_location,
          entries: s.gameState.dungeon_entries,
          entry: s.currentDungeonEntry,
          button: s.dungeonEntryButton && {
            active: s.dungeonEntryButton.bg.active,
            visible: s.dungeonEntryButton.bg.visible,
            label: s.dungeonEntryButton.label.text,
          },
        };
      });
      writeFileSync(
        path.join(proof, `${width}-trail-diagnostic.json`),
        JSON.stringify(trail, null, 2),
      );
      expect(trail.button?.active).toBe(true);
      expect(trail.button?.visible).toBe(true);
      expect(trail.button?.label).toBe("Old Mill trail");
      // Activate the actual retained control, proving this is more than visibility.
      const trailBox = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Settlement"),
          r = s.dungeonEntryButton.bg.getBounds(),
          c = s.game.canvas.getBoundingClientRect();
        return {
          x: c.x + (r.centerX * c.width) / s.scale.gameSize.width,
          y: c.y + (r.centerY * c.height) / s.scale.gameSize.height,
        };
      });
      if (width === 390) await page.touchscreen.tap(trailBox.x, trailBox.y);
      else await page.mouse.click(trailBox.x, trailBox.y);
      await routeReady(page, "Dungeon");
      await capture("trail-entered-after-shop");
      expect(errors).toEqual([]);
      writeFileSync(
        path.join(proof, `${width}-audit.json`),
        JSON.stringify(
          { exterior, start, merchant, returned, errors },
          null,
          2,
        ),
      );
    });
  });
}
