import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  chooseStoryAction,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const proof = path.resolve(`tmp/victory-advance-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 390]) {
  test.describe(`${width} victory acknowledgement`, () => {
    test.use({
      viewport: { width, height: width === 390 ? 844 : 900 },
      hasTouch: width === 390,
    });
    test("rejection and a lost committed reply preserve the receipt and retry safely", async ({
      page,
    }) => {
      test.setTimeout(180000);
      page.setDefaultTimeout(15000);
      const aborted = [],
        errors = [],
        receipts = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("requestfailed", (request) => {
        if (request.postDataJSON()?.type === "battle_continue")
          aborted.push(request.failure()?.errorText);
      });
      let attempts = 0,
        release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      await page.route("**/api/game/*/action", async (route) => {
        if (route.request().postDataJSON()?.type !== "battle_continue")
          return route.continue();
        attempts++;
        if (attempts === 1)
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Test connection interrupted before acknowledgement",
            }),
          });
        const response = await route.fetch();
        const next = await response.json();
        receipts.push({
          attempt: attempts,
          phase: next.phase,
          gold: next.gold,
          party: next.party.map((p) => ({
            hp: p.hp,
            mp: p.mp,
            xp: p.xp,
            level: p.level,
          })),
          enemies: next.enemies,
        });
        if (attempts === 2) {
          // Go has committed the acknowledgement; the client loses its reply.
          await held;
          try {
            await route.fulfill({ response });
          } catch (error) {
            if (!route.request().failure()) throw error;
          }
          return;
        }
        return route.fulfill({ response });
      });
      const capture = (label) =>
        page.screenshot({ path: path.join(proof, `${width}-${label}.png`) });
      const input = (locator) =>
        width === 390 ? locator.tap() : locator.click();
      try {
        await startNormalRoute(page, 24);
        await input(
          page.getByRole("button", { name: "Old Mill trail", exact: true }),
        );
        await routeReady(page, "Dungeon");
        await chooseStoryAction(page, "trail-bats", width === 390);
        // Bound a real missing fetch reply without changing gameplay timing.
        await page.evaluate(() => {
          window.__normalRouteGame.scene.getScene(
            "Battle",
          ).victoryAdvanceTimeoutMs = 2000;
        });
        const fight = fightNormally(page);
        const button = page.locator(".victory-continue"),
          hint = page.locator(".victory-controls");
        await expect(hint).toContainText("Try Continue again", {
          timeout: 90000,
        });
        expect(attempts).toBe(1);
        await expect(button).toBeEnabled();
        await capture("rejection-keeps-receipt");
        await input(button);
        await expect(button).toBeDisabled();
        await expect(page.locator(".victory-receipt")).toHaveAttribute(
          "aria-busy",
          "true",
        );
        await expect.poll(() => receipts.length).toBe(1);
        expect(receipts[0].phase).toBe("world");
        await page.keyboard.press("Enter");
        await page.keyboard.press("Escape");
        expect(attempts).toBe(2);
        await capture("pending-committed-reply-no-duplicate");
        await expect(hint).toContainText("Try Continue again");
        await expect.poll(() => aborted.length).toBe(1);
        expect(aborted[0]).toContain("ERR_ABORTED");
        release();
        await expect(page.locator(".victory-receipt")).toBeVisible();
        await capture("lost-reply-keeps-receipt");
        await input(button);
        await fight;
        await routeReady(page, "Dungeon");
        expect(attempts).toBe(3);
        expect(receipts).toHaveLength(2);
        expect({ ...receipts[1], attempt: 2 }).toEqual(receipts[0]);
        expect(receipts[1].phase).toBe("world");
        expect(receipts[1].enemies || []).toEqual([]);
        expect(
          await page.evaluate(() => window.__kithlandsTest.gameState().phase),
        ).toBe("world");
        await expect(page.locator(".victory-receipt")).toHaveCount(0);
        await capture("resumed-once-with-same-rewards");
        expect(errors).toEqual([]);
      } finally {
        release();
        writeFileSync(
          path.join(proof, `${width}-audit.json`),
          JSON.stringify({ attempts, receipts, aborted, errors }, null, 2),
        );
        console.log("victory-advance-proof", proof);
      }
    });
  });
}
