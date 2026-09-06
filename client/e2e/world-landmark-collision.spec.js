import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
test.setTimeout(120_000);
for (const viewport of [
  { width: 720, height: 847 },
  { width: 390, height: 844 },
]) {
  test(`walk left across grass-covered landmark footprints at ${viewport.width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(
      (email) => window.__kithlandsTest.startQuickGame(email),
      `barrier-${viewport.width}-${RUN_ID}@kithlands.dev`,
    );
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    const navigation = await page.evaluate(() =>
      window.__kithlandsTest.worldNavigationSnapshot(),
    );
    const town = navigation.spawns.find((spawn) =>
      ["place", "business", "landmark"].includes(spawn.kind),
    );
    expect(town).toBeTruthy();
    await page.evaluate(({ x, y }) => {
      window.__kithlandsTest.setPlayerTile(x - 1, y + 3, "World");
      window.__kithlandsTest.centerCameraOnPlayer("World");
    }, town);
    await page.screenshot({
      path: testInfo.outputPath(
        `barrier-before-${viewport.width}-${RUN_ID}.png`,
      ),
    });
    for (const offset of [-2, -3, -4]) {
      await page.keyboard.down("ArrowLeft");
      await page.waitForFunction(
        ({ x, y }) => {
          const s = window.__kithlandsTest.worldNavigationSnapshot();
          return s.x === x && s.y === y;
        },
        { x: town.x + offset, y: town.y + 3 },
      );
      await page.keyboard.up("ArrowLeft");
      await page.keyboard.up("ArrowRight");
      await page.waitForFunction(
        () => !window.__kithlandsTest.worldNavigationSnapshot().animating,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath(
        `barrier-after-${viewport.width}-${RUN_ID}.png`,
      ),
    });
    for (const offset of [-3, -2, -1]) {
      await page.keyboard.down("ArrowRight");
      await page.waitForFunction(
        ({ x, y }) => {
          const s = window.__kithlandsTest.worldNavigationSnapshot();
          return s.x === x && s.y === y;
        },
        { x: town.x + offset, y: town.y + 3 },
      );
      await page.keyboard.up("ArrowLeft");
      await page.keyboard.up("ArrowRight");
      await page.waitForFunction(
        () => !window.__kithlandsTest.worldNavigationSnapshot().animating,
      );
    }
  });
}
