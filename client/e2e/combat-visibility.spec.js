import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startCombat(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.forceEncounter(["slime", "goblin"], 2),
  );
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.activeSceneKey() === "Battle" &&
      !!window.__kithlandsTest.gameState("Battle")?.enemies?.length,
  );
}

async function setProofLabel(page, label) {
  await page.evaluate((nextLabel) => {
    const existing = document.getElementById("combat-visibility-proof");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "combat-visibility-proof";
    panel.style.position = "fixed";
    panel.style.top = "8px";
    panel.style.left = "8px";
    panel.style.zIndex = "9999";
    panel.style.background = "rgba(15, 23, 42, 0.92)";
    panel.style.color = "#e2e8f0";
    panel.style.padding = "10px 12px";
    panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
    panel.style.borderRadius = "8px";
    panel.style.fontFamily = "monospace";
    panel.style.fontSize = "12px";
    panel.textContent = nextLabel;
    document.body.appendChild(panel);
  }, label);
}

async function waitForBattleFxToSettle(page) {
  await page.waitForFunction(() => {
    const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
    return (
      snapshot.tracers === 0 &&
      snapshot.reticles === 0 &&
      snapshot.bursts === 0 &&
      snapshot.vignetteAlpha < 0.01 &&
      snapshot.floatingTexts.length === 0
    );
  });
}

test.describe("combat visibility proof — issue #192", () => {
  test("captures tracer, party-hit feedback, and readable floating text", async ({
    page,
  }, testInfo) => {
    await startCombat(page);
    await waitForBattleFxToSettle(page);

    await setProofLabel(page, "Before: idle battle state");
    await page.screenshot({
      path: testInfo.outputPath(
        `combat-visibility-tracer-before-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    await setProofLabel(page, "After: attacker -> target tracer");
    const tracerState = await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("tracer"),
    );
    expect(tracerState.tracers).toBeGreaterThan(0);
    expect(tracerState.reticles).toBeGreaterThanOrEqual(2);
    await page.screenshot({
      path: testInfo.outputPath(`combat-visibility-tracer-after-${RUN_ID}.png`),
      fullPage: true,
    });

    await waitForBattleFxToSettle(page);
    await setProofLabel(page, "Before: party-hit feedback idle");
    await page.screenshot({
      path: testInfo.outputPath(
        `combat-visibility-party-hit-before-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    await setProofLabel(page, "After: party-hit shake + vignette");
    const partyHitState = await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("party_hit"),
    );
    expect(partyHitState.bursts).toBeGreaterThan(0);
    expect(partyHitState.vignetteAlpha).toBeGreaterThan(0);
    expect(
      partyHitState.floatingTexts.some((entry) => entry.text === "-27"),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `combat-visibility-party-hit-after-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    await waitForBattleFxToSettle(page);
    await setProofLabel(page, "Before: floating text idle");
    await page.screenshot({
      path: testInfo.outputPath(
        `combat-visibility-floating-text-before-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    await setProofLabel(page, "After: readable floating text");
    const floatingState = await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("floating_text"),
    );
    expect(floatingState.floatingTexts.length).toBeGreaterThanOrEqual(2);
    expect(
      floatingState.floatingTexts.some((entry) => entry.text === "-34"),
    ).toBe(true);
    expect(
      floatingState.floatingTexts.some((entry) => entry.text === "-19"),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `combat-visibility-floating-text-after-${RUN_ID}.png`,
      ),
      fullPage: true,
    });
  });
});
