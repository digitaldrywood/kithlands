import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

async function closeShowcaseLoadout(page) {
  const loadout = page.getByRole("dialog", { name: "Character" });
  await expect(loadout).toBeVisible();
  await page.getByRole("button", { name: "Close equipment" }).click();
  await expect(loadout).toBeHidden();
}

test.describe("Warrior layered battle gold slice", () => {
  test.describe.configure({ timeout: 90_000 });

  test("plays every authored Warrior state and holds KO", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
      null,
      { timeout: 90_000 },
    );
    await page.evaluate(() => window.__kithlandsTest.startShowcase());
    await closeShowcaseLoadout(page);
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().battleCharacterAudit
          ?.identityCount === 12,
    );

    const expectedStates = [
      "idle_guard",
      "physical_attack",
      "cast_class_ability",
      "defend",
      "hit_reaction",
      "item_use",
      "victory",
      "ko_defeated",
    ];
    const firstState = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
    );
    expect(firstState.identityID).toBe("warrior");
    expect(firstState.animationStates).toEqual(expectedStates);
    expect(firstState.animationState).toBe("physical_attack");

    const proofDelays = {
      physical_attack: 170,
      cast_class_ability: 250,
      defend: 180,
      hit_reaction: 150,
      item_use: 230,
      victory: 260,
      ko_defeated: 520,
    };
    for (const [index, state] of expectedStates.slice(1).entries()) {
      const selected =
        index === 0
          ? firstState
          : await page.evaluate(() =>
              window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
            );
      expect(selected.animationState).toBe(state);
      await page.evaluate(() =>
        window.__kithlandsTest.playBattleCharacterAudit(),
      );
      await page.waitForTimeout(proofDelays[state]);
      const member = await page.evaluate(
        () => window.__kithlandsTest.battleVisibilitySnapshot().partyMembers[0],
      );
      expect(member.battleState).toBe(state);
      await page.screenshot({
        path: testInfo.outputPath(`warrior-state-${state}-${RUN_ID}.png`),
        fullPage: true,
      });
    }

    const ko = await page.evaluate(
      () => window.__kithlandsTest.battleVisibilitySnapshot().partyMembers[0],
    );
    expect(ko.battleState).toBe("ko_defeated");
    expect(ko.battleBodyAngle).toBe(0);
    expect(ko.textureKey).toBe("battle_warrior_sword_ko_body");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath(`warrior-state-ko-mobile-${RUN_ID}.png`),
      fullPage: true,
    });
  });

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
    await closeShowcaseLoadout(page);

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

    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
      null,
      { timeout: 90_000 },
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "World",
    );
    const encounter = await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["slime", "goblin"], 2),
    );
    expect(encounter.error).toBeFalsy();
    expect(encounter.phase).toBe("combat");
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Battle",
    );
    const startingWarrior = await page.evaluate(
      () => window.__kithlandsTest.battleVisibilitySnapshot().partyMembers[0],
    );
    expect(startingWarrior.textureKey).toBe("battle_warrior_sword_attack_body");
    await page.screenshot({
      path: testInfo.outputPath(`warrior-starting-loadout-${RUN_ID}.png`),
      fullPage: true,
    });
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
    await closeShowcaseLoadout(page);

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
    expect(single.pickerOpen).toBe(true);
    await expect(page.locator(".battle-choice-panel")).toContainText(
      "Choose enemy",
    );
    await expect(
      page.getByRole("button", { name: "Iron Golem", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Gargoyle", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "All", exact: true }),
    ).toHaveCount(0);
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
    await closeShowcaseLoadout(page);
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
    await closeShowcaseLoadout(page);
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

  test("presents Inspire across all allies as one simultaneous beat", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
      null,
      { timeout: 90_000 },
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.startCustomGame({
        town_name: "Cadott, WI",
        people: [{ name: "Coach Bell", relation: "friendly" }],
        places: ["School", "Library", "Fire Hall"],
        big_building: "Town Hall",
        party: [
          { name: "Jack", class_id: "wayfarer" },
          { name: "Tank", class_id: "warrior" },
        ],
        difficulty: "normal",
      }),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["goblin", "slime"], 2),
    );
    const actions = await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("inspire"),
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: "ability",
        ability_id: "inspire",
        target_id: -1,
      }),
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return snapshot.groupCursors === 1 && snapshot.spellProjectiles >= 2;
    });
    const snapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(snapshot.groupTargetIndicatorLabel).toBe("ALL ALLIES");
    expect(snapshot.spellProjectiles).toBeGreaterThanOrEqual(2);
    await page.screenshot({
      path: testInfo.outputPath(`all-allies-simultaneous-${RUN_ID}.png`),
      fullPage: true,
    });
  });

  test("plays Warrior defend from an authoritative combat action", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
      null,
      { timeout: 90_000 },
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    const encounter = await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["slime", "goblin"], 2),
    );
    expect(encounter.error).toBeFalsy();
    expect(encounter.phase).toBe("combat");
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Battle",
    );

    const actions = await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("defend"),
    );
    expect(actions[0]).toMatchObject({ slot: 0, type: "defend" });
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().partyMembers[0]
          ?.battleState === "defend",
    );
    await page.screenshot({
      path: testInfo.outputPath(`warrior-authoritative-defend-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
