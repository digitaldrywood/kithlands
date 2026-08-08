import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();

test.use({
  viewport: { width: 800, height: 600 },
});

async function startLevelOneGame(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Title",
  );
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

test("previews and sockets equipped gear from the character screen", async ({
  page,
}) => {
  await startLevelOneGame(page);

  const starter = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect(starter.gems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "ember_shard", count: 3 }),
    ]),
  );
  const starterItem = starter.equipment[0].weapon_item;
  expect(starterItem?.instance_id).toBeTruthy();
  expect(starterItem.sockets.some((socket) => !socket.gem_id)).toBe(true);

  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "SOCKET"),
  );
  await page.screenshot({
    path: `tmp/character-equipped-socket-${RUN_ID}.png`,
    fullPage: true,
  });
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("SOCKET", "World"),
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
      "SOCKET GEMS",
      "REFINE  •  1 READY",
      "1  CHOOSE EQUIPMENT",
      "2  CHOOSE A GEM",
      "3  REVIEW & CONFIRM",
      "PREVIEW — NOT APPLIED",
      "CONFIRM & SOCKET",
    ]),
  );
  expect(texts.some((text) => text.includes("Power:"))).toBe(true);
  expect(texts.some((text) => text.includes("Ayla ATK:"))).toBe(true);
  expect(texts).toContain("★ BEST OWNED GEM FOR THIS ITEM");
  expect(texts).toContain("⚠ Socketing is permanent for now.");

  await page.screenshot({
    path: `tmp/gem-workshop-equipped-preview-${RUN_ID}.png`,
    fullPage: true,
  });

  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("REFINE  •  1 READY", "World"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "RECIPE PREVIEW"),
  );
  const recipeTexts = await page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("World").map((entry) => entry.text),
  );
  expect(recipeTexts).toContain("★ RECOMMENDED — READY NOW");
  expect(recipeTexts.some((text) => text.includes("Weapon Power:"))).toBe(true);
  expect(recipeTexts.some((text) => text.includes("Armor Absorb:"))).toBe(true);
  expect(recipeTexts.some((text) => text.includes("owned 3"))).toBe(true);
  expect(recipeTexts).toContain("REFINE GEM");

  await page.screenshot({
    path: `tmp/gem-workshop-recipe-preview-${RUN_ID}.png`,
    fullPage: true,
  });

  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("SOCKET GEMS", "World"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "CONFIRM & SOCKET"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("CONFIRM & SOCKET", "World"),
  );
  await page.waitForFunction((instanceID) => {
    const state = window.__kithlandsTest.gameState("World");
    return state.equipment[0].weapon_item?.sockets?.some(
      (socket) => socket.gem_id === "ember_shard",
    );
  }, starterItem.instance_id);

  const socketed = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect(socketed.gems.find((gem) => gem.id === "ember_shard")?.count).toBe(2);
  expect(
    socketed.equipment[0].weapon_item?.sockets?.some(
      (socket) => socket.gem_id === "ember_shard",
    ),
  ).toBe(true);
  const appliedTexts = await page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("World").map((entry) => entry.text),
  );
  expect(appliedTexts).toContain("✓ SOCKET APPLIED");
  expect(appliedTexts).toContain("◆ Ember Shard   +1 Power");
  expect(appliedTexts).toContain("SOCKET FILLED");
  expect(appliedTexts.some((text) => text.includes("is now socketed"))).toBe(
    true,
  );

  await page.screenshot({
    path: `tmp/gem-workshop-socketed-${RUN_ID}.png`,
    fullPage: true,
  });

  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("CLOSE", "World"),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
  );
  const returnedTexts = await page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("World").map((entry) => entry.text),
  );
  expect(returnedTexts).toContain("SOCKETS FULL");
});

test("keeps the comparison readable at desktop and mobile viewports", async ({
  page,
}) => {
  await startLevelOneGame(page);
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("SOCKET", "World"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "CONFIRM & SOCKET"),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `tmp/gem-workshop-desktop-1440x900-${RUN_ID}.png`,
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
  await page.screenshot({
    path: `tmp/gem-workshop-mobile-390x844-${RUN_ID}.png`,
    fullPage: true,
  });
});

test("advertises a ready recipe and recommends its stronger output", async ({
  page,
}) => {
  await startLevelOneGame(page);
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  expect(
    await page.evaluate(() =>
      window.__kithlandsTest.menuButtonEnabled("GEMS (1)", "World"),
    ),
  ).toBe(true);
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("GEMS (1)", "World"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "REFINE  •  1 READY"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("REFINE  •  1 READY", "World"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "REFINE GEM"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("REFINE GEM", "World"),
  );
  await page.waitForFunction(() => {
    const gems = window.__kithlandsTest.gameState("World").gems;
    return (
      gems.some((gem) => gem.id === "ember_gem" && gem.count === 1) &&
      !gems.some((gem) => gem.id === "ember_shard")
    );
  });

  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text.includes("+3 Power")),
  );
  const texts = await page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("World").map((entry) => entry.text),
  );
  expect(texts.some((text) => text.includes("Ember Gem"))).toBe(true);
  expect(texts.some((text) => text.includes("(+3)"))).toBe(true);
  expect(texts).toContain("★ BEST OWNED GEM FOR THIS ITEM");
  expect(texts).toContain("PREVIEW — NOT APPLIED");
  expect(texts.some((text) => text.includes("not socketed yet"))).toBe(true);

  await page.screenshot({
    path: `tmp/gem-workshop-refined-recommendation-${RUN_ID}.png`,
    fullPage: true,
  });
});
