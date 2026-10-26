import { expect, test } from "@playwright/test";
import { runGoldSpellFlow } from "./battle-vfx-flow.js";
import {
  battleSnapshot,
  captureProofFrame,
  openShowcase,
  writeTrace,
} from "./battle-vfx-proof-helpers.js";

function expectPresentation(state, spellID, family, tier) {
  const spell = state.party
    .flatMap((member) => member.spells || [])
    .find((entry) => entry.id === spellID);
  expect(spell?.presentation).toEqual({
    effect_family: family,
    intensity_tier: tier,
  });
}

async function expectNoSave(page) {
  const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
  expect(saves.saves || []).toHaveLength(0);
}

test.describe("content-driven battle VFX gold slices", () => {
  test.describe.configure({ timeout: 120_000 });

  test("Fireball reads as a directed single-target fire sequence", async ({
    page,
  }, testInfo) => {
    const state = await openShowcase(page, { width: 1280, height: 720 });
    expectPresentation(state, "fireball", "fire", 2);
    const proof = await runGoldSpellFlow(page, testInfo, {
      mode: "fireball",
      family: "fire",
      tier: 2,
      side: "enemy",
      targetCount: 1,
      middleStage: "travel",
      label: "fireball-single-damage-desktop-1280x720",
    });
    expect(
      proof.trace.find((frame) => frame.label.endsWith("-impact")).snapshot
        .reticles,
    ).toBeGreaterThanOrEqual(1);
    await expectNoSave(page);
  });

  test("Blaze forms one simultaneous all-enemy fire beat", async ({
    page,
  }, testInfo) => {
    const state = await openShowcase(page, { width: 800, height: 600 });
    expectPresentation(state, "blaze", "fire", 3);
    const proof = await runGoldSpellFlow(page, testInfo, {
      mode: "blaze",
      family: "fire",
      tier: 3,
      side: "enemy",
      targetCount: 2,
      middleStage: "travel",
      label: "blaze-all-enemy-damage-800x600",
    });
    expect(
      proof.trace.find((frame) => frame.label.endsWith("-impact")).snapshot
        .groupCursors,
    ).toBe(1);
    await expectNoSave(page);
  });

  test("Cure forms a restorative field before one healing result", async ({
    page,
  }, testInfo) => {
    const state = await openShowcase(page, { width: 1280, height: 720 });
    expectPresentation(state, "cure", "restorative_light", 1);
    const proof = await runGoldSpellFlow(page, testInfo, {
      mode: "cure",
      family: "restorative_light",
      tier: 1,
      side: "party",
      targetCount: 1,
      middleStage: "field",
      label: "cure-single-healing-desktop-1280x720",
      vitals: [{ slot: 0, hp: 300 }],
    });
    expect(
      proof.trace.find((frame) => frame.label.endsWith("-impact")).snapshot
        .reticles,
    ).toBeGreaterThanOrEqual(1);
    await expectNoSave(page);
  });

  test("Heala forms one simultaneous all-party restorative field", async ({
    page,
  }, testInfo) => {
    const state = await openShowcase(page, { width: 390, height: 844 });
    expectPresentation(state, "heala", "restorative_light", 3);
    const proof = await runGoldSpellFlow(page, testInfo, {
      mode: "heala",
      family: "restorative_light",
      tier: 3,
      side: "party",
      targetCount: 4,
      middleStage: "field",
      label: "heala-all-party-healing-mobile-390x844",
      vitals: [300, 160, 250, 200].map((hp, slot) => ({ slot, hp })),
    });
    expect(
      proof.trace.find((frame) => frame.label.endsWith("-impact")).snapshot
        .groupCursors,
    ).toBe(1);
    await expectNoSave(page);
  });

  test("Mute retains its authored status release and recovery", async ({
    page,
  }, testInfo) => {
    const state = await openShowcase(page, { width: 800, height: 600 });
    const mute = state.party
      .flatMap((member) => member.spells || [])
      .find((spell) => spell.id === "mute");
    expect(mute?.presentation).toEqual({
      effect_family: "status_silence",
      intensity_tier: 1,
    });
    const trace = [
      {
        label: "before",
        capturedAt: Date.now(),
        snapshot: await battleSnapshot(page),
      },
    ];
    const actions = await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("mute"),
    );
    expect(actions).toContainEqual(
      expect.objectContaining({ type: "spell", spell_id: "mute" }),
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return (
        snapshot.messageWindow.text.includes("Mute") &&
        snapshot.spellProjectiles === 1
      );
    });
    const formation = await captureProofFrame(
      page,
      testInfo,
      trace,
      "mute-authored-status-800x600-formation",
    );
    expect(
      formation.battleEffects.some(
        (effect) => effect.family === "status_silence",
      ),
    ).toBe(true);
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.battleVisibilitySnapshot().spellProjectiles ===
        0,
    );
    await captureProofFrame(
      page,
      testInfo,
      trace,
      "mute-authored-status-800x600-result",
      { fullPage: true },
    );
    await writeTrace(testInfo, "mute-authored-status-800x600", trace);
    await expectNoSave(page);
  });

  test("reduced motion preserves Fireball stages without a cinematic", async ({
    page,
  }, testInfo) => {
    await openShowcase(page, {
      width: 800,
      height: 600,
      reducedMotion: "reduce",
    });
    const proof = await runGoldSpellFlow(page, testInfo, {
      mode: "fireball",
      family: "fire",
      tier: 2,
      side: "enemy",
      targetCount: 1,
      middleStage: "travel",
      label: "fireball-reduced-motion-800x600",
      reducedMotion: true,
    });
    expect(
      proof.trace.every((frame) => frame.snapshot.majorCinematics === 0),
    ).toBe(true);
    const reducedTravel = proof.trace
      .find((frame) => frame.label.endsWith("-travel"))
      .snapshot.battleEffects.find((effect) => effect.stage === "travel");
    const reducedImpact = proof.trace
      .find((frame) => frame.label.endsWith("-impact"))
      .snapshot.battleEffects.find((effect) => effect.stage === "impact");
    expect(reducedTravel.x).toBeCloseTo(reducedImpact.x, 1);
    expect(reducedTravel.y).toBeCloseTo(reducedImpact.y, 1);
    expect(
      Math.max(
        ...proof.trace.map((frame) => frame.snapshot.battleEffects.length),
      ),
    ).toBeLessThanOrEqual(2);
    await expectNoSave(page);
  });
});
