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

async function selectCinderAudit(page) {
  let audit;
  for (let i = 0; i < 4; i++) {
    audit = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
    );
  }
  audit = await page.evaluate(() =>
    window.__kithlandsTest.cycleBattleCharacterAudit("equipment", 1),
  );
  expect(audit).toMatchObject({
    identityID: "cinder",
    equipmentType: "staff",
    layerAvailable: true,
    textureKey: "battle_cinder_staff_cast_body",
    weaponTextureKey: "battle_weapon_war_staff",
  });
  return audit;
}

test.describe("Cinder layered battle cast slice", () => {
  test.describe.configure({ timeout: 120_000 });

  test("composes every body-only cast frame with the shared staff", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    await selectCinderAudit(page);

    for (let frameIndex = 0; frameIndex < 6; frameIndex++) {
      const frame = await page.evaluate(
        (index) =>
          window.__kithlandsTest.previewBattleCharacterFrame("Hero", index),
        frameIndex,
      );
      expect(frame).toEqual({
        actorName: "Hero",
        frameIndex,
        textureKey: "battle_cinder_staff_cast_body",
        weaponTextureKey: "battle_weapon_war_staff",
      });
      await page.waitForTimeout(60);
      await captureBattleCanvas(
        page,
        testInfo.outputPath(`cinder-layered-frame-${frameIndex}-${RUN_ID}.png`),
      );
    }

    await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
    );
    const cast = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
    );
    expect(cast.animationState).toBe("cast_class_ability");
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
      testInfo.outputPath(`cinder-audit-cast-${RUN_ID}.png`),
    );
  });

  test("casts a real authoritative all-enemy spell", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    const actions = await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("all_spell"),
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: "spell",
        target_id: -1,
        target_mode: "all_enemies",
      }),
    );

    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      const cinder = snapshot.partyMembers.find(
        (member) => member.name === "Sparks",
      );
      return (
        cinder?.textureKey === "battle_cinder_staff_cast_body" &&
        cinder.battleFrameIndex > 0 &&
        snapshot.groupCursors === 1 &&
        snapshot.spellProjectiles >= 2
      );
    });
    const snapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(snapshot.groupTargetIndicatorLabel).toBe("ALL ENEMIES");
    await captureBattleCanvas(
      page,
      testInfo.outputPath(`cinder-authoritative-all-enemies-${RUN_ID}.png`),
    );
  });
});
