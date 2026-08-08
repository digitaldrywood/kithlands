import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();

test.use({
  viewport: { width: 800, height: 600 },
});

async function startLevelOneGame(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [{ name: "Coach Bell", relation: "friendly" }],
      places: ["General Store", "Library", "Fire Hall"],
      big_building: "Town Hall",
      difficulty: "normal",
      party: [
        { name: "Ayla", class_id: "warrior" },
        { name: "Mira", class_id: "mender" },
      ],
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

test("opens a useful Gem Workshop for a level-one party", async ({ page }) => {
  await startLevelOneGame(page);

  const starter = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect(starter.gems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "ember_shard", count: 3 }),
    ]),
  );
  expect(
    starter.items.some(
      (item) =>
        item.instance_id && item.sockets?.some((socket) => !socket.gem_id),
    ),
  ).toBe(true);

  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  expect(
    await page.evaluate(() =>
      window.__kithlandsTest.menuButtonEnabled("GEMS", "World"),
    ),
  ).toBe(true);

  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("GEMS", "World"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "GEM WORKSHOP"),
  );

  const texts = await page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("World").map((entry) => entry.text),
  );
  expect(texts).toEqual(
    expect.arrayContaining([
      "GEM WORKSHOP",
      "SOCKETABLE GEAR",
      "OWNED GEMS",
      "KNOWN RECIPES",
      "Ember Shard  x3",
      "Refine Ember Gem (3x Ember Shard)",
      "Refine Ember Crystal (3x Ember Gem)",
    ]),
  );
  expect(texts.some((text) => text.includes("ember_gem"))).toBe(false);

  await page.screenshot({
    path: `tmp/gem-workshop-level-one-${RUN_ID}.png`,
    fullPage: true,
  });

  const starterGearID = starter.items.find(
    (item) =>
      item.instance_id && item.sockets?.some((socket) => !socket.gem_id),
  ).instance_id;
  await page.mouse.click(409, 164);
  await page.waitForFunction((instanceID) => {
    const state = window.__kithlandsTest.gameState("World");
    return state.items
      .find((item) => item.instance_id === instanceID)
      ?.sockets?.some((socket) => socket.gem_id === "ember_shard");
  }, starterGearID);

  const socketed = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect(socketed.gems.find((gem) => gem.id === "ember_shard")?.count).toBe(2);
  expect(
    socketed.items
      .find((item) => item.instance_id === starterGearID)
      ?.sockets?.some((socket) => socket.gem_id === "ember_shard"),
  ).toBe(true);

  await page.screenshot({
    path: `tmp/gem-workshop-socketed-${RUN_ID}.png`,
    fullPage: true,
  });
});
