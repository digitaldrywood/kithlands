import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const RUN_ID = Date.now();

async function captureBattleCanvas(page, path) {
  const dataURL = await page.evaluate(() =>
    window.__kithlandsTest.captureBattleCanvas(),
  );
  await writeFile(path, Buffer.from(dataURL.split(",")[1], "base64"));
}

async function openShowcase(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
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
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.battleVisibilitySnapshot().battleCharacterAudit
        ?.identityCount === 12,
  );
}

test.describe("Sage layered Sanctuary battle slice", () => {
  test.describe.configure({ timeout: 120_000 });

  test("composes all six staff frames and presents all-party healing", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    let audit;
    for (let i = 0; i < 9; i++) {
      audit = await page.evaluate(() =>
        window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
      );
    }
    expect(audit).toMatchObject({
      identityID: "sage",
      equipmentType: "staff",
      layerAvailable: true,
      textureKey: "battle_sage_staff_sanctuary_body",
      weaponTextureKey: "battle_weapon_war_staff",
      shieldTextureKey: null,
    });

    for (let frameIndex = 0; frameIndex < 6; frameIndex++) {
      const frame = await page.evaluate(
        (index) =>
          window.__kithlandsTest.previewBattleCharacterFrame("Hero", index),
        frameIndex,
      );
      expect(frame).toEqual({
        actorName: "Hero",
        frameIndex,
        textureKey: "battle_sage_staff_sanctuary_body",
        weaponTextureKey: "battle_weapon_war_staff",
      });
      await page.waitForTimeout(60);
      await captureBattleCanvas(
        page,
        testInfo.outputPath(`sage-sanctuary-frame-${frameIndex}-${RUN_ID}.png`),
      );
    }

    for (let i = 0; i < 2; i++) {
      await page.evaluate(() =>
        window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
      );
    }
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() =>
        window.__kithlandsTest.cycleBattleCharacterAudit("effect", 1),
      );
    }
    const played = await page.evaluate(() =>
      window.__kithlandsTest.playBattleCharacterAudit(),
    );
    expect(played).toMatchObject({
      animationState: "cast_class_ability",
      effectMode: "all_allies",
    });
    await page.evaluate(() =>
      window.__kithlandsTest.previewBattleCharacterFrame("Hero", 4),
    );
    await page.waitForTimeout(80);
    const snapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(snapshot.groupCursors).toBe(1);
    expect(snapshot.spellImpacts).toBeGreaterThanOrEqual(2);
    expect(snapshot.groupTargetIndicatorLabel).toBe("ALL ALLIES");
    await captureBattleCanvas(
      page,
      testInfo.outputPath(`sage-all-allies-sanctuary-${RUN_ID}.png`),
    );
  });
});
