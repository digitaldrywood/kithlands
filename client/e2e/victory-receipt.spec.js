import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const proof = path.join("tmp", `victory-responsive-${Date.now()}`);
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 800, height: 600 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 390, height: 844, reduced: true },
]) {
  test.describe(`receipt ${viewport.width} ${viewport.reduced ? "reduced" : "motion"}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.width < 600,
      reducedMotion: viewport.reduced ? "reduce" : "no-preference",
    });
    test("readable rewards, retained KO XP, long names and native exit", async ({
      page,
    }) => {
      await mkdir(proof, { recursive: true });
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__receiptGame = game;`,
        });
      });
      await page.emulateMedia({
        reducedMotion: viewport.reduced ? "reduce" : "no-preference",
      });
      await page.goto("/");
      await page.waitForFunction(
        () => window.__kithlandsTest?.activeSceneKey() === "Title",
      );
      expect(
        await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      ).toBe(!!viewport.reduced);
      await page.evaluate(() => window.__kithlandsTest.startShowcase());
      await page.getByRole("button", { name: "Close equipment" }).click();
      let won = await page.evaluate(() =>
        window.__kithlandsTest.forceVictory(),
      );
      while (await page.locator(".battle-loot-keep").count())
        await page.locator(".battle-loot-keep").click();
      won = await page.evaluate(() =>
        window.__kithlandsTest.gameState("Battle"),
      );
      await expect(
        page.getByRole("dialog", { name: "VICTORY!", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".victory-continue")).toBeFocused();
      const sizes = await page
        .locator(".victory-receipt")
        .evaluate((root) =>
          [...root.querySelectorAll("h1,h2,h3,p,strong,button")].map((node) =>
            parseFloat(getComputedStyle(node).fontSize),
          ),
        );
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
      await page.keyboard.press("Tab");
      await expect(page.locator(".victory-continue")).toBeFocused();
      await page.screenshot({
        path: path.join(
          proof,
          `${viewport.width}-${viewport.reduced ? "reduced" : "motion"}-normal-top.png`,
        ),
      });
      await page.locator(".victory-member").last().scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(
          proof,
          `${viewport.width}-${viewport.reduced ? "reduced" : "motion"}-normal-party.png`,
        ),
      });
      if (!viewport.reduced) {
        await page.waitForTimeout(600);
        await page.screenshot({
          path: path.join(proof, `${viewport.width}-motion-normal-tally.png`),
        });
      }
      await expect
        .poll(() =>
          page
            .locator(".victory-xp-bar")
            .evaluateAll((bars) => bars.map((bar) => bar.value)),
        )
        .toEqual(
          won.party.map((member) =>
            member.xp_next > 0
              ? Math.max(0, Math.min(1, member.xp / member.xp_next))
              : 1,
          ),
        );
      await page.screenshot({
        path: path.join(
          proof,
          `${viewport.width}-${viewport.reduced ? "reduced" : "motion"}-normal-counted.png`,
        ),
      });
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() !== "Battle",
      );
      await expect(page.locator(".victory-receipt")).toHaveCount(0);
      await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["slime"], 1, "World"),
      );
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() === "Battle",
      );
      const nextEquipment = page.getByRole("button", {
        name: "Close equipment",
      });
      if (await nextEquipment.count()) await nextEquipment.click();
      await page.waitForFunction(() =>
        window.__kithlandsTest
          .battleVisibilitySnapshot()
          .messageWindow.text.includes("choose an action"),
      );
      const fresh = await page.evaluate(() => ({
        ready:
          window.__receiptGame.scene.getScene("Battle").victoryContinueShown,
        continuePosition: window.__kithlandsTest.interactiveTextPosition(
          "Continue",
          "Battle",
        ),
      }));
      expect(fresh).toEqual({ ready: false, continuePosition: null });
      await expect(page.locator(".victory-receipt")).toHaveCount(0);
      await page.screenshot({
        path: path.join(
          proof,
          `${viewport.width}-${viewport.reduced ? "reduced" : "motion"}-next-battle.png`,
        ),
      });
      won = await page.evaluate(() => window.__kithlandsTest.forceVictory());
      while (await page.locator(".battle-loot-keep").count())
        await page.locator(".battle-loot-keep").click();
      won = await page.evaluate(() =>
        window.__kithlandsTest.gameState("Battle"),
      );
      // Explicit presentation-only stress fixture, derived from the real reward.
      // It does not claim these names, KO state or level-up came from this battle.
      await page.evaluate((reward) => {
        const scene = window.__receiptGame.scene.getScene("Battle");
        const fixture = structuredClone(reward);
        fixture.battle_rewards = { ...fixture.battle_rewards, drops: [] };
        fixture.party[0] = {
          ...fixture.party[0],
          name: "Alexandria the Unbroken",
          hp: 0,
          xp: 150,
          xp_next: 300,
        };
        fixture.died_this_fight = [true, false, false, false];
        fixture.xp_before = [150, 68, 0, 0];
        fixture.xp_thresholds = [[], [70, 80], [], []];
        fixture.party[1] = {
          ...fixture.party[1],
          name: "Sparks of the Northern Reach",
          xp: 5,
          xp_next: 80,
          level: 2,
        };
        scene.showVictoryResults(fixture);
        scene.time.paused = true;
      }, won);
      await expect(page.locator(".victory-receipt")).toHaveCount(1);
      await expect(page.locator(".post-battle-loot-dialog")).toHaveCount(0);
      const dead = page.locator(".victory-member").first();
      await expect(dead).toContainText("NO XP · DEFEATED");
      await expect(dead.locator("progress")).toHaveJSProperty("value", 0.5);
      await page.waitForTimeout(800);
      await expect(dead.locator("progress")).toHaveJSProperty("value", 0.5);
      await expect(page.locator(".victory-level-up")).toHaveText("LEVEL UP");
      const overflow = await page
        .locator(".victory-receipt")
        .evaluate((root) =>
          [
            ...root.querySelectorAll(
              ".victory-member,.victory-member-content,.viewport-dialog-body",
            ),
          ].some((node) => node.scrollWidth > node.clientWidth + 1),
        );
      expect(overflow).toBe(false);
      await dead.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(
          proof,
          `${viewport.width}-${viewport.reduced ? "reduced" : "motion"}-ko-long-name.png`,
        ),
      });
      await page.locator(".victory-member").nth(1).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(
          proof,
          `${viewport.width}-${viewport.reduced ? "reduced" : "motion"}-level-up.png`,
        ),
      });
      if (!viewport.reduced) {
        await page.keyboard.down("Space");
        await page.keyboard.down("Space");
        await page.keyboard.up("Space");
        await expect(page.locator(".victory-controls")).toHaveText(
          "Enter / Space: continue · Esc: continue",
        );
        await expect(page.locator(".victory-continue")).toBeEnabled();
      }
      expect(
        await page.evaluate(() => window.__kithlandsTest.activeSceneKey()),
      ).toBe("Battle");
      await expect(
        page.locator(".victory-member").nth(1).locator("progress"),
      ).toHaveJSProperty("value", 5 / 80);
      if (viewport.width < 600) await page.locator(".victory-continue").tap();
      else await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() !== "Battle",
      );
      await expect(page.locator(".victory-receipt")).toHaveCount(0);
    });
  });
}
