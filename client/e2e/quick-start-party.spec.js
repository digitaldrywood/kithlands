import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
test("Quick Start creates a complete four-character party", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(
    (email) => window.__kithlandsTest.startQuickGame(email),
    `quick-party-${RUN_ID}@kithlands.dev`,
  );
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "World",
  );
  const state = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect(state.party.map((member) => member.class_id)).toEqual([
    "warrior",
    "cinder",
    "rogue",
    "mender",
  ]);
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  await page.keyboard.press("m");
  await expect(
    page.getByRole("dialog", { name: "Your party", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`quick-start-four-${RUN_ID}.png`),
    fullPage: true,
  });
});
