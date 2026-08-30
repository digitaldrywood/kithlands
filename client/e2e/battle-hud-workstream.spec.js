import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

async function openShowcase(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
    null,
    { timeout: 90_000 },
  );
  await page.evaluate(() => window.__kithlandsTest.startShowcase());
  const closeEquipment = page.getByRole("button", {
    name: "Close equipment",
  });
  await closeEquipment.waitFor({ state: "visible" });
  await closeEquipment.click();
  await closeEquipment.waitFor({ state: "hidden" });
  await page.waitForFunction(() => {
    const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
    return (
      snapshot.partyStatusRowCount === 4 &&
      snapshot.actionPanelCount === 1 &&
      snapshot.messageWindow.text.includes("choose an action")
    );
  });
  return page.evaluate(() => window.__kithlandsTest.battleVisibilitySnapshot());
}

function overlap(a, b) {
  return !(
    a.right <= b.left ||
    b.right <= a.left ||
    a.bottom <= b.top ||
    b.bottom <= a.top
  );
}

test.describe("battle HUD workstream #270/#265", () => {
  test.describe.configure({ timeout: 120_000 });

  test("keeps command, history, and party status separate at desktop sizes", async ({
    page,
  }, testInfo) => {
    let snapshot = await openShowcase(page, { width: 800, height: 600 });
    expect(snapshot.hudLayoutMode).toBe("desktop");
    expect(snapshot.partyStatusRowCount).toBe(4);
    expect(snapshot.partyStatusConditions).toEqual(["OK", "OK", "OK", "OK"]);
    expect(
      overlap(snapshot.actionPanelBounds, snapshot.messageWindowBounds),
    ).toBe(false);
    expect(
      overlap(snapshot.messageWindowBounds, snapshot.partyStatusPanelBounds),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(`battle-idle-hud-800x600-${RUN_ID}.png`),
      fullPage: true,
    });

    const criticalState = await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("party_hit"),
    );
    expect(criticalState.partyStatusConditions[0]).toBe("CRITICAL");
    await page.screenshot({
      path: testInfo.outputPath(
        `battle-critical-hp-text-800x600-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    snapshot = await openShowcase(page, { width: 1280, height: 720 });
    expect(snapshot.hudLayoutMode).toBe("desktop");
    await page.screenshot({
      path: testInfo.outputPath(
        `battle-command-selection-1280x720-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("target_cursor"),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot()
          .targetIndicatorLabel === "TARGET",
    );
    await page.screenshot({
      path: testInfo.outputPath(
        `battle-target-selection-1280x720-${RUN_ID}.png`,
      ),
      fullPage: true,
    });
  });

  test("preserves spell, group-effect, and victory presentation", async ({
    page,
  }, testInfo) => {
    await openShowcase(page, { width: 1280, height: 720 });
    const picker = await page.evaluate(() =>
      window.__kithlandsTest.previewBattleSpellFlow("spark", false),
    );
    expect(picker.pickerOpen).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`battle-spell-menu-${RUN_ID}.png`),
      fullPage: true,
    });

    await openShowcase(page, { width: 1280, height: 720 });
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
    await page.screenshot({
      path: testInfo.outputPath(`battle-all-target-effect-${RUN_ID}.png`),
      fullPage: true,
    });

    await openShowcase(page, { width: 1280, height: 720 });
    const victory = await page.evaluate(() =>
      window.__kithlandsTest.forceVictory(),
    );
    expect(victory.phase).not.toBe("combat");
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Battle")
        .some((entry) => entry.text === "VICTORY!"),
    );
    const victorySnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(victorySnapshot.victoryReportPanelCount).toBe(1);
    expect(victorySnapshot.victoryRewardCardCount).toBe(3);
    expect(victorySnapshot.victoryPartyRowCount).toBe(4);
    expect(victorySnapshot.victorySpoilsPanelCount).toBe(1);
    await page.screenshot({
      path: testInfo.outputPath(`battle-victory-${RUN_ID}.png`),
      fullPage: true,
    });
  });

  test("uses the portrait mobile HUD arrangement", async ({
    page,
  }, testInfo) => {
    const snapshot = await openShowcase(page, { width: 390, height: 844 });
    expect(snapshot.hudLayoutMode).toBe("mobile");
    expect(snapshot.partyStatusRowCount).toBe(4);
    expect(
      overlap(snapshot.actionPanelBounds, snapshot.messageWindowBounds),
    ).toBe(false);
    expect(snapshot.partyStatusPanelBounds.top).toBeGreaterThan(
      snapshot.actionPanelBounds.bottom,
    );
    await page.screenshot({
      path: testInfo.outputPath(`battle-mobile-390x844-${RUN_ID}.png`),
      fullPage: true,
    });

    const criticalState = await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("party_hit"),
    );
    expect(criticalState.partyStatusConditions[0]).toBe("CRITICAL");
    await page.screenshot({
      path: testInfo.outputPath(
        `battle-critical-hp-text-mobile-390x844-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    await page.evaluate(() => window.__kithlandsTest.forceVictory());
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot()
          .victoryPartyRowCount === 4,
    );
    await page.screenshot({
      path: testInfo.outputPath(`battle-victory-mobile-390x844-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
