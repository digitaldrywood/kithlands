import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startCombat(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Title",
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.forceEncounter(["slime", "goblin"], 2),
  );
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.activeSceneKey() === "Battle" &&
      !!window.__kithlandsTest.gameState("Battle")?.enemies?.length,
  );
}

async function setProofLabel(page, label) {
  await page.evaluate((nextLabel) => {
    const existing = document.getElementById("battle-cinematic-proof");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "battle-cinematic-proof";
    panel.style.position = "fixed";
    panel.style.top = "8px";
    panel.style.left = "8px";
    panel.style.zIndex = "9999";
    panel.style.background = "rgba(15, 23, 42, 0.92)";
    panel.style.color = "#e2e8f0";
    panel.style.padding = "10px 12px";
    panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
    panel.style.borderRadius = "8px";
    panel.style.fontFamily = "monospace";
    panel.style.fontSize = "12px";
    panel.textContent = nextLabel;
    document.body.appendChild(panel);
  }, label);
}

test.describe("battle cinematic proof — issue #211", () => {
  test("shows the message window, cursor, and cinematic pacing", async ({
    page,
  }, testInfo) => {
    await startCombat(page);

    await setProofLabel(page, "Before: battle idle");
    await page.screenshot({
      path: testInfo.outputPath(`battle-cinematic-before-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("message_window"),
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return (
        snapshot.messageWindow?.visible &&
        snapshot.messageWindow?.text?.includes("attacks")
      );
    });
    const messageSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(messageSnapshot.messageWindow.visible).toBe(true);
    expect(messageSnapshot.messageWindow.text).toContain("attacks");

    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("target_cursor"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.battleVisibilitySnapshot().cursors > 0,
    );
    const cursorSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(cursorSnapshot.cursors).toBeGreaterThan(0);

    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("cinematic_frame"),
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return (
        snapshot.messageWindow?.text?.includes("attacks") &&
        snapshot.cursors > 0 &&
        snapshot.titleCards > 0
      );
    });

    await setProofLabel(page, "After: cinematic pre-impact hold");
    await page.screenshot({
      path: testInfo.outputPath(`battle-cinematic-after-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.waitForTimeout(1400);
    const timings = await page.evaluate(async () => {
      const startedAt = performance.now();
      const beat =
        await window.__kithlandsTest.playBattleVisibilityDemo("cinematic");
      return {
        ...beat,
        elapsed: performance.now() - startedAt,
      };
    });
    expect(timings.preImpact).toBeGreaterThanOrEqual(260);
    expect(timings.postDamage).toBeGreaterThanOrEqual(430);
    expect(timings.total).toBeGreaterThanOrEqual(1100);
    expect(timings.elapsed).toBeGreaterThanOrEqual(1100);
  });

  test("makes hero and monster attackers enter the action", async ({
    page,
  }, testInfo) => {
    await startCombat(page);
    const heroBefore = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("cinematic_frame"),
    );
    const heroStrike = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );

    expect(heroStrike.titleActors).toContain(
      heroBefore.partyMembers[0].name.toUpperCase(),
    );
    expect(heroStrike.titleActions).toContain("SLASH");
    expect(heroStrike.partyMembers[0].spriteX).toBeLessThan(
      heroBefore.partyMembers[0].spriteX - 120,
    );
    await setProofLabel(page, "Hero strike: actor leap + named action");
    await page.screenshot({
      path: testInfo.outputPath(`battle-hero-strike-${RUN_ID}.png`),
      fullPage: true,
    });

    await startCombat(page);
    const enemyBefore = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("enemy_attack_frame"),
    );
    const enemyStrike = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );

    expect(enemyStrike.titleActors).toContain(
      enemyBefore.enemyMembers[0].name.toUpperCase(),
    );
    expect(enemyStrike.titleActions).toContain("ATTACK");
    expect(enemyStrike.enemyMembers[0].spriteX).toBeGreaterThan(
      enemyBefore.enemyMembers[0].spriteX + 120,
    );
    await setProofLabel(page, "Monster strike: actor leap + named action");
    await page.screenshot({
      path: testInfo.outputPath(`battle-monster-strike-${RUN_ID}.png`),
      fullPage: true,
    });

    await startCombat(page);
    const reducedBefore = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("reduced_attack_frame"),
    );
    const reducedStrike = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(
      Math.abs(
        reducedStrike.partyMembers[0].spriteX -
          reducedBefore.partyMembers[0].spriteX,
      ),
    ).toBeLessThanOrEqual(14);
    expect(reducedStrike.titleActors).toContain("HERO");
  });

  test("shows the caster, spell charge, and travel path", async ({
    page,
  }, testInfo) => {
    await startCombat(page);
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("spell_charge_frame"),
    );
    const charge = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(charge.castAuras).toBeGreaterThan(0);
    expect(charge.titleActors).toContain("SPARKS");
    expect(charge.titleActions).toContain("SPARK");
    await setProofLabel(page, "Spell charge: named caster + local aura");
    await page.screenshot({
      path: testInfo.outputPath(`battle-spell-charge-${RUN_ID}.png`),
      fullPage: true,
    });

    await startCombat(page);
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("spell_flight_frame"),
    );
    const flight = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(flight.spellProjectiles).toBeGreaterThan(0);
    expect(flight.spellTrails).toBeGreaterThan(0);
    expect(flight.titleActors).toContain("SPARKS");
    await setProofLabel(page, "Spell flight: caster-to-target projectile");
    await page.screenshot({
      path: testInfo.outputPath(`battle-spell-flight-${RUN_ID}.png`),
      fullPage: true,
    });
  });

  test("plays the choreography from an authoritative combat round", async ({
    page,
  }, testInfo) => {
    await startCombat(page);
    const actions = await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("spell"),
    );
    expect(actions.some((action) => action.type === "spell")).toBe(true);
    await page.waitForFunction(
      () => {
        const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
        return (
          snapshot.spellProjectiles > 0 &&
          snapshot.titleActors.length > 0 &&
          snapshot.messageWindow.text.includes("casts")
        );
      },
      null,
      { timeout: 30_000 },
    );
    const liveRound = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(liveRound.titleActions).toContain("SPARK");
    await setProofLabel(
      page,
      "Authoritative round: server result -> spell motion",
    );
    await page.screenshot({
      path: testInfo.outputPath(`battle-authoritative-spell-${RUN_ID}.png`),
      fullPage: true,
    });
  });

  test("keeps the spell action readable in a mobile viewport", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startCombat(page);
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("spell_flight_frame"),
    );
    const flight = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(flight.spellProjectiles).toBeGreaterThan(0);
    expect(flight.titleActors).toContain("SPARKS");
    expect(flight.titleActions).toContain("SPARK");
    await setProofLabel(page, "Mobile spell flight: named caster + target");
    await page.screenshot({
      path: testInfo.outputPath(`battle-spell-mobile-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
