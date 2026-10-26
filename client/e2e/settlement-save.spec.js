import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
} from "./helpers/normal-route.js";
const proof = path.resolve(`tmp/settlement-save-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [858, 842],
  [800, 600],
  [390, 844],
]) {
  test.describe(`settlement save ${width}`, () => {
    const touch = width < 600;
    test.use({ viewport: { width, height }, hasTouch: touch });
    for (const failure of [false, true]) {
      test(`${failure ? "failed-save-retry" : "repeated-save"}: notice, movement and reload stay usable`, async ({
        page,
      }) => {
        test.setTimeout(90000);
        const mode = failure ? "failed-save-retry" : "repeated-save";
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const activate = (node) => (touch ? node.tap() : node.click());
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
        await walkNormally(page, "Settlement", { x: 6, y: 11 });
        const snapshot = () =>
          page.evaluate(() => {
            const s = window.__normalRouteGame.scene.getScene("Settlement"),
              g = s.gameState;
            return {
              frame: s.game.loop.frame,
              x: s.playerX,
              y: s.playerY,
              gold: g.gold,
              party: g.party,
              items: g.items,
              quests: g.quests,
            };
          });
        const before = await snapshot();
        let attempts = 0;
        if (failure)
          await page.route("**/api/game/*/save", async (route) => {
            attempts++;
            if (attempts === 1) await route.abort("failed");
            else await route.continue();
          });
        const save = async (keyboard = false) => {
          await activate(page.getByRole("button", { name: /^Menu/ }));
          const response = page.waitForResponse(
            (r) => r.url().endsWith("/save") && r.request().method() === "POST",
          );
          if (keyboard) await page.keyboard.press("s");
          else await activate(page.getByRole("button", { name: /^Save game/ }));
          const result = await (await response).json();
          expect(result.error).toBeUndefined();
          expect(result.status).toBe("saved");
          await expect(
            page.getByRole("dialog", { name: "Your party" }),
          ).toHaveCount(0);
          await page.waitForFunction(
            () =>
              window.__normalRouteGame.scene.getScene("Settlement").messageText
                ?.text === "Game saved!",
          );
          return result;
        };
        const waitNotice = () =>
          expect
            .poll(() =>
              page.evaluate(
                () =>
                  window.__normalRouteGame.scene.getScene("Settlement")
                    .messageText === null,
              ),
            )
            .toBe(true);
        if (failure) {
          await activate(page.getByRole("button", { name: /^Menu/ }));
          await activate(page.getByRole("button", { name: /^Save game/ }));
          await expect(
            page.getByRole("dialog", { name: "Your party" }),
          ).toHaveCount(0);
          await page.waitForFunction(() =>
            window.__normalRouteGame.scene
              .getScene("Settlement")
              .messageText?.text.startsWith("Save failed:"),
          );
          await capture("failed-notice");
          await waitNotice();
          await walkNormally(page, "Settlement", { x: 7, y: 11 });
        }
        await save();
        await capture("saved-notice");
        await waitNotice();
        await walkNormally(page, "Settlement", { x: 7, y: 11 });
        const resumed = await snapshot();
        expect(resumed.frame).toBeGreaterThan(before.frame);
        expect({
          gold: resumed.gold,
          party: resumed.party,
          items: resumed.items,
          quests: resumed.quests,
        }).toEqual({
          gold: before.gold,
          party: before.party,
          items: before.items,
          quests: before.quests,
        });
        await capture("movement-resumed");
        await save(true);
        await waitNotice();
        await walkNormally(page, "Settlement", { x: 6, y: 11 });
        await capture("second-save-resumed");
        // Normal refresh and Continue use the isolated account's saved adventure.
        await page.reload();
        await page.waitForFunction(
          () => window.__kithlandsTest?.activeSceneKey() === "Title",
        );
        await activate(page.getByRole("button", { name: /^Continue/ }));
        const latest = page.locator(".title-save:visible");
        await expect(latest).toHaveCount(1);
        const saveID = await latest.getAttribute("data-save-id");
        await capture("continue-latest");
        const loadedResponse = page.waitForResponse((r) =>
          r.url().includes(`/saves/${saveID}/load`),
        );
        await activate(latest);
        const loaded = await (await loadedResponse).json();
        expect(loaded.error).toBeUndefined();
        expect({
          gold: loaded.gold,
          party: loaded.party,
          items: loaded.items,
          quests: loaded.quests,
        }).toEqual({
          gold: before.gold,
          party: before.party,
          items: before.items,
          quests: before.quests,
        });
        await routeReady(page, "World");
        await capture("loaded-world");
        // Settlement saves deliberately resume on World, at its saved checkpoint.
        // Enter town normally and verify saving still works after restoration.
        await activate(page.getByRole("button", { name: /^Enter —/ }));
        await routeReady(page, "Settlement");
        await save();
        await waitNotice();
        await walkNormally(page, "Settlement", { x: 11, y: 15 });
        await capture("restored-save-and-movement");
        await activate(
          page.getByRole("button", { name: "Leave town", exact: true }),
        );
        await routeReady(page, "World");
        expect(errors).toEqual([]);
        writeFileSync(
          path.join(proof, `${width}-${mode}-audit.json`),
          JSON.stringify(
            {
              before,
              resumed,
              saveID,
              loaded: {
                gold: loaded.gold,
                party: loaded.party,
                items: loaded.items,
                quests: loaded.quests,
                location: loaded.current_location,
              },
              attempts,
              errors,
            },
            null,
            2,
          ),
        );
      });
    }
  });
}
