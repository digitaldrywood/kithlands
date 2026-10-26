import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
  openNormalMerchant,
} from "./helpers/normal-route.js";
const proof = path.resolve(`tmp/settlement-exit-${Date.now()}`);
mkdirSync(proof, { recursive: true });

for (const [width, height] of [
  [1440, 900],
  [858, 842],
  [800, 600],
  [390, 844],
]) {
  test.describe(`town exit ${width}`, () => {
    const touch = width < 600;
    test.use({ viewport: { width, height }, hasTouch: touch });
    for (const mode of ["keyboard", "button-retry"]) {
      test(`${mode}: visible gate approach returns safely to the world`, async ({
        page,
      }) => {
        test.setTimeout(90000);
        const activate = (locator) => (touch ? locator.tap() : locator.click());
        const capture = (stage) =>
          page.screenshot({
            path: path.join(proof, `${width}-${mode}-${stage}.png`),
          });
        await startNormalRoute(page, 4);
        const home = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("World");
          return s.spawns.find(
            (p) => p.node_id === s.gameState.settlement_entry_node_id,
          );
        });
        await walkNormally(page, "World", home);
        await activate(page.getByRole("button", { name: /^Enter —/ }));
        await routeReady(page, "Settlement");
        await walkNormally(page, "Settlement", { x: 18, y: 9 });
        await page.keyboard.press("Enter");
        await routeReady(page, "Town");
        await openNormalMerchant(page);
        await activate(page.getByRole("button", { name: /^Leave Shop/ }));
        await page.keyboard.press("Escape");
        await routeReady(page, "Settlement");
        await walkNormally(page, "Settlement", { x: 14, y: 14 });
        const leave = page.getByRole("button", {
          name: "Leave town",
          exact: true,
        });
        await expect(leave).toBeHidden();
        await activate(page.getByRole("button", { name: /^Menu/ }));
        await expect(
          page.getByRole("dialog", { name: "Your party" }),
        ).toBeVisible();
        await expect(leave).toBeHidden();
        await activate(page.locator(".modern-party-menu .party-dismiss"));
        await walkNormally(page, "Settlement", {
          x: mode === "keyboard" ? 11 : 13,
          y: 15,
        });
        // The illustrated left/right approach hits the old collision edge.
        // Exit selection must remain available without the exact center cell.
        await page.keyboard.press("ArrowDown");
        await expect(leave).toBeVisible();
        await expect(leave).toBeEnabled();
        const before = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Settlement"),
            g = s.gameState;
          return {
            x: s.playerX,
            y: s.playerY,
            interaction: s.currentInteraction?.name,
            gold: g.gold,
            party: g.party,
            items: g.items,
            quests: g.quests,
          };
        });
        expect(before.interaction).toBe("south-exit");
        const bounds = await leave.boundingBox();
        expect(bounds.height).toBeGreaterThanOrEqual(46);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
        if (touch) {
          const dpadTop = await page.evaluate(() => {
            const s = window.__normalRouteGame.scene.getScene("Settlement"),
              r = s.game.canvas.getBoundingClientRect();
            return (
              r.top +
              (s.gameplayLayout.controlArea.dpadTop * r.height) /
                s.gameplayLayout.height
            );
          });
          expect(bounds.y + bounds.height).toBeLessThan(dpadTop);
        }
        await capture("gate-action");
        let attempts = 0;
        if (mode === "button-retry") {
          await page.route("**/api/game/*/transition", async (route) => {
            if (
              route.request().postDataJSON()?.transition_id === "south-exit" &&
              ++attempts === 1
            )
              await route.abort("failed");
            else await route.continue();
          });
          await activate(leave);
          await page.waitForFunction(
            () =>
              window.__normalRouteGame.scene.getScene("Settlement").messageText
                ?.text === "Could not leave town. Please try again.",
          );
          await expect(leave).toBeEnabled();
          await capture("network-error");
        }
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/transition") &&
            r.request().postDataJSON()?.transition_id === "south-exit",
        );
        if (mode === "keyboard")
          await page.keyboard.press(width === 800 ? "Space" : "Enter");
        else await activate(leave);
        const result = await (await response).json();
        expect(result.error).toBeUndefined();
        expect(result.current_location.kind).toBe("world");
        expect(result.gold).toBe(before.gold);
        expect(result.party).toEqual(before.party);
        expect(result.items).toEqual(before.items);
        expect(result.quests).toEqual(before.quests);
        await routeReady(page, "World");
        await expect(page.locator(".interior-controls")).toHaveCount(0);
        await capture("returned-world");
        if (mode === "button-retry") {
          expect(attempts).toBe(2);
          await activate(page.getByRole("button", { name: /^Enter —/ }));
          await routeReady(page, "Settlement");
          await expect(leave).toBeVisible();
          await capture("reentered-town");
          await page.keyboard.press("Space");
          await routeReady(page, "World");
        }
        writeFileSync(
          path.join(proof, `${width}-${mode}-audit.json`),
          JSON.stringify(
            {
              before,
              result: {
                gold: result.gold,
                party: result.party,
                items: result.items,
                quests: result.quests,
                location: result.current_location,
              },
              attempts,
              bounds,
            },
            null,
            2,
          ),
        );
      });
    }
  });
}
