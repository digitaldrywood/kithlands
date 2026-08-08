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

async function selectMenderAudit(page) {
  let audit;
  for (let i = 0; i < 3; i++) {
    audit = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
    );
  }
  expect(audit).toMatchObject({
    identityID: "mender",
    equipmentType: "staff",
    layerAvailable: true,
    textureKey: "battle_mender_staff_cast_body",
    weaponTextureKey: "battle_weapon_war_staff",
  });
  return audit;
}

test.describe("Mender layered battle gold slice", () => {
  test.describe.configure({ timeout: 120_000 });

  test("shows every equipment-free body frame with the shared staff layer", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    await selectMenderAudit(page);

    for (let frameIndex = 0; frameIndex < 6; frameIndex++) {
      const frame = await page.evaluate(
        (index) =>
          window.__kithlandsTest.previewBattleCharacterFrame("Hero", index),
        frameIndex,
      );
      expect(frame).toEqual({
        actorName: "Hero",
        frameIndex,
        textureKey: "battle_mender_staff_cast_body",
        weaponTextureKey: "battle_weapon_war_staff",
      });
      await page.waitForTimeout(60);
      await captureBattleCanvas(
        page,
        testInfo.outputPath(`mender-layered-frame-${frameIndex}-${RUN_ID}.png`),
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
    await page.waitForTimeout(60);
    await captureBattleCanvas(
      page,
      testInfo.outputPath(`mender-audit-cast-${RUN_ID}.png`),
    );
  });

  test("casts an authoritative simultaneous all-party heal without a save", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    const vitals = await page.evaluate(() =>
      window.__kithlandsTest.setPartyVitals([
        { slot: 0, hp: 1 },
        { slot: 1, hp: 1 },
        { slot: 2, hp: 1 },
        { slot: 3, hp: 1 },
      ]),
    );
    expect(vitals.party.every((member) => member.hp === 1)).toBe(true);

    const actions = await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("all_heal"),
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: "spell",
        spell_id: "heala",
        target_id: -1,
        target_mode: "all_allies",
      }),
    );

    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      const mender = snapshot.partyMembers.find(
        (member) => member.name === "Mercy",
      );
      return (
        mender?.textureKey === "battle_mender_staff_cast_body" &&
        mender.battleFrameIndex > 0 &&
        snapshot.groupCursors === 1 &&
        snapshot.spellProjectiles >= 2
      );
    });
    const snapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(snapshot.groupTargetIndicatorLabel).toBe("ALL ALLIES");
    await captureBattleCanvas(
      page,
      testInfo.outputPath(`mender-authoritative-all-party-heal-${RUN_ID}.png`),
    );

    const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
    expect(saves.saves || []).toHaveLength(0);
  });
});
