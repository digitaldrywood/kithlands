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

test.describe("Pyromancer layered Inferno battle slice", () => {
  test.describe.configure({ timeout: 120_000 });

  test("composes all six staff frames and presents all-enemy fire", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    let audit;
    for (let i = 0; i < 10; i++) {
      audit = await page.evaluate(() =>
        window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
      );
    }
    audit = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("equipment", 1),
    );
    expect(audit).toMatchObject({
      identityID: "pyromancer",
      equipmentType: "staff",
      layerAvailable: true,
      textureKey: "battle_pyromancer_staff_inferno_body",
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
        textureKey: "battle_pyromancer_staff_inferno_body",
        weaponTextureKey: "battle_weapon_war_staff",
      });
      await page.waitForTimeout(60);
      await captureBattleCanvas(
        page,
        testInfo.outputPath(
          `pyromancer-inferno-frame-${frameIndex}-${RUN_ID}.png`,
        ),
      );
    }

    for (let i = 0; i < 2; i++) {
      await page.evaluate(() =>
        window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
      );
    }
    await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("effect", 1),
    );
    const played = await page.evaluate(() =>
      window.__kithlandsTest.playBattleCharacterAudit(),
    );
    expect(played).toMatchObject({
      animationState: "cast_class_ability",
      effectMode: "all_enemies",
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
    expect(snapshot.groupTargetIndicatorLabel).toBe("ALL ENEMIES");
    await captureBattleCanvas(
      page,
      testInfo.outputPath(`pyromancer-all-enemies-inferno-${RUN_ID}.png`),
    );
  });
});
