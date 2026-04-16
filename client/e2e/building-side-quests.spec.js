import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));

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

async function visitInterior(page, spawn, fromSceneKey = "World") {
  await page.evaluate(
    ({ nextSpawn, sceneKey }) =>
      window.__kithlandsTest.startTownScene(nextSpawn, sceneKey),
    { nextSpawn: spawn, sceneKey: fromSceneKey },
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Town"),
  );
  await page.waitForTimeout(200);
  return page.evaluate(() => window.__kithlandsTest.townSnapshot("Town"));
}

async function moveToNpc(page, npcIndex = 0) {
  const npc = await page.evaluate(
    (index) => window.__kithlandsTest.townNpcPositions("Town")[index],
    npcIndex,
  );
  await page.waitForFunction(
    ({ x, y, index }) =>
      window.__kithlandsTest.teleportTownPlayer(x, y + 1).nearNpcIndex ===
      index,
    { ...npc, index: npcIndex },
  );
}

test.describe("building interiors and side-quest handoff", () => {
  test("captures inn quest handoff and a second interior dialogue proof", async ({
    page,
  }) => {
    await startQuickGame(page);

    const inn = await visitInterior(page, {
      node_id: "inn",
      name: "The Wayward Inn",
      tags: ["commerce", "rest"],
    });
    expect(inn.buildingType).toBe("inn");
    expect(inn.roomW).toBeGreaterThanOrEqual(18);
    expect(inn.roomW).toBeLessThanOrEqual(20);
    expect(inn.roomH).toBeGreaterThanOrEqual(12);
    expect(inn.roomH).toBeLessThanOrEqual(14);
    expect(inn.npcPositions.length).toBeGreaterThanOrEqual(3);

    await page.screenshot({
      path: path.join(SPEC_DIR, `issue-132-inn-interior-${RUN_ID}.png`),
      fullPage: true,
    });

    await moveToNpc(page, 0);
    await page.evaluate(() => window.__kithlandsTest.interact("Town"));
    await page.screenshot({
      path: path.join(SPEC_DIR, `issue-132-inn-side-quest-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.waitForFunction(
      () =>
        (window.__kithlandsTest.gameState("Town")?.building_side_quests || [])
          .length >= 1,
    );

    const innState = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    expect(innState.building_side_quests?.length || 0).toBeGreaterThanOrEqual(
      1,
    );
    expect(innState.building_side_quests[0].status).toBe("accepted");

    const temple = await visitInterior(
      page,
      {
        node_id: "temple",
        name: "Temple of Light",
        tags: ["temple", "revive"],
      },
      "Town",
    );
    expect(temple.buildingType).toBe("temple");
    expect(temple.roomW).toBeGreaterThanOrEqual(18);
    expect(temple.roomW).toBeLessThanOrEqual(20);
    expect(temple.roomH).toBeGreaterThanOrEqual(12);
    expect(temple.roomH).toBeLessThanOrEqual(16);
    expect(temple.npcPositions.length).toBeGreaterThanOrEqual(3);

    await page.screenshot({
      path: path.join(SPEC_DIR, `issue-132-temple-interior-${RUN_ID}.png`),
      fullPage: true,
    });

    await moveToNpc(page, 1);
    await page.evaluate(() => window.__kithlandsTest.interact("Town"));
    await page.screenshot({
      path: path.join(SPEC_DIR, `issue-132-temple-dialogue-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
