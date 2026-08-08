import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

test.describe("Warrior layered battle gold slice", () => {
  test.describe.configure({ timeout: 90_000 });

  test("keeps Warrior identity and swaps equipment layers", async ({
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
  });

  test("uses authored spell scope without a redundant one-or-all menu", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
      null,
      { timeout: 90_000 },
    );
    await page.evaluate(() => window.__kithlandsTest.startShowcase());

    const menu = await page.evaluate(() =>
      window.__kithlandsTest.previewBattleSpellFlow("spark", false),
    );
    expect(menu.pickerOpen).toBe(true);
    expect(menu.pickerLabels.some((label) => label.includes("ALL"))).toBe(
      false,
    );
    await page.screenshot({
      path: testInfo.outputPath(`compact-spell-menu-desktop-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath(`compact-spell-menu-mobile-${RUN_ID}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });

    const single = await page.evaluate(() =>
      window.__kithlandsTest.previewBattleSpellFlow("spark"),
    );
    expect(single.pickerOpen).toBe(false);
    expect(single.targetingMode).toBe("enemy");
    expect(single.actions).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`single-spell-direct-target-${RUN_ID}.png`),
      fullPage: true,
    });
    const singleActions = await page.evaluate(() =>
      window.__kithlandsTest.commitBattleTarget("enemy", 0),
    );
    expect(singleActions[0]).toMatchObject({
      spell_id: "spark",
      target_mode: "single_enemy",
    });
    expect(singleActions[0].target_id).toBeGreaterThanOrEqual(0);

    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
      null,
      { timeout: 90_000 },
    );
    await page.evaluate(() => window.__kithlandsTest.startShowcase());
    const group = await page.evaluate(() =>
      window.__kithlandsTest.previewBattleSpellFlow("blaze"),
    );
    expect(group.pickerOpen).toBe(false);
    expect(group.targetingMode).toBe(false);
    expect(group.actions[0]).toMatchObject({
      spell_id: "blaze",
      target_id: -1,
      target_mode: "all_enemies",
    });
    await page.screenshot({
      path: testInfo.outputPath(`group-spell-auto-target-${RUN_ID}.png`),
      fullPage: true,
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
