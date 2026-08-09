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

async function selectWayfarerStaffAudit(page) {
  let audit;
  for (let i = 0; i < 5; i++) {
    audit = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
    );
  }
  for (let i = 0; i < 4; i++) {
    audit = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("equipment", 1),
    );
  }
  expect(audit).toMatchObject({
    identityID: "wayfarer",
    equipmentType: "staff",
    layerAvailable: true,
    textureKey: "battle_wayfarer_staff_inspire_body",
    weaponTextureKey: "battle_weapon_war_staff",
  });
  return audit;
}

test.describe("Wayfarer layered Inspire battle slice", () => {
  test.describe.configure({ timeout: 120_000 });

  test("composes all rally frames and presents the all-party effect", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    await selectWayfarerStaffAudit(page);

    for (let frameIndex = 0; frameIndex < 6; frameIndex++) {
      const frame = await page.evaluate(
        (index) =>
          window.__kithlandsTest.previewBattleCharacterFrame("Hero", index),
        frameIndex,
      );
      expect(frame).toEqual({
        actorName: "Hero",
        frameIndex,
        textureKey: "battle_wayfarer_staff_inspire_body",
        weaponTextureKey: "battle_weapon_war_staff",
      });
      await page.waitForTimeout(60);
      await captureBattleCanvas(
        page,
        testInfo.outputPath(
          `wayfarer-layered-frame-${frameIndex}-${RUN_ID}.png`,
        ),
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
    const audit = await page.evaluate(() =>
      window.__kithlandsTest.playBattleCharacterAudit(),
    );
    expect(audit).toMatchObject({
      animationState: "cast_class_ability",
      effectMode: "all_allies",
    });
    await page.evaluate(() =>
      window.__kithlandsTest.previewBattleCharacterFrame("Hero", 3),
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
      testInfo.outputPath(`wayfarer-all-allies-inspire-${RUN_ID}.png`),
    );
  });
});
