import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startCombat(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await waitForBridge(page);
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Title",
  );
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

async function setProofLabel(page, snapshot) {
  await page.evaluate((state) => {
    const existing = document.getElementById("battle-layout-issue-248-proof");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "battle-layout-issue-248-proof";
    panel.style.position = "fixed";
    panel.style.top = "12px";
    panel.style.left = "12px";
    panel.style.zIndex = "9999";
    panel.style.background = "rgba(15, 23, 42, 0.92)";
    panel.style.color = "#e2e8f0";
    panel.style.padding = "10px 12px";
    panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
    panel.style.borderRadius = "8px";
    panel.style.fontFamily = "monospace";
    panel.style.fontSize = "12px";
    panel.style.whiteSpace = "pre";
    panel.textContent = [
      "Issue #248 proof",
      `tile=${state.encounterTileType}`,
      `backdrop=${state.backdropCount} ground=${state.groundPlaneCount} shadows=${state.shadowCount}`,
      `actionPanel=${state.actionPanelCount} message=${Math.round(state.messageWindow.bounds.width)}x${Math.round(state.messageWindow.bounds.height)}`,
    ].join("\n");
    document.body.appendChild(panel);
  }, snapshot);
}

async function fitBattleViewport(page) {
  await page.evaluate(() => {
    document.documentElement.style.background = "#000";
    document.body.style.margin = "0";
    document.body.style.background = "#000";
    document.body.style.display = "flex";
    document.body.style.justifyContent = "center";
    document.body.style.alignItems = "flex-start";

    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    canvas.style.width = "960px";
    canvas.style.height = "720px";
    canvas.style.maxWidth = "960px";
    canvas.style.maxHeight = "720px";
    canvas.style.display = "block";
  });
}

test.describe("battle layout proof — issue #248", () => {
  test("shows a grounded JRPG battle composition without oversized dead space", async ({
    page,
  }, testInfo) => {
    await startCombat(page);
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return snapshot.messageWindow?.text?.includes("choose an action");
    });

    const snapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );

    expect(snapshot.encounterTileType).not.toBeNull();
    expect(snapshot.backdropCount).toBeGreaterThanOrEqual(1);
    if (snapshot.backdropType === "procedural") {
      expect(snapshot.groundPlaneCount).toBeGreaterThanOrEqual(1);
    }
    expect(snapshot.shadowCount).toBeGreaterThanOrEqual(4);
    expect(snapshot.actionPanelCount).toBeGreaterThanOrEqual(1);
    expect(snapshot.messageWindow.bounds.width).toBeLessThan(500);
    expect(snapshot.messageWindow.bounds.height).toBeLessThanOrEqual(154);
    expect(snapshot.messageWindow.bounds.height).toBeGreaterThanOrEqual(68);

    await setProofLabel(page, snapshot);
    await fitBattleViewport(page);
    await page.screenshot({
      path: testInfo.outputPath(`battle-layout-issue-248-${RUN_ID}.png`),
    });
  });
});
