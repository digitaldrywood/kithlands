import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const IDENTITY_IDS = [
  "warrior",
  "brawler",
  "rogue",
  "mender",
  "cinder",
  "wayfarer",
  "knight",
  "champion",
  "shadow",
  "sage",
  "pyromancer",
  "wanderer",
];

async function openAudit(page) {
  await page.goto("/");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
    null,
    { timeout: 90_000 },
  );
  await page.evaluate(() => window.__kithlandsTest.startShowcase());
  await page.waitForFunction(() => {
    const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
    return snapshot.battleCharacterAudit?.identityCount === 12;
  });
  return page.evaluate(() => window.__kithlandsTest.battleVisibilitySnapshot());
}

test.describe("server-authorized battle character audit", () => {
  test.describe.configure({ timeout: 120_000 });

  test("cycles every class, equipment family, animation state, and effect scope", async ({
    page,
  }, testInfo) => {
    const initial = await openAudit(page);
    const audit = initial.battleCharacterAudit;
    expect(audit.identityIDs).toEqual(IDENTITY_IDS);
    expect(new Set(audit.equipmentTypes)).toEqual(
      new Set(["sword", "axe", "hammer", "unarmed", "dagger", "bow", "staff"]),
    );
    expect(audit.animationStates).toEqual([
      "idle_guard",
      "physical_attack",
      "cast_class_ability",
      "defend",
      "hit_reaction",
      "item_use",
      "victory",
      "ko_defeated",
    ]);
    expect(audit.effectModes).toEqual([
      "single_target",
      "all_enemies",
      "all_allies",
    ]);
    expect(audit.textureKey).toBe("battle_warrior_sword_attack_body");
    expect(audit.weaponTextureKey).toBe("battle_weapon_mythril_sword");

    const visited = [audit.identityID];
    for (let i = 1; i < IDENTITY_IDS.length; i++) {
      const next = await page.evaluate(() =>
        window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
      );
      visited.push(next.identityID);
    }
    expect(visited).toEqual(IDENTITY_IDS);
    const wrapped = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
    );
    expect(wrapped.identityID).toBe("warrior");

    const animationVisited = [wrapped.animationState];
    for (let i = 1; i < wrapped.animationStates.length; i++) {
      const next = await page.evaluate(() =>
        window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
      );
      animationVisited.push(next.animationState);
    }
    expect(animationVisited).toEqual(wrapped.animationStates);
    await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleCharacterAudit(),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().partyMembers[0]
          .battleFrameIndex > 0,
    );
    await page.screenshot({
      path: testInfo.outputPath(
        `battle-character-audit-warrior-physical-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("effect", 1),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleCharacterAudit(),
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return snapshot.groupCursors === 1 && snapshot.spellImpacts >= 2;
    });
    await page.screenshot({
      path: testInfo.outputPath(
        `battle-character-audit-all-enemies-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    const allAllies = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("effect", 1),
    );
    expect(allAllies.effectMode).toBe("all_allies");
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleCharacterAudit(),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot()
          .groupTargetIndicatorLabel === "ALL ALLIES",
    );

    const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
    expect(saves.saves || []).toHaveLength(0);
  });
});
