import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

test.describe("Warrior layered battle gold slice", () => {
  test.describe.configure({ timeout: 90_000 });

  test("keeps Warrior identity, swaps equipment layers, and scopes group casts", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
      null,
      { timeout: 90_000 },
    );
    const state = await page.evaluate(() =>
      window.__kithlandsTest.startShowcase(),
    );
    expect(state.showcase_mode).toBe(true);
    expect(state.party[0].composition.weapon_visual_id).toBe("mythril_sword");
    expect(state.party[0].composition.weapon_animation_set).toBe("sword");

    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().partyMembers[0]
          ?.textureKey === "battle_warrior_sword_attack_body",
    );

    for (const frameIndex of [0, 2, 3, 4, 5]) {
      const frame = await page.evaluate(
        (index) =>
          window.__kithlandsTest.previewBattleCharacterFrame("Hero", index),
        frameIndex,
      );
      expect(frame.frameIndex).toBe(frameIndex);
      expect(frame.weaponTextureKey).toBe("battle_weapon_mythril_sword");
      await page.screenshot({
        path: testInfo.outputPath(
          `warrior-layered-frame-${frameIndex}-${RUN_ID}.png`,
        ),
        fullPage: true,
      });
    }

    const scope = await page.evaluate(() =>
      window.__kithlandsTest.previewBattleSpellScope("blaze", "all_enemies"),
    );
    expect(scope.groupCursors).toBe(1);
    expect(scope.groupTargetIndicatorLabel).toBe("ALL ENEMIES");
    await page.screenshot({
      path: testInfo.outputPath(`all-enemies-confirm-${RUN_ID}.png`),
      fullPage: true,
    });
    const selectedActions = await page.evaluate(() =>
      window.__kithlandsTest.confirmBattleSpellScope(),
    );
    expect(selectedActions[0]).toMatchObject({
      spell_id: "blaze",
      target_id: -1,
      target_mode: "all_enemies",
    });
  });

  test("presents an authoritative all-enemy cast as one simultaneous beat", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
      null,
      { timeout: 90_000 },
    );
    await page.evaluate(() => window.__kithlandsTest.startShowcase());
    const actions = await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("all_spell"),
    );
    expect(actions.some((action) => action.target_mode === "all_enemies")).toBe(
      true,
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return snapshot.groupCursors === 1 && snapshot.spellProjectiles >= 2;
    });
    const snapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(snapshot.groupTargetIndicatorLabel).toBe("ALL ENEMIES");
    expect(snapshot.spellProjectiles).toBeGreaterThanOrEqual(2);
    await page.screenshot({
      path: testInfo.outputPath(`all-enemies-simultaneous-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
