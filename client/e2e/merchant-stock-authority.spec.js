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
  "merchant-stock-authority",
  "proof",
);

const VIEWPORTS = [
  { label: "800x600", width: 800, height: 600, mobile: false },
  { label: "1440x900", width: 1440, height: 900, mobile: false },
  { label: "390x844", width: 390, height: 844, mobile: true },
];

const STORE_PATH = [
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
];

const SOUTH_EXIT_PATH = [
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
];

mkdirSync(PROOF_DIR, { recursive: true });
test.use({ hasTouch: true });

async function capture(page, viewport, stage) {
  const filename = `merchant-stock-${viewport.label}-${stage}-${RUN_ID}.png`;
  await page.screenshot({
    path: path.join(PROOF_DIR, filename),
    fullPage: true,
  });
  return filename;
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

async function tapActionButton(page, sceneKey) {
  const layout = await page.evaluate(
    (key) => window.__kithlandsTest.gameplayViewportSnapshot(key),
    sceneKey,
  );
  const size = await page.evaluate(
    (key) => window.__kithlandsTest.logicalGameSize(key),
    sceneKey,
  );
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("game canvas is missing");
  await page.touchscreen.tap(
    box.x + (layout.action.x / size.width) * box.width,
    box.y + (layout.action.y / size.height) * box.height,
  );
}

async function startQuickGame(page) {
  const openTitle = async () => {
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(() => !!window.__kithlandsTest);
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneIsActive("Title"),
      null,
      { timeout: 30_000 },
    );
  };
  try {
    await openTitle();
  } catch {
    await openTitle();
  }
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function triggerSceneAction(page, viewport, sceneKey) {
  if (viewport.mobile) {
    await tapActionButton(page, sceneKey);
    await page.waitForTimeout(200);
    if (
      (await page.evaluate(() => window.__kithlandsTest.activeSceneKey())) ===
      sceneKey
    ) {
      await tapActionButton(page, sceneKey);
    }
  } else {
    await page.evaluate(
      (key) => window.__kithlandsTest.pressKey("Enter", key),
      sceneKey,
    );
  }
}

async function enterCadottShop(page, viewport) {
  await triggerSceneAction(page, viewport, "World");
  await page.waitForTimeout(300);
  if (
    (await page.evaluate(() => window.__kithlandsTest.activeSceneKey())) ===
    "World"
  ) {
    const approach = await page.evaluate(() =>
      window.__kithlandsTest.movePlayer("up", "World"),
    );
    expect(approach.moved).toBe(true);
    await page.waitForTimeout(250);
    await triggerSceneAction(page, viewport, "World");
  }
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Settlement",
    null,
    { timeout: 10_000 },
  );
  await page.waitForFunction(() => {
    const settlement = window.__kithlandsTest.settlementSnapshot();
    return settlement.mapId === "cadott-town" && !settlement.animating;
  });

  await moveSettlement(page, STORE_PATH);
  expect(
    await page.evaluate(
      () => window.__kithlandsTest.settlementSnapshot().currentInteraction,
    ),
  ).toBe("general-store-door");

  await triggerSceneAction(page, viewport, "Settlement");
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Town",
    null,
    { timeout: 10_000 },
  );
  const interior = await page.evaluate(() => ({
    state: window.__kithlandsTest.gameState("Town"),
    town: window.__kithlandsTest.townSnapshot("Town"),
  }));
  expect(interior.state.current_location).toMatchObject({
    kind: "interior",
    map_id: "cadott-general-store",
    interior: {
      node_id: "cadott-general-store",
      building_type: "shop",
      tags: expect.arrayContaining(["shop", "commerce"]),
    },
  });

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
}

async function leaveShopForWorld(page) {
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
  await moveSettlement(page, SOUTH_EXIT_PATH);
  await page.evaluate(() =>
    window.__kithlandsTest.pressKey("Enter", "Settlement"),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

function exactItemProjection(item) {
  return {
    instance_id: item.instance_id,
    name: item.name,
    category: item.category,
    stats: item.stats,
    rarity: item.rarity,
    item_level: item.item_level,
    required_level: item.required_level,
    affixes: item.affixes || [],
    sockets: item.sockets || [],
  };
}

for (const viewport of VIEWPORTS) {
  test(`merchant stock authority at ${viewport.label}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await startQuickGame(page);

    await enterCadottShop(page, viewport);
    await capture(page, viewport, "real-shop-interior");

    const firstCatalog = await page.evaluate(() =>
      window.__kithlandsTest.shopItems("Town"),
    );
    expect(firstCatalog.error).toBeUndefined();
    const rolledOffer = firstCatalog.shop_items.find(
      (item) => item.type === "equipment",
    );
    expect(rolledOffer).toMatchObject({
      stock_id: expect.stringMatching(/^offer_/),
      instance_id: expect.stringMatching(/^gear_shop_/),
      name: expect.any(String),
      rarity: expect.any(String),
      item_level: expect.any(Number),
      required_level: expect.any(Number),
      stats: expect.any(Object),
      price: expect.any(Number),
    });

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Armor", "Town"),
    );
    await page.evaluate(
      (name) => window.__kithlandsTest.clickInteractiveText(name, "Town"),
      rolledOffer.name,
    );
    await page.waitForFunction(
      (name) =>
        window.__kithlandsTest
          .visibleTexts("Town")
          .some((entry) => entry.text === `Preview: ${name}`),
      rolledOffer.name,
    );
    await capture(page, viewport, "rolled-offer-preview");

    const beforePurchase = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Buy", "Town"),
    );
    await page.waitForFunction(
      (instanceID) =>
        window.__kithlandsTest
          .gameState("Town")
          .items.some((item) => item.instance_id === instanceID),
      rolledOffer.instance_id,
    );
    await page.waitForFunction(
      (name) =>
        window.__kithlandsTest
          .visibleTexts("Town")
          .some((entry) => entry.text === `Bought: ${name}!`),
      rolledOffer.name,
    );

    const purchasedState = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    const purchasedItem = purchasedState.items.find(
      (item) => item.instance_id === rolledOffer.instance_id,
    );
    expect(purchasedState.gold).toBe(beforePurchase.gold - rolledOffer.price);
    expect(purchasedItem.id).toBe(`eqp_${rolledOffer.instance_id}`);
    expect(exactItemProjection(purchasedItem)).toEqual(
      exactItemProjection(rolledOffer),
    );
    const afterPurchaseCatalog = await page.evaluate(() =>
      window.__kithlandsTest.shopItems("Town"),
    );
    expect(
      afterPurchaseCatalog.shop_items.some(
        (item) => item.stock_id === rolledOffer.stock_id,
      ),
    ).toBe(false);
    await capture(page, viewport, "exact-item-purchased");

    const staleResult = await page.evaluate(
      ({ nodeId, stockId }) =>
        window.__kithlandsTest.buyShopOffer(nodeId, stockId, "Town"),
      {
        nodeId: "cadott-general-store",
        stockId: rolledOffer.stock_id,
      },
    );
    expect(staleResult.error).toContain("stale or already purchased");
    expect(
      await page.evaluate(() => window.__kithlandsTest.gameState("Town")),
    ).toEqual(purchasedState);
    expect(
      await page.evaluate(() => window.__kithlandsTest.shopItems("Town")),
    ).toEqual(afterPurchaseCatalog);

    await leaveShopForWorld(page);
    const saveName = `Merchant stock ${viewport.label} ${RUN_ID}`;
    const saveResult = await page.evaluate(
      (name) => window.__kithlandsTest.saveGame(name, "World"),
      saveName,
    );
    expect(saveResult.error).toBeUndefined();
    const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
    const save = saves.saves.find((entry) => entry.name === saveName);
    expect(save).toBeTruthy();
    await page.evaluate(
      (saveID) => window.__kithlandsTest.loadSave(saveID),
      save.id,
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await enterCadottShop(page, viewport);

    const reloadedCatalog = await page.evaluate(() =>
      window.__kithlandsTest.shopItems("Town"),
    );
    expect(reloadedCatalog).toEqual(afterPurchaseCatalog);
    const reloadedState = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    expect(
      exactItemProjection(
        reloadedState.items.find(
          (item) => item.instance_id === rolledOffer.instance_id,
        ),
      ),
    ).toEqual(exactItemProjection(rolledOffer));
    await capture(page, viewport, "stock-after-save-reload");
  });
}
