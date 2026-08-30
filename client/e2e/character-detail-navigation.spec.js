import { test, expect } from "@playwright/test";

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startQuickGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function waitForDetailTexts(page, expectedName, expectedPosition) {
  await page.waitForFunction(
    ([name, position]) => {
      const texts = window.__kithlandsTest
        .visibleTexts("World")
        .map((entry) => entry.text);
      return texts.includes(name) && texts.includes(position);
    },
    [expectedName, expectedPosition],
  );
}

test.describe("character detail navigation", () => {
  test("cycles party members by keyboard and on-screen arrows", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startQuickGame(page);

    const party = await page.evaluate(
      () => window.__kithlandsTest.gameState("World").party,
    );
    expect(party.length).toBeGreaterThan(1);

    // The DOM loadout screen owns the current Party > Character flow. Open the
    // Phaser detail directly here to preserve coverage for callers that return
    // to this compatibility surface after a character picker.
    await page.evaluate(() =>
      window.__kithlandsTest.openCharacterDetail(0, "World"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
    );
    await waitForDetailTexts(page, party[0].name, `1/${party.length}`);

    await page.keyboard.press("ArrowRight");
    await waitForDetailTexts(page, party[1].name, `2/${party.length}`);
    const shotPath = testInfo.outputPath(
      `character-detail-navigation-${Date.now()}.png`,
    );
    await page.screenshot({ path: shotPath });

    await page.keyboard.press("ArrowLeft");
    await waitForDetailTexts(page, party[0].name, `1/${party.length}`);

    await page.evaluate(() =>
      window.__kithlandsTest.clickCharacterDetailButton("<", "World"),
    );
    await waitForDetailTexts(
      page,
      party[party.length - 1].name,
      `${party.length}/${party.length}`,
    );

    await page.evaluate(() =>
      window.__kithlandsTest.clickCharacterDetailButton(">", "World"),
    );
    await waitForDetailTexts(page, party[0].name, `1/${party.length}`);
  });
});
