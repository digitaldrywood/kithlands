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

test.describe("Shadow layered dagger veil-strike battle slice", () => {
  test.describe.configure({ timeout: 120_000 });

  test("composes and plays all six promoted dagger frames", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    let audit;
    for (let i = 0; i < 8; i++) {
      audit = await page.evaluate(() =>
        window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
      );
    }
    expect(audit).toMatchObject({
      identityID: "shadow",
      equipmentType: "dagger",
      layerAvailable: true,
      textureKey: "battle_shadow_dagger_veil_strike_body",
      weaponTextureKey: "battle_weapon_shadow_blade",
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
        textureKey: "battle_shadow_dagger_veil_strike_body",
        weaponTextureKey: "battle_weapon_shadow_blade",
      });
      await page.waitForTimeout(60);
      await captureBattleCanvas(
        page,
        testInfo.outputPath(`shadow-dagger-frame-${frameIndex}-${RUN_ID}.png`),
      );
    }

    const attack = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
    );
    expect(attack.animationState).toBe("physical_attack");
    await page.evaluate(() =>
      window.__kithlandsTest.playBattleCharacterAudit(),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().partyMembers[0]
          .battleFrameIndex > 0,
    );
    await captureBattleCanvas(
      page,
      testInfo.outputPath(`shadow-audit-veil-strike-${RUN_ID}.png`),
    );
  });
});
