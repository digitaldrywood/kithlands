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
    const existing = document.getElementById("battle-cinematic-proof");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "battle-cinematic-proof";
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

test.describe("battle cinematic proof — issue #211", () => {
  test("shows the message window, cursor, and cinematic pacing", async ({
    page,
  }, testInfo) => {
    await startCombat(page);

    await setProofLabel(page, "Before: battle idle");
    await page.screenshot({
      path: testInfo.outputPath(`battle-cinematic-before-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("message_window"),
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return (
        snapshot.messageWindow?.visible &&
        snapshot.messageWindow?.text?.includes("attacks")
      );
    });
    const messageSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(messageSnapshot.messageWindow.visible).toBe(true);
    expect(messageSnapshot.messageWindow.text).toContain("attacks");

    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("target_cursor"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.battleVisibilitySnapshot().cursors > 0,
    );
    const cursorSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    expect(cursorSnapshot.cursors).toBeGreaterThan(0);

    await setProofLabel(page, "After: message window + target cursor");
    await page.screenshot({
      path: testInfo.outputPath(`battle-cinematic-after-${RUN_ID}.png`),
      fullPage: true,
    });

    const timings = await page.evaluate(async () => {
      const startedAt = performance.now();
      const beat = await window.__kithlandsTest.playBattleVisibilityDemo(
        "cinematic",
      );
      return {
        ...beat,
        elapsed: performance.now() - startedAt,
      };
    });
    expect(timings.preImpact).toBeGreaterThanOrEqual(260);
    expect(timings.postDamage).toBeGreaterThanOrEqual(430);
    expect(timings.total).toBeGreaterThanOrEqual(1100);
    expect(timings.elapsed).toBeGreaterThanOrEqual(1100);
  });
});
