import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

test.describe("developer systems showcase", () => {
  test.describe.configure({ timeout: 90_000 });

  test("opens a representative loadout with unambiguous combat roles", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
      null,
      { timeout: 90_000 },
    );

    const titleLabels = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Title").map((entry) => entry.text),
    );
    expect(titleLabels).toContain("[ SYSTEMS SHOWCASE ]");
    expect(titleLabels).not.toContain("[ PLAY NOW - skip login ]");
    await page.screenshot({
      path: testInfo.outputPath(`systems-showcase-title-${RUN_ID}.png`),
      fullPage: true,
    });

    const state = await page.evaluate(() =>
      window.__kithlandsTest.startShowcase(),
    );
    expect(state.showcase_mode).toBe(true);
    expect(state.phase).toBe("combat");
    expect(new Set(state.enemies.map((enemy) => enemy.id)).size).toBe(
      state.enemies.length,
    );
    expect(state.party).toHaveLength(4);
    expect(state.party.every((member) => member.level === 12)).toBe(true);
    expect(state.party[1].spells.map((spell) => spell.id)).toEqual(
      expect.arrayContaining(["spark", "fireball", "blaze"]),
    );
    expect(state.party[2].spells.map((spell) => spell.id)).toEqual(
      expect.arrayContaining(["cure", "cura", "aegis"]),
    );
    expect(state.party[3].abilities).toContain("backstab");
    expect(state.equipment[0].weapon_id).toBe("mythril_sword");
    expect(state.equipment[3].weapon_id).toBe("shadow_blade");

    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return (
        snapshot.showcaseBannerCount === 1 &&
        snapshot.actorCursors === 1 &&
        snapshot.partyMembers.length === 4
      );
    });
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("target_cursor"),
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return snapshot.actorCursors === 1 && snapshot.cursors === 1;
    });
    const targetingSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(targetingSnapshot.actorIndicatorLabel).toBe("ACTING");
    expect(targetingSnapshot.targetIndicatorLabel).toBe("TARGET");
    expect(targetingSnapshot.enemyMembers).toHaveLength(2);
    expect(targetingSnapshot.targetIndicatorX).toBe(
      targetingSnapshot.enemyMembers.find(
        (enemy) => enemy.name === "Iron Golem",
      ).x,
    );
    await page.screenshot({
      path: testInfo.outputPath(`systems-showcase-targeting-${RUN_ID}.png`),
      fullPage: true,
    });

    const actions = await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("attack"),
    );
    expect(actions.every((action) => action.type === "attack")).toBe(true);
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return (
        snapshot.titleActors.includes("HERO") &&
        snapshot.messageWindow.text.includes("attacks")
      );
    });
    const attackSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    const hero = attackSnapshot.partyMembers.find(
      (member) => member.name === "Hero",
    );
    expect(hero.textureKey).toBe("warrior");
    await page.screenshot({
      path: testInfo.outputPath(`systems-showcase-identity-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
