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
    const existing = document.getElementById("battle-turn-prompt-proof");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "battle-turn-prompt-proof";
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

test.describe("battle turn prompt placement — issue #228", () => {
  test("keeps the turn prompt inside the message window fill area", async ({
    page,
  }, testInfo) => {
    await startCombat(page);
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return snapshot.messageWindow?.text?.includes("choose an action");
    });

    await setProofLabel(page, "Prompt placement proof");
    await page.screenshot({
      path: testInfo.outputPath(`battle-turn-prompt-${RUN_ID}.png`),
      fullPage: true,
    });

    const snapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    const contentTop = snapshot.messageWindow.contentBounds.y;
    const contentBottom =
      contentTop + snapshot.messageWindow.contentBounds.height;
    const textTop = snapshot.messageWindow.textBounds.y;
    const textBottom =
      snapshot.messageWindow.textBounds.y +
      snapshot.messageWindow.textBounds.height;

    expect(snapshot.messageWindow.text).toContain("choose an action");
    expect(textTop).toBeGreaterThanOrEqual(contentTop);
    expect(textBottom).toBeLessThanOrEqual(contentBottom);

    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("wrapped_prompt"),
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return (
        snapshot.messageWindow?.text?.includes("very long spell name") &&
        snapshot.messageWindow?.textBounds?.height > 20
      );
    });

    await setProofLabel(page, "Wrapped prompt placement proof");
    await page.screenshot({
      path: testInfo.outputPath(`battle-turn-prompt-wrapped-${RUN_ID}.png`),
      fullPage: true,
    });

    const wrappedSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    const wrappedContentTop = wrappedSnapshot.messageWindow.contentBounds.y;
    const wrappedContentBottom =
      wrappedContentTop + wrappedSnapshot.messageWindow.contentBounds.height;
    const wrappedTextTop = wrappedSnapshot.messageWindow.textBounds.y;
    const wrappedTextBottom =
      wrappedSnapshot.messageWindow.textBounds.y +
      wrappedSnapshot.messageWindow.textBounds.height;

    expect(wrappedSnapshot.messageWindow.text).toContain(
      "very long spell name",
    );
    expect(wrappedSnapshot.messageWindow.textBounds.height).toBeGreaterThan(20);
    expect(wrappedTextTop).toBeGreaterThanOrEqual(wrappedContentTop);
    expect(wrappedTextBottom).toBeLessThanOrEqual(wrappedContentBottom);
  });
});
