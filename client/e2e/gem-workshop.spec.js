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
      "TRANSMUTE  •  1 READY",
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
    window.__kithlandsTest.clickInteractiveText(
      "TRANSMUTE  •  1 READY",
      "World",
    ),
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
  expect(recipeTexts).toContain("TRANSMUTE GEM — THEN SOCKET");
  expect(
    recipeTexts.some((text) => text.includes("Step 1: Create the gem")),
  ).toBe(true);

  await page.screenshot({
    path: `tmp/gem-workshop-recipe-preview-${RUN_ID}.png`,
    fullPage: true,
  });

  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText(
      "TRANSMUTE GEM — THEN SOCKET",
      "World",
    ),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "SOCKET EMBER GEM NOW"),
  );
  const craftedTexts = await page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("World").map((entry) => entry.text),
  );
  expect(craftedTexts).toContain("STEP 2 OF 2 — WEAPON STILL OPEN");
  expect(craftedTexts.some((text) => text.includes("not socketed yet"))).toBe(
    true,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText(
      "SOCKET EMBER GEM NOW",
      "World",
    ),
  );
  await page.waitForFunction(() => {
    const state = window.__kithlandsTest.gameState("World");
    return state.equipment[0].weapon_item?.sockets?.some(
      (socket) => socket.gem_id === "ember_gem",
    );
  });

  const socketed = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect((socketed.gems || []).some((gem) => gem.id === "ember_gem")).toBe(
    false,
  );
  expect((socketed.gems || []).some((gem) => gem.id === "ember_shard")).toBe(
    false,
  );
  expect(
    socketed.equipment[0].weapon_item?.sockets?.some(
      (socket) => socket.gem_id === "ember_gem",
    ),
  ).toBe(true);
  const appliedTexts = await page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("World").map((entry) => entry.text),
  );
  expect(appliedTexts).toContain("✓ SOCKET APPLIED");
  expect(appliedTexts).toContain("◆ Ember Gem   +3 Power");
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
  expect(returnedTexts).toContain("◆ EMBER GEM");
  expect(returnedTexts).not.toContain("SOCKET");
  const equippedWeapon = socketed.equipment[0].weapon_item;
  const weaponBase =
    equippedWeapon.power -
    (equippedWeapon.affixes || [])
      .filter((affix) => affix.stat === "power")
      .reduce((sum, affix) => sum + affix.value, 0) -
    (equippedWeapon.sockets || [])
      .filter((socket) => socket.gem_id && socket.stat === "power")
      .reduce((sum, socket) => sum + socket.value, 0);
  expect(returnedTexts).toEqual(
    expect.arrayContaining([
      `Power ${equippedWeapon.power}`,
      "EQUIPMENT DETAILS",
      "POWER BREAKDOWN",
      `Base item  ${weaponBase}`,
      "Ember Gem  +3",
      `TOTAL POWER  ${equippedWeapon.power}`,
      `ATK ${socketed.party[0].str + equippedWeapon.power} = STR ${socketed.party[0].str} + WEAPON ${equippedWeapon.power}`,
      `STR ${socketed.party[0].str} = HERO ${socketed.party[0].str} + GEAR 0`,
      `AGI ${socketed.party[0].agi} = HERO ${socketed.party[0].agi} + GEAR 0`,
    ]),
  );
  await page.screenshot({
    path: `tmp/character-weapon-details-${RUN_ID}.png`,
    fullPage: true,
  });

  const hoverState = await page.evaluate(() =>
    window.__kithlandsTest.hoverCharacterDetailEquipment("armor", "World"),
  );
  expect(hoverState.activeSlot).toBe("armor");
  const armorTexts = await page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("World").map((entry) => entry.text),
  );
  expect(armorTexts).toEqual(
    expect.arrayContaining([
      `Absorb ${socketed.equipment[0].armor_absorb}`,
      "ABSORB BREAKDOWN",
      `Base item  ${socketed.equipment[0].armor_absorb}`,
      `TOTAL ABSORB  ${socketed.equipment[0].armor_absorb}`,
      `DAMAGE ABSORB ${socketed.equipment[0].armor_absorb} = ARMOR ${socketed.equipment[0].armor_absorb}`,
    ]),
  );
  await page.screenshot({
    path: `tmp/character-armor-hover-details-${RUN_ID}.png`,
    fullPage: true,
  });

  const pinnedState = await page.evaluate(() =>
    window.__kithlandsTest.pinCharacterDetailEquipment("armor", "World"),
  );
  expect(pinnedState).toMatchObject({
    activeSlot: "armor",
    pinnedSlot: "armor",
  });
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "PINNED • TAP TO RELEASE"),
  );

  await page.evaluate(() => {
    window.__kithlandsTest.pinCharacterDetailEquipment("armor", "World");
    window.__kithlandsTest.leaveCharacterDetailEquipment("armor", "World");
    window.__kithlandsTest.hoverCharacterDetailEquipment("weapon", "World");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `tmp/character-details-desktop-1440x900-${RUN_ID}.png`,
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobileViewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileViewport.scrollWidth).toBeLessThanOrEqual(
    mobileViewport.innerWidth,
  );
  await page.screenshot({
    path: `tmp/character-details-mobile-390x844-${RUN_ID}.png`,
    fullPage: true,
  });
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

test("advertises a ready transmutation and recommends its stronger output", async ({
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
      .some((entry) => entry.text === "TRANSMUTE  •  1 READY"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText(
      "TRANSMUTE  •  1 READY",
      "World",
    ),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "TRANSMUTE GEM — THEN SOCKET"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText(
      "TRANSMUTE GEM — THEN SOCKET",
      "World",
    ),
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
  expect(texts).toContain("STEP 2 OF 2 — WEAPON STILL OPEN");
  expect(texts).toContain("SOCKET EMBER GEM NOW");
  expect(texts.some((text) => text.includes("not socketed yet"))).toBe(true);

  await page.screenshot({
    path: `tmp/gem-workshop-transmuted-recommendation-${RUN_ID}.png`,
    fullPage: true,
  });
});
