import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const proof = new URL(`../tmp/battle-context-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [610, 837],
  [800, 600],
  [390, 844],
]) {
  test(`battle choices stay in the strip ${width}x${height}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(20_000);
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.__battleGame = game;`,
      });
    });
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startShowcase());
    await page.getByRole("button", { name: "Close equipment" }).click();
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .battleVisibilitySnapshot()
        ?.messageWindow.text.includes("choose an action"),
    );
    const panel = page.locator(".battle-choice-panel");
    const capture = (name) =>
      page.screenshot({
        path: new URL(`${width}-${name}.png`, proof).pathname,
      });
    const inStrip = async () => {
      const bounds = await panel.boundingBox();
      const description = await panel
        .locator(".battle-choice-detail")
        .evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const list = node.previousElementSibling.getBoundingClientRect();
          return {
            font: parseFloat(getComputedStyle(node).fontSize),
            top: rect.top,
            bottom: rect.bottom,
            listBottom: list.bottom,
          };
        });
      expect(description.font).toBeGreaterThanOrEqual(14);
      expect(description.top).toBeGreaterThanOrEqual(description.listBottom);
      expect(description.bottom).toBeLessThanOrEqual(bounds.y + bounds.height);
      const expected = await page.evaluate(() => {
        const scene = window.__battleGame.scene.getScene("Battle");
        const rect = scene.game.canvas.getBoundingClientRect();
        return {
          y:
            rect.y +
            (Math.min(scene.hudLayout.command.y, scene.hudLayout.message.y) *
              rect.height) /
              scene.hudLayout.gameHeight,
          right:
            rect.x +
            (Math.max(
              scene.hudLayout.command.x + scene.hudLayout.command.width,
              scene.hudLayout.message.x + scene.hudLayout.message.width,
            ) *
              rect.width) /
              scene.hudLayout.gameWidth,
          bottom:
            rect.y +
            (Math.max(
              scene.hudLayout.command.y + scene.hudLayout.command.height,
              scene.hudLayout.message.y + scene.hudLayout.message.height,
            ) *
              rect.height) /
              scene.hudLayout.gameHeight,
          party: {
            left:
              rect.x +
              (scene.hudLayout.party.x * rect.width) /
                scene.hudLayout.gameWidth,
            right:
              rect.x +
              ((scene.hudLayout.party.x + scene.hudLayout.party.width) *
                rect.width) /
                scene.hudLayout.gameWidth,
            top:
              rect.y +
              (scene.hudLayout.party.y * rect.height) /
                scene.hudLayout.gameHeight,
            bottom:
              rect.y +
              ((scene.hudLayout.party.y + scene.hudLayout.party.height) *
                rect.height) /
                scene.hudLayout.gameHeight,
          },
        };
      });
      expect(Math.abs(bounds.y - expected.y)).toBeLessThan(2);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(expected.right + 2);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(expected.bottom + 2);
      expect(
        bounds.x + bounds.width <= expected.party.left + 2 ||
          bounds.x >= expected.party.right - 2 ||
          bounds.y + bounds.height <= expected.party.top + 2 ||
          bounds.y >= expected.party.bottom - 2,
      ).toBe(true);
      await expect(panel).toBeInViewport();
      await expect(
        panel.getByRole("button", { name: "Back", exact: true }),
      ).toBeInViewport();
    };
    await page.keyboard.press("a");
    await expect(panel).toContainText("Choose enemy");
    await inStrip();
    await capture("attack-targets");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await page.keyboard.press("a");
    await panel.locator(".battle-choice").first().click();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__battleGame.scene.getScene("Battle").currentMemberIdx,
        ),
      )
      .toBe(1);
    await page.waitForTimeout(400);
    await page.keyboard.press("s");
    await expect(panel).toContainText("Magic");
    await expect(panel).toContainText("MP");
    await inStrip();
    await capture("magic");
    await panel.getByRole("button", { name: /^Spark ·/ }).click();
    await expect(panel).toContainText("Choose enemy");
    await capture("spell-targets");
    await page.keyboard.press("Escape");
    await expect(panel).toContainText("Magic");
    await panel.getByRole("button", { name: /^Spark ·/ }).click();
    await panel.locator(".battle-choice").first().click();
    await page.waitForFunction(
      () => window.__battleGame.scene.getScene("Battle").currentMemberIdx === 2,
    );
    await page.waitForTimeout(400);
    await page.keyboard.press("i");
    await expect(panel).toContainText("Items");
    await inStrip();
    await capture("items");
    const details = panel.getByRole("region", { name: "Choice details" });
    for (
      let i = 0;
      i < 20 &&
      !(await details.evaluate((node) => node === document.activeElement));
      i++
    )
      await page.keyboard.press("Tab");
    await expect(details).toBeFocused();
    const selectedBeforeReading = await panel
      .locator(".is-selected")
      .textContent();
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await expect(panel).toContainText("Items");
    expect(await panel.locator(".is-selected").textContent()).toBe(
      selectedBeforeReading,
    );
    await page.keyboard.press("End");
    await expect
      .poll(() =>
        details.evaluate(
          (node) => node.scrollTop + node.clientHeight >= node.scrollHeight - 1,
        ),
      )
      .toBe(true);
    await capture("item-details-keyboard");
    const usable = panel.locator(".battle-choice:not(:disabled)").first();
    if (await usable.count()) {
      await usable.click();
      await expect(panel).toContainText("Choose ally");
      await capture("item-targets");
      await page.keyboard.press("Escape");
      await expect(panel).toContainText("Items");
    }
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await page.keyboard.press("a");
    await expect(panel).toContainText("Choose enemy");
    await panel.locator(".battle-choice").first().click();
    await page.waitForFunction(
      () => window.__battleGame.scene.getScene("Battle").currentMemberIdx === 3,
    );
    await page.waitForTimeout(500);
    await page.keyboard.press("b");
    await expect(panel).toContainText("Steal");
    await capture("rogue-abilities");
    await panel.getByRole("button", { name: "Steal", exact: true }).click();
    await expect(panel).toContainText("Choose enemy");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => {
        const scene = window.__battleGame.scene.getScene("Battle");
        return scene.gameState.combat_log?.length > 0 && !scene.animating;
      },
      null,
      { timeout: 60_000 },
    );
    await expect(panel).toHaveCount(0);
    await capture("round-resolved");
    expect(errors).toEqual([]);
  });
}

test.describe("touch command choices", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("touch item target and back stay in context", async ({ page }) => {
    test.setTimeout(60_000);
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.__battleGame = game;`,
      });
    });
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startShowcase());
    await page.getByRole("button", { name: "Close equipment" }).tap();
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .battleVisibilitySnapshot()
        ?.messageWindow.text.includes("choose an action"),
    );
    // Resolve a real spell round through the existing deterministic fixture
    // helper, then verify touch-only item selection against its spent MP.
    await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("spell"),
    );
    await page.waitForFunction(() => {
      const scene = window.__battleGame.scene.getScene("Battle");
      return (
        !scene.animating &&
        scene.currentMemberIdx === 0 &&
        scene.gameState.party[1].mp < scene.gameState.party[1].max_mp
      );
    });
    const panel = page.locator(".battle-choice-panel");
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .battleVisibilitySnapshot()
        ?.messageWindow.text.includes("choose an action"),
    );
    await page.evaluate(() =>
      window.__battleGame.scene.getScene("Battle").showItemPicker(0),
    );
    await expect(panel.getByRole("button", { name: /^Ether ×/ })).toBeEnabled();
    await panel.getByRole("button", { name: /^Ether ×/ }).tap();
    await expect(panel).toContainText("Choose ally");
    const casterName = await page.evaluate(
      () =>
        window.__battleGame.scene.getScene("Battle").gameState.party[1].name,
    );
    const caster = panel.getByRole("button", {
      name: new RegExp(`^${casterName} ·`),
    });
    await expect(caster).toBeEnabled();
    await page.screenshot({
      path: new URL("390-touch-item-targets.png", proof).pathname,
    });
    await panel.getByRole("button", { name: "Back", exact: true }).tap();
    await expect(panel).toContainText("Items");
    await panel.getByRole("button", { name: /^Ether ×/ }).tap();
    await caster.tap();
    await expect(panel).toHaveCount(0);
    const action = await page.evaluate(
      () => window.__battleGame.scene.getScene("Battle").memberActions[0],
    );
    expect(action).toMatchObject({
      type: "item",
      item_id: "ether",
      target_id: 1,
    });
  });
});
