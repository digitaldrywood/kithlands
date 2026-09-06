import { expect, test } from "@playwright/test";

const run = Date.now();
for (const width of [800, 645, 390]) {
  test(`battlefield persists through round restarts at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 847 });
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(
        ["giant_rat", "giant_rat", "goblin", "slime"],
        1,
      ),
    );
    const snapshot = () =>
      page.evaluate(() => window.__kithlandsTest.battleVisibilitySnapshot());
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().enemyMembers
          .length === 4,
    );
    const initial = await snapshot();
    expect(initial.backdropTexture).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath(`battle-${run}-${width}-before.png`),
    });
    // Controlled server responses isolate rendering continuity from combat RNG.
    // Submit through the real round handler, including death reconciliation and restart.
    let state = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Battle"),
    );
    await page.route("**/game/*/action", async (route) => {
      if (route.request().postDataJSON()?.type !== "combat_round")
        return route.continue();
      await route.fulfill({ json: state });
    });
    for (const remaining of [2, 1]) {
      state = {
        ...state,
        enemies: state.enemies.slice(-remaining),
        combat_log: [],
        combat_actions: [],
      };
      await page.evaluate(() => {
        const b = window.__kithlandsTest;
        b.playCombatRound(
          b
            .gameState("Battle")
            .party.map((_, slot) => ({ slot, type: "defend" })),
        );
      });
      await page.waitForFunction((count) => {
        const b = window.__kithlandsTest;
        const s = b.battleVisibilitySnapshot();
        return (
          b.gameState("Battle").enemies.length === count &&
          !s.animating &&
          s.enemyMembers.length === count
        );
      }, remaining);
      const after = await snapshot();
      expect(after.backdropTexture).toBe(initial.backdropTexture);
      for (const enemy of after.enemyMembers) {
        const original = initial.enemyMembers.find(
          (entry) => entry.id === enemy.id,
        );
        expect([enemy.x, enemy.y]).toEqual([original.x, original.y]);
        expect(enemy.spriteBounds.width).toBeCloseTo(
          original.spriteBounds.width,
          3,
        );
        expect(enemy.spriteBounds.height).toBeCloseTo(
          original.spriteBounds.height,
          3,
        );
      }
      await page.screenshot({
        path: testInfo.outputPath(
          `battle-${run}-${width}-${remaining}-survivors.png`,
        ),
      });
    }
    await page.unroute("**/game/*/action");
    const victory = await page.evaluate(() =>
      window.__kithlandsTest.forceVictory(),
    );
    // Victory can award equipment; resolve its real decision before Continue.
    for (const drop of victory.battle_rewards?.drops ?? []) {
      if (
        drop.kind !== "equipment" ||
        drop.decision !== "pending" ||
        !drop.instance_id
      )
        continue;
      await page.getByRole("button", { name: "Keep in Inventory" }).click();
      await page.waitForFunction(
        (instanceId) =>
          !window.__kithlandsTest
            .gameState("Battle")
            .battle_rewards?.drops?.some(
              (entry) =>
                entry.instance_id === instanceId &&
                entry.decision === "pending",
            ),
        drop.instance_id,
      );
    }
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Battle")
        .some((entry) => entry.interactive && entry.text.trim() === "Continue"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Continue", "Battle"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["giant_rat"], 1),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().enemyMembers
          .length === 1,
    );
    const fresh = await snapshot();
    expect(fresh.enemyMembers[0].x).toBe(239);
  });
}
