import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const IDENTITY_IDS = [
  "warrior",
  "brawler",
  "rogue",
  "mender",
  "cinder",
  "wayfarer",
  "knight",
  "champion",
  "shadow",
  "sage",
  "pyromancer",
  "wanderer",
];
const STATE_IDS = [
  "idle_guard",
  "physical_attack",
  "cast_class_ability",
  "defend",
  "hit_reaction",
  "item_use",
  "victory",
  "ko_defeated",
];
const PROOF_FRAME = {
  idle_guard: 0,
  physical_attack: 3,
  cast_class_ability: 3,
  defend: 2,
  hit_reaction: 2,
  item_use: 2,
  victory: 2,
  ko_defeated: -1,
};

async function openAudit(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
    null,
    { timeout: 90_000 },
  );
  await page.evaluate(() => window.__kithlandsTest.startShowcase());
  const loadout = page.getByRole("dialog", { name: "Character" });
  await expect(loadout).toBeVisible();
  await page.getByRole("button", { name: "Close equipment" }).click();
  await expect(loadout).toBeHidden();
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.battleVisibilitySnapshot().battleCharacterAudit
        ?.identityCount === 12,
  );
  return page.evaluate(() => window.__kithlandsTest.battleVisibilitySnapshot());
}

async function selectLayeredEquipment(page, identityID) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const audit = await page.evaluate(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().battleCharacterAudit,
    );
    if (
      audit.identityID === identityID &&
      audit.layerAvailable &&
      audit.textureKey?.includes(`battle_${identityID}_`)
    ) {
      return audit;
    }
    await page.evaluate(() =>
      window.__kithlandsTest.cycleBattleCharacterAudit("equipment", 1),
    );
  }
  throw new Error(`No layered equipment option found for ${identityID}`);
}

test.describe("all-class battle state contract", () => {
  test.describe.configure({ timeout: 240_000 });

  test("renders and plays all eight states for all twelve identities", async ({
    page,
  }, testInfo) => {
    const initial = await openAudit(page);
    const actorName = initial.partyMembers[0].name;
    expect(initial.battleCharacterAudit.identityIDs).toEqual(IDENTITY_IDS);
    expect(initial.battleCharacterAudit.animationStates).toEqual(STATE_IDS);

    for (const [identityIndex, identityID] of IDENTITY_IDS.entries()) {
      const audit = await selectLayeredEquipment(page, identityID);
      expect(audit.identityID).toBe(identityID);
      expect(audit.layerAvailable, identityID).toBe(true);
      expect(audit.availableStates, identityID).toEqual(STATE_IDS);

      for (const stateID of STATE_IDS) {
        const preview = await page.evaluate(
          ({ actor, state, frame }) =>
            window.__kithlandsTest.previewBattleCharacterStateFrame(
              actor,
              state,
              frame,
            ),
          { actor: actorName, state: stateID, frame: PROOF_FRAME[stateID] },
        );
        expect(preview.stateID, `${identityID}/${stateID}`).toBe(stateID);
        expect(preview.textureKey, `${identityID}/${stateID}`).toContain(
          `battle_${identityID}_`,
        );
        if (stateID === "item_use") {
          expect(
            preview.attachments.every(
              (layer) => !layer.backVisible && !layer.frontVisible,
            ),
            `${identityID}/item_use equipment visibility`,
          ).toBe(true);
        }
        if (stateID === "ko_defeated") {
          expect(preview.bodyAngle, `${identityID}/ko_defeated`).toBe(90);
        }

        await page.screenshot({
          path: testInfo.outputPath(
            `all-class-${identityID}-${stateID}-desktop-${RUN_ID}.png`,
          ),
          fullPage: true,
        });

        const completed = await page.evaluate(
          ({ actor, state }) =>
            window.__kithlandsTest.playBattleCharacterState(actor, state),
          { actor: actorName, state: stateID },
        );
        if (stateID === "ko_defeated") {
          expect(completed.stateID, `${identityID}/${stateID} hold`).toBe(
            "ko_defeated",
          );
          expect(completed.bodyAngle, `${identityID}/${stateID} hold`).toBe(90);
        } else {
          expect(completed.stateID, `${identityID}/${stateID} reset`).toBe(
            "idle_guard",
          );
        }
      }

      if (identityIndex < IDENTITY_IDS.length - 1) {
        const next = await page.evaluate(() =>
          window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
        );
        expect(next.identityID).toBe(IDENTITY_IDS[identityIndex + 1]);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    for (const [identityIndex, identityID] of IDENTITY_IDS.entries()) {
      if (identityIndex === 0) {
        const wrapped = await page.evaluate(() =>
          window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
        );
        expect(wrapped.identityID).toBe("warrior");
      } else {
        const next = await page.evaluate(() =>
          window.__kithlandsTest.cycleBattleCharacterAudit("identity", 1),
        );
        expect(next.identityID).toBe(identityID);
      }
      await selectLayeredEquipment(page, identityID);
      const ko = await page.evaluate(
        ({ actor }) =>
          window.__kithlandsTest.previewBattleCharacterStateFrame(
            actor,
            "ko_defeated",
            -1,
          ),
        { actor: actorName },
      );
      expect(ko.bodyAngle, `${identityID}/portrait KO`).toBe(90);
      await page.screenshot({
        path: testInfo.outputPath(
          `all-class-${identityID}-ko-defeated-portrait-${RUN_ID}.png`,
        ),
        fullPage: true,
      });
    }
  });
});
