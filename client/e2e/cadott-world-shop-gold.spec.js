import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.join(
  SPEC_DIR,
  "..",
  "tmp",
  "cadott-gold-slice",
  "proof",
);

const VIEWPORTS = [
  { label: "800x600", width: 800, height: 600, mobile: false },
  { label: "1280x720", width: 1280, height: 720, mobile: false },
  { label: "390x844", width: 390, height: 844, mobile: true },
];

mkdirSync(PROOF_DIR, { recursive: true });
test.use({ hasTouch: true });

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Title"),
  );
}

async function capture(page, viewport, stage) {
  const filename = `issue-267-${viewport.label}-${stage}-${RUN_ID}.png`;
  await page.screenshot({
    path: path.join(PROOF_DIR, filename),
    fullPage: true,
  });
}

async function moveSettlement(page, directions) {
  for (const direction of directions) {
    const move = await page.evaluate((dir) => {
      return window.__kithlandsTest.movePlayer(dir, "Settlement");
    }, direction);
    expect(move.moved, `move ${direction} at ${move.x},${move.y}`).toBe(true);
    await page.waitForFunction(
      () => !window.__kithlandsTest.settlementSnapshot().animating,
    );
  }
}

async function tapLogicalCanvasPoint(page, x, y, sceneKey) {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("game canvas is missing");
  const size = await page.evaluate(
    (key) => window.__kithlandsTest.logicalGameSize(key),
    sceneKey,
  );
  await page.touchscreen.tap(
    box.x + (x / size.width) * box.width,
    box.y + (y / size.height) * box.height,
  );
}

async function activateTouchUI(page, sceneKey) {
  const layout = await page.evaluate(
    (key) => window.__kithlandsTest.gameplayViewportSnapshot(key),
    sceneKey,
  );
  await tapLogicalCanvasPoint(page, layout.action.x, layout.action.y, sceneKey);
  await page.waitForTimeout(150);
}

async function tapActionButton(page, sceneKey) {
  const layout = await page.evaluate(
    (key) => window.__kithlandsTest.gameplayViewportSnapshot(key),
    sceneKey,
  );
  await tapLogicalCanvasPoint(page, layout.action.x, layout.action.y, sceneKey);
}

async function expectGameplayViewport(page, viewport, sceneKey) {
  const snapshot = await page.evaluate(
    (key) => ({
      size: window.__kithlandsTest.logicalGameSize(key),
      layout: window.__kithlandsTest.gameplayViewportSnapshot(key),
    }),
    sceneKey,
  );
  expect(snapshot.layout.portrait).toBe(viewport.mobile);
  expect(snapshot.size.width).toBe(800);
  expect(snapshot.size.height).toBe(viewport.mobile ? 1731 : 600);
  const box = await page.locator("canvas").boundingBox();
  expect(box).not.toBeNull();
  if (viewport.mobile) {
    expect(box.y).toBeLessThan(1);
    expect(box.height).toBeGreaterThan(800);
  }
}

function persistentState(state) {
  return {
    gold: state.gold,
    items: state.items,
    equipment: state.equipment,
    gems: state.gems,
    gemRecipes: state.gem_recipes,
    party: state.party,
  };
}

async function runGoldSlice(page, viewport) {
  await page.goto("/?noEncounters=1");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await expectGameplayViewport(page, viewport, "World");

  const initialState = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect(initialState.current_location.kind).toBe("world");
  expect(initialState.settlement_map.properties).toContainEqual(
    expect.objectContaining({ name: "id", value: "cadott-town" }),
  );
  await capture(page, viewport, "overworld-before-entry");

  const approach = await page.evaluate(() =>
    window.__kithlandsTest.movePlayer("up", "World"),
  );
  expect(approach.moved).toBe(true);
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__kithlandsTest.pressKey("Enter", "World"));
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Settlement",
  );
  await page.waitForFunction(() => {
    const settlement = window.__kithlandsTest.settlementSnapshot();
    return (
      settlement.mapId === "cadott-town" &&
      settlement.playerX === 12 &&
      !settlement.animating
    );
  });
  await expectGameplayViewport(page, viewport, "Settlement");

  if (viewport.mobile) {
    await activateTouchUI(page, "Settlement");
  }
  let exterior = await page.evaluate(() =>
    window.__kithlandsTest.settlementSnapshot(),
  );
  expect(exterior).toMatchObject({
    playerX: 12,
    playerY: 16,
    currentInteraction: "south-exit",
  });
  expect(exterior.npcs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: "guard", x: 14, y: 6 }),
      expect.objectContaining({ role: "gossip", x: 15, y: 10 }),
    ]),
  );
  expect(exterior.npcs.every((npc) => npc.depth > 0)).toBe(true);
  await capture(page, viewport, "exterior-arrival");

  await moveSettlement(page, [
    "up",
    "right",
    "right",
    "up",
    "up",
    "up",
    "up",
    "up",
    "down",
    "right",
    "right",
    "right",
    "right",
    "up",
    "up",
    "up",
  ]);
  exterior = await page.evaluate(() =>
    window.__kithlandsTest.settlementSnapshot(),
  );
  expect(exterior).toMatchObject({
    playerX: 18,
    playerY: 8,
    currentInteraction: "general-store-door",
    currentDestination: "Cadott General Store",
  });
  await capture(page, viewport, "general-store-door");

  if (viewport.mobile) {
    await tapActionButton(page, "Settlement");
  } else {
    await page.evaluate(() =>
      window.__kithlandsTest.pressKey("Enter", "Settlement"),
    );
  }
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Town",
  );
  await expectGameplayViewport(page, viewport, "Town");
  const interior = await page.evaluate(() => ({
    state: window.__kithlandsTest.gameState("Town"),
    town: window.__kithlandsTest.townSnapshot("Town"),
  }));
  expect(interior.state.current_location).toMatchObject({
    kind: "interior",
    map_id: "cadott-general-store",
  });
  expect(interior.state.current_location.interior).toMatchObject({
    building_type: "shop",
    tags: expect.arrayContaining(["shop", "commerce"]),
  });
  expect(interior.town).toMatchObject({
    templateId: "shop_corner_goods_1f",
    roomW: 16,
    roomH: 12,
    backgroundAsset: "/interiors/shop/shop-corner-goods-background.png",
    backgroundTextureKey: "interior_background_shop_corner_goods_1f_0",
    backgroundLoaded: true,
    hidesTileLayer: true,
    roomDrawableCount: 0,
  });
  await capture(page, viewport, "shop-interior-arrival");

  const proprietor = interior.town.npcPositions[0];
  await page.waitForFunction(
    ({ x, y }) =>
      window.__kithlandsTest.teleportTownPlayer(x, y + 1).nearNpcIndex === 0,
    proprietor,
  );
  await page.evaluate(() => window.__kithlandsTest.interact("Town"));
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Town")
      .some((entry) => entry.text === "Leave Shop"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("Wooden Club", "Town"),
  );
  await page.waitForFunction(() => {
    const texts = window.__kithlandsTest
      .visibleTexts("Town")
      .map((entry) => entry.text);
    return (
      texts.includes("Preview: Wooden Club") &&
      texts.some((text) => text.includes("Hero · Warrior"))
    );
  });
  const comparisonTexts = await page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("Town").map((entry) => entry.text),
  );
  expect(initialState.equipment[0].weapon_name).toBeTruthy();
  expect(comparisonTexts).toContain(
    `Current: ${initialState.equipment[0].weapon_name}`,
  );
  expect(comparisonTexts).toContain("Preview: Wooden Club");
  await capture(page, viewport, "shop-equipment-comparison");

  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("Buy", "Town"),
  );
  await page.waitForFunction(() => {
    const state = window.__kithlandsTest.gameState("Town");
    return (
      state.gold === 90 &&
      state.items.some(
        (item) => item.id === "wpn_wooden_club" && item.count === 1,
      )
    );
  });
  const purchasedState = await page.evaluate(() =>
    window.__kithlandsTest.gameState("Town"),
  );
  expect(purchasedState.equipment).toEqual(initialState.equipment);
  expect(purchasedState.party).toEqual(initialState.party);

  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("Leave Shop", "Town"),
  );
  await page.waitForFunction(
    () => !window.__kithlandsTest.sceneFlags("Town").menuOpen,
  );
  await page.evaluate(() => window.__kithlandsTest.exitTown("Town"));
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Settlement",
  );
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.settlementSnapshot().currentInteraction === null,
  );
  await expectGameplayViewport(page, viewport, "Settlement");
  if (viewport.mobile) {
    await activateTouchUI(page, "Settlement");
  }
  exterior = await page.evaluate(() =>
    window.__kithlandsTest.settlementSnapshot(),
  );
  expect(exterior).toMatchObject({ playerX: 19, playerY: 10 });
  await capture(page, viewport, "exterior-return-from-shop");

  await moveSettlement(page, [
    "down",
    "down",
    "down",
    "down",
    "down",
    "left",
    "left",
    "left",
    "left",
    "left",
    "left",
    "left",
    "down",
    "down",
  ]);
  exterior = await page.evaluate(() =>
    window.__kithlandsTest.settlementSnapshot(),
  );
  expect(exterior.currentInteraction).toBe("south-exit");
  await page.evaluate(() =>
    window.__kithlandsTest.pressKey("Enter", "Settlement"),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  const roundTripState = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World"),
  );
  expect(roundTripState.current_location.kind).toBe("world");
  expect(persistentState(roundTripState)).toEqual(
    persistentState(purchasedState),
  );
  await capture(page, viewport, "overworld-round-trip-complete");
}

for (const viewport of VIEWPORTS) {
  test(`Cadott world-to-shop gold slice at ${viewport.label}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await runGoldSlice(page, viewport);
  });
}
