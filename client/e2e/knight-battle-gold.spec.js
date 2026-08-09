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

async function selectKnightAudit(page) {
  let audit;
  for (let i = 0; i < 6; i++) {
    audit = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
    );
  }
  expect(audit).toMatchObject({
    identityID: "knight",
    equipmentType: "sword",
    layerAvailable: true,
    supportsShield: true,
    textureKey: "battle_knight_sword_shield_defend_body",
    weaponTextureKey: "battle_weapon_mythril_sword",
    shieldTextureKey: "battle_off_hand_steel_shield",
  });
  return audit;
}

test.describe("Knight layered sword-and-shield defend slice", () => {
  test.describe.configure({ timeout: 120_000 });

  test("composes both item-driven attachments across all six body frames", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    await selectKnightAudit(page);

    for (let frameIndex = 0; frameIndex < 6; frameIndex++) {
      const frame = await page.evaluate(
        (index) =>
          window.__kithlandsTest.previewBattleCharacterFrame("Hero", index),
        frameIndex,
      );
      expect(frame).toEqual({
        actorName: "Hero",
        frameIndex,
        textureKey: "battle_knight_sword_shield_defend_body",
        weaponTextureKey: "battle_weapon_mythril_sword",
      });
      const snapshot = await page.evaluate(() =>
        window.__kithlandsTest.battleVisibilitySnapshot(),
      );
      expect(snapshot.partyMembers[0].shieldTextureKey).toBe(
        "battle_off_hand_steel_shield",
      );
      await page.waitForTimeout(60);
      await captureBattleCanvas(
        page,
        testInfo.outputPath(`knight-layered-frame-${frameIndex}-${RUN_ID}.png`),
      );
    }

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() =>
        window.__kithlandsTest.cycleBattleCharacterAudit("animation", 1),
      );
    }
    const audit = await page.evaluate(() =>
      window.__kithlandsTest.playBattleCharacterAudit(),
    );
    expect(audit.animationState).toBe("defend");
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().partyMembers[0]
          .battleFrameIndex > 0,
    );
    await captureBattleCanvas(
      page,
      testInfo.outputPath(`knight-audit-defend-${RUN_ID}.png`),
    );
  });
});
