import { expect } from "@playwright/test";
import {
  battleSnapshot,
  captureProofFrame,
  waitForEffectStage,
  writeTrace,
} from "./battle-vfx-proof-helpers.js";

function hpValues(snapshot, side) {
  const members =
    side === "party" ? snapshot.partyMembers : snapshot.enemyMembers;
  return members.map(({ name, currentHP }) => [name, currentHP]);
}

export async function runGoldSpellFlow(
  page,
  testInfo,
  {
    mode,
    family,
    tier,
    side,
    targetCount,
    middleStage,
    label,
    vitals,
    reducedMotion = false,
  },
) {
  if (vitals) {
    const state = await page.evaluate(
      (updates) => window.__kithlandsTest.setPartyVitals(updates),
      vitals,
    );
    expect(
      state.party.filter((_, slot) => vitals.some((v) => v.slot === slot)),
    ).toHaveLength(vitals.length);
  }
  const trace = [];
  const before = await battleSnapshot(page);
  trace.push({ label: "before", capturedAt: Date.now(), snapshot: before });
  const actions = await page.evaluate(
    (spellMode) =>
      window.__kithlandsTest.startAuthoritativeBattleRound(spellMode),
    mode,
  );
  expect(actions).toContainEqual(
    expect.objectContaining({ type: "spell", spell_id: mode }),
  );

  await waitForEffectStage(page, family, "release");
  await page.waitForTimeout(reducedMotion ? 15 : 40);
  const release = await captureProofFrame(
    page,
    testInfo,
    trace,
    `${label}-release`,
  );
  expect(
    release.battleEffects.find((effect) => effect.family === family)?.tier,
  ).toBe(tier);

  await waitForEffectStage(page, family, middleStage, targetCount);
  await page.waitForTimeout(
    middleStage === "travel" ? (reducedMotion ? 35 : 150) : 80,
  );
  await captureProofFrame(page, testInfo, trace, `${label}-${middleStage}`);
  await waitForEffectStage(page, family, "impact", targetCount);
  const impact = await captureProofFrame(
    page,
    testInfo,
    trace,
    `${label}-impact`,
  );
  expect(
    impact.battleEffects.filter(
      (effect) => effect.family === family && effect.stage === "impact",
    ),
  ).toHaveLength(targetCount);
  expect(impact.majorCinematics).toBe(0);

  const impactHP = JSON.stringify(hpValues(impact, side));
  await page.waitForFunction(
    ({ effectFamily, targetSide, initialHP }) => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      const members =
        targetSide === "party" ? snapshot.partyMembers : snapshot.enemyMembers;
      const renderedHP = JSON.stringify(
        members.map(({ name, currentHP }) => [name, currentHP]),
      );
      return (
        !snapshot.battleEffects.some(
          (effect) => effect.family === effectFamily,
        ) && renderedHP !== initialHP
      );
    },
    { effectFamily: family, targetSide: side, initialHP: impactHP },
  );
  const result = await captureProofFrame(
    page,
    testInfo,
    trace,
    `${label}-result`,
    { fullPage: true },
  );
  expect(JSON.stringify(hpValues(result, side))).not.toBe(impactHP);
  if (reducedMotion) expect(result.majorCinematics).toBe(0);
  await writeTrace(testInfo, label, trace);
  return { before, result, trace };
}
