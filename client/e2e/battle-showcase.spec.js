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
    expect(state.equipment[0].weapon_id).toBe("sunforged_oathblade");
    expect(state.equipment[3].weapon_id).toBe("shadow_blade");

    const loadout = page.getByRole("dialog", { name: "Character" });
    await expect(loadout).toBeVisible();
    await expect(page.locator(".equipment-character")).toHaveText("Hero");
    await expect(page.locator(".equipment-slot")).toHaveCount(12);
    await expect(page.locator(".equipment-slot.is-socketed")).toHaveCount(12);
    const oathblade = page.locator('[data-slot-id="main_hand"]');
    await expect(
      oathblade.locator(".equipment-socket-pip.is-filled"),
    ).toHaveCount(2);
    await expect(oathblade).toHaveCSS("--socket-color", "#ff5c2a");
    await expect(oathblade).toHaveCSS("--socket-color-secondary", "#28a9ff");
    await page.screenshot({
      path: testInfo.outputPath(`systems-showcase-loadout-${RUN_ID}.png`),
      fullPage: true,
    });
    await oathblade.hover();
    await expect(oathblade.locator(".equipment-tooltip")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`systems-showcase-socket-glow-${RUN_ID}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(loadout).toHaveClass(/is-compact/);
    await expect(page.locator(".equipment-slot.is-socketed")).toHaveCount(12);
    await page.screenshot({
      path: testInfo.outputPath(
        `systems-showcase-loadout-mobile-${RUN_ID}.png`,
      ),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Close equipment" }).click();
    await expect(loadout).toBeHidden();

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
    expect(hero.textureKey).toBe("battle_warrior_sword_attack_body");
    expect(hero.weaponTextureKey).toBe("battle_weapon_mythril_sword");
    await page.screenshot({
      path: testInfo.outputPath(`systems-showcase-identity-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
