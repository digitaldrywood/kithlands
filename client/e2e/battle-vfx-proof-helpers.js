import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

export const RUN_ID = Date.now();

export async function captureBattleCanvas(page, path) {
  const dataURL = await page.evaluate(() =>
    window.__kithlandsTest.captureBattleCanvas(),
  );
  await writeFile(path, Buffer.from(dataURL.split(",")[1], "base64"));
}

export async function openShowcase(
  page,
  { width, height, reducedMotion = "no-preference" },
) {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width, height });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/");
    try {
      await page.waitForFunction(
        () => window.__kithlandsTest?.activeSceneKey() === "Title",
        null,
        { timeout: 15_000 },
      );
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  const state = await page.evaluate(() =>
    window.__kithlandsTest.startShowcase(),
  );
  expect(state.showcase_mode).toBe(true);
  expect(state.phase).toBe("combat");
  const loadout = page.getByRole("dialog", { name: "Character" });
  await expect(loadout).toBeVisible();
  await expect(page.locator(".equipment-slot")).toHaveCount(12);
  await page.getByRole("button", { name: "Close equipment" }).click();
  await expect(loadout).toBeHidden();
  await page.waitForFunction(() => {
    const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
    return (
      snapshot.partyMembers.length === 4 && snapshot.enemyMembers.length > 0
    );
  });
  return state;
}

export async function battleSnapshot(page) {
  return page.evaluate(() => window.__kithlandsTest.battleVisibilitySnapshot());
}

export async function waitForEffectStage(page, family, stage, minimum = 1) {
  await page.waitForFunction(
    ({ effectFamily, effectStage, minimumCount }) => {
      const effects =
        window.__kithlandsTest.battleVisibilitySnapshot().battleEffects;
      return (
        effects.filter(
          (entry) =>
            entry.family === effectFamily && entry.stage === effectStage,
        ).length >= minimumCount
      );
    },
    { effectFamily: family, effectStage: stage, minimumCount: minimum },
  );
}

export async function captureProofFrame(
  page,
  testInfo,
  trace,
  label,
  { fullPage = false } = {},
) {
  const snapshot = await battleSnapshot(page);
  trace.push({ label, capturedAt: Date.now(), snapshot });
  const suffix = `${label}-${RUN_ID}.png`;
  if (fullPage) {
    await page.screenshot({
      path: testInfo.outputPath(suffix),
      fullPage: true,
    });
  } else {
    await captureBattleCanvas(page, testInfo.outputPath(suffix));
  }
  return snapshot;
}

export async function writeTrace(testInfo, label, trace) {
  await writeFile(
    testInfo.outputPath(`${label}-trace-${RUN_ID}.json`),
    JSON.stringify(trace, null, 2),
  );
}
