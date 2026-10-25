import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.join(SPEC_DIR, "tmp");
const SHARED_INTERIORS_DIR = path.resolve(SPEC_DIR, "../../shared/interiors");

mkdirSync(PROOF_DIR, { recursive: true });

function loadTemplate(filename) {
  return JSON.parse(
    readFileSync(path.join(SHARED_INTERIORS_DIR, filename), "utf8"),
  );
}

const TEMPLATES = {
  inn: loadTemplate("inn_gilded_steps_2f.json"),
  shop: loadTemplate("shop_backroom_stock_1f.json"),
  temple: loadTemplate("temple_crypt_2f.json"),
  house: loadTemplate("house_elder_study_1f.json"),
};

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

async function visitInterior(page, spawn, sceneData = {}) {
  await page.evaluate(
    ({ nextSpawn, nextSceneData }) =>
      window.__kithlandsTest.startTownScene(nextSpawn, "World", nextSceneData),
    { nextSpawn: spawn, nextSceneData: sceneData },
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Town"),
  );
  await page.waitForTimeout(150);
  return page.evaluate(() => window.__kithlandsTest.townSnapshot("Town"));
}

async function captureCanvas(page, suffix) {
  const target = path.join(PROOF_DIR, `issue-224-${suffix}-${RUN_ID}.png`);
  await page.locator("canvas").screenshot({ path: target });
  return target;
}

test.describe("interior templates proof", () => {
  test("captures inn, shop, temple, and house proof in a fresh game", async ({
    page,
  }) => {
    await startQuickGame(page);

    const innSnapshot = await visitInterior(page, {
      node_id: "proof_inn",
      name: "Gilded Steps Inn",
      tags: ["rest"],
      building_type: "inn",
      interior_seed: 101,
      interior_template: TEMPLATES.inn,
    });
    expect(innSnapshot.templateId).toBe("inn_gilded_steps_2f");
    expect(innSnapshot.floorCount).toBe(2);
    expect(innSnapshot.stairs).toHaveLength(1);

    const innStair = innSnapshot.stairs[0];
    await page.evaluate(
      ({ x, y }) => window.__kithlandsTest.teleportTownPlayer(x, y + 1, "Town"),
      { x: innStair.x, y: innStair.y },
    );
    await page.evaluate(() => window.__kithlandsTest.movePlayer("up", "Town"));
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Town").animating,
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.townSnapshot("Town").floorIndex === 1,
    );
    const innUpperSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.townSnapshot("Town"),
    );
    expect(innUpperSnapshot.floorIndex).toBe(1);
    await captureCanvas(page, "inn-two-floor");

    const shopSnapshot = await visitInterior(page, {
      node_id: "proof_shop",
      name: "Backroom Stock",
      tags: ["shop", "commerce"],
      building_type: "shop",
      interior_seed: 202,
      interior_template: TEMPLATES.shop,
    });
    expect(shopSnapshot.templateId).toBe("shop_backroom_stock_1f");
    expect(shopSnapshot.floorCount).toBe(1);
    expect(shopSnapshot.roomW).toBe(TEMPLATES.shop.floors[0].width);
    await captureCanvas(page, "shop-single-floor");

    const templeSnapshot = await visitInterior(
      page,
      {
        node_id: "proof_temple",
        name: "Temple Crypt",
        tags: ["temple", "revive"],
        building_type: "temple",
        interior_seed: 303,
        interior_template: TEMPLATES.temple,
      },
      { floorIndex: 1, playerStart: { x: 3, y: 6 } },
    );
    expect(templeSnapshot.templateId).toBe("temple_crypt_2f");
    expect(templeSnapshot.secretWallCount).toBeGreaterThan(0);
    await page.evaluate(() => window.__kithlandsTest.movePlayer("up", "Town"));
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Town").animating,
    );
    await page.evaluate(() => window.__kithlandsTest.movePlayer("up", "Town"));
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Town").animating,
    );
    const templeSecretSnapshot = await page.evaluate(() =>
      window.__kithlandsTest.townSnapshot("Town"),
    );
    expect(templeSecretSnapshot.playerX).toBe(3);
    expect(templeSecretSnapshot.playerY).toBe(4);
    expect(templeSecretSnapshot.floorIndex).toBe(1);
    await captureCanvas(page, "temple-secret-passage");

    const houseSnapshot = await visitInterior(page, {
      node_id: "proof_house",
      name: "Elder Study",
      tags: ["house"],
      building_type: "house",
      interior_seed: 404,
      interior_template: TEMPLATES.house,
    });
    expect(houseSnapshot.templateId).toBe("house_elder_study_1f");
    expect(houseSnapshot.floorCount).toBe(1);
    expect(houseSnapshot.npcPositions.length).toBeGreaterThanOrEqual(2);
    await captureCanvas(page, "house-study");
  });
});
