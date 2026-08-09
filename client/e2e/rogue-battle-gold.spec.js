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
  expect(
    state.party.find((member) => member.name === "Shade")?.composition,
  ).toMatchObject({
    base_sprite: "rogue",
    weapon_visual_id: "shadow_blade",
    weapon_animation_set: "dagger",
  });
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.battleVisibilitySnapshot().battleCharacterAudit
        ?.identityCount === 12,
  );
}

async function selectRogueAudit(page) {
  let audit;
  for (let i = 0; i < 2; i++) {
    audit = await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
    );
  }
  expect(audit).toMatchObject({
    identityID: "rogue",
    equipmentType: "dagger",
    layerAvailable: true,
    textureKey: "battle_rogue_dagger_slash_body",
    weaponTextureKey: "battle_weapon_shadow_blade",
  });
  return audit;
}

test.describe("Rogue layered dagger battle slice", () => {
  test.describe.configure({ timeout: 120_000 });

  test("composes every body-only slash frame with Shadow Blade", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    await selectRogueAudit(page);

    for (let frameIndex = 0; frameIndex < 6; frameIndex++) {
      const frame = await page.evaluate(
        (index) =>
          window.__kithlandsTest.previewBattleCharacterFrame("Hero", index),
        frameIndex,
      );
      expect(frame).toEqual({
        actorName: "Hero",
        frameIndex,
        textureKey: "battle_rogue_dagger_slash_body",
        weaponTextureKey: "battle_weapon_shadow_blade",
      });
      await page.waitForTimeout(60);
      await captureBattleCanvas(
        page,
        testInfo.outputPath(`rogue-layered-frame-${frameIndex}-${RUN_ID}.png`),
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
      testInfo.outputPath(`rogue-audit-attack-${RUN_ID}.png`),
    );
  });

  test("uses the same layered body in an authoritative Shade attack", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    await page.waitForFunction(() => {
      const shade = window.__kithlandsTest
        .battleVisibilitySnapshot()
        .partyMembers.find((member) => member.name === "Shade");
      return (
        shade?.textureKey === "battle_rogue_dagger_slash_body" &&
        shade.weaponTextureKey === "battle_weapon_shadow_blade"
      );
    });
    await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("attack"),
    );
    await page.waitForFunction(() => {
      const shade = window.__kithlandsTest
        .battleVisibilitySnapshot()
        .partyMembers.find((member) => member.name === "Shade");
      return shade?.battleFrameIndex > 0;
    });
    await captureBattleCanvas(
      page,
      testInfo.outputPath(`rogue-authoritative-attack-${RUN_ID}.png`),
    );
  });
});
