import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

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
  house: loadTemplate("house_elder_study_1f.json"),
  inn: loadTemplate("inn_gilded_steps_2f.json"),
  shop: loadTemplate("shop_backroom_stock_1f.json"),
  temple: loadTemplate("temple_crypt_2f.json"),
};

const ROLE_TEMPLATE = {
  id: "proof_role_lineup_1f",
  building_type: "house",
  floors: [
    {
      floor_id: 0,
      width: 14,
      height: 10,
      rows: [
        "WWWWWWWWWWWWWW",
        "W............W",
        "W....MMMM....W",
        "W............W",
        "W............W",
        "W............W",
        "W......F.....W",
        "W............W",
        "W............W",
        "WWWWWWWDWWWWWW",
      ],
      entrance: { x: 7, y: 9, from: "overworld" },
      npc_anchors: [
        { role: "elder", x: 4, y: 4 },
        { role: "quest_giver", x: 7, y: 4 },
        { role: "gossip", x: 10, y: 4 },
      ],
      window_anchors: [
        { x: 4, y: 0, side: "north" },
        { x: 9, y: 0, side: "north" },
      ],
      light_anchors: [{ x: 11, y: 1, kind: "lantern" }],
      chest_anchors: [],
    },
  ],
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

async function startTown(page, spawn, sceneData = {}) {
  await page.evaluate(
    ({ nextSpawn, nextSceneData }) =>
      window.__kithlandsTest.startTownScene(nextSpawn, "World", nextSceneData),
    { nextSpawn: spawn, nextSceneData: sceneData },
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Town"),
  );
  await page.waitForTimeout(180);
  return page.evaluate(() => window.__kithlandsTest.townSnapshot("Town"));
}

async function addOverlay(page, label) {
  await page.evaluate((text) => {
    let overlay = document.getElementById("issue-246-proof-label");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "issue-246-proof-label";
      overlay.style.position = "fixed";
      overlay.style.top = "12px";
      overlay.style.left = "12px";
      overlay.style.zIndex = "99999";
      overlay.style.padding = "8px 10px";
      overlay.style.background = "rgba(7, 13, 24, 0.88)";
      overlay.style.border = "2px solid #c8a45b";
      overlay.style.color = "#f7efe0";
      overlay.style.font = "600 12px monospace";
      overlay.style.letterSpacing = "0.04em";
      document.body.appendChild(overlay);
    }
    overlay.textContent = text;
  }, label);
}

async function captureCanvas(page, suffix) {
  await addOverlay(page, suffix.replace(/-/g, " ").toUpperCase());
  const target = path.join(PROOF_DIR, `issue-246-${suffix}-${RUN_ID}.png`);
  await page.locator("canvas").screenshot({ path: target });
  return target;
}

async function captureCanvasClip(page, suffix, clip) {
  await addOverlay(page, suffix.replace(/-/g, " ").toUpperCase());
  const canvasBox = await page.locator("canvas").boundingBox();
  if (!canvasBox) throw new Error("canvas bounding box missing");
  const scaleX = canvasBox.width / 800;
  const scaleY = canvasBox.height / 600;
  const target = path.join(PROOF_DIR, `issue-246-${suffix}-${RUN_ID}.png`);
  await page.screenshot({
    path: target,
    clip: {
      x: canvasBox.x + clip.x * scaleX,
      y: canvasBox.y + clip.y * scaleY,
      width: clip.width * scaleX,
      height: clip.height * scaleY,
    },
  });
  return target;
}

function tileClip(snapshot, x, y, widthTiles = 3, heightTiles = 3) {
  return {
    x: snapshot.offsetX + x * 32 - 8,
    y: snapshot.offsetY + y * 32 - 8,
    width: widthTiles * 32 + 16,
    height: heightTiles * 32 + 16,
  };
}

test("captures issue 246 proof set", async ({ page }) => {
  test.setTimeout(60000);
  await startQuickGame(page);

  const house = await startTown(page, {
    node_id: "issue246_house",
    name: "Elder Study",
    tags: ["house"],
    building_type: "house",
    interior_seed: 24601,
    interior_template: TEMPLATES.house,
  });
  expect(house.npcKeys).toContain("npc_elder");
  expect(house.npcKeys).toContain("npc_quest_giver");
  await captureCanvas(page, "house-full");
  await captureCanvasClip(
    page,
    "chest-closeup",
    tileClip(house, house.chests[0].x, house.chests[0].y, 3, 3),
  );

  const shop = await startTown(page, {
    node_id: "issue246_shop",
    name: "Backroom Stock",
    tags: ["shop", "commerce"],
    building_type: "shop",
    interior_seed: 24602,
    interior_template: TEMPLATES.shop,
  });
  expect(shop.npcKeys).toContain("npc_merchant");
  expect(shop.npcKeys).toContain("npc_flavor_bram");
  await captureCanvas(page, "shop-full");

  const inn = await startTown(page, {
    node_id: "issue246_inn",
    name: "Gilded Steps Inn",
    tags: ["rest"],
    building_type: "inn",
    interior_seed: 24603,
    interior_template: TEMPLATES.inn,
  });
  expect(inn.floorCount).toBe(2);
  await captureCanvas(page, "inn-floor-1");

  const stair = inn.stairs[0];
  await page.evaluate(
    ({ x, y }) => window.__kithlandsTest.teleportTownPlayer(x, y + 1, "Town"),
    { x: stair.x, y: stair.y },
  );
  await page.evaluate(() => window.__kithlandsTest.movePlayer("up", "Town"));
  await page.waitForFunction(
    () => window.__kithlandsTest.townSnapshot("Town").floorIndex === 1,
  );
  const innUpper = await page.evaluate(() =>
    window.__kithlandsTest.townSnapshot("Town"),
  );
  expect(innUpper.floorIndex).toBe(1);
  await captureCanvas(page, "inn-floor-2");

  const temple = await startTown(
    page,
    {
      node_id: "issue246_temple",
      name: "Temple Crypt",
      tags: ["temple", "revive"],
      building_type: "temple",
      interior_seed: 24604,
      interior_template: TEMPLATES.temple,
    },
    { floorIndex: 1, playerStart: { x: 6, y: 5 } },
  );
  expect(temple.secretWallCount).toBeGreaterThan(0);
  await page.evaluate(() => window.__kithlandsTest.movePlayer("right", "Town"));
  await page.evaluate(() => window.__kithlandsTest.movePlayer("right", "Town"));
  await captureCanvas(page, "temple-secret-floor");

  const roles = await startTown(page, {
    node_id: "issue246_roles",
    name: "Role Lineup",
    tags: ["house"],
    building_type: "house",
    interior_seed: 24605,
    interior_template: ROLE_TEMPLATE,
  });
  expect(roles.npcKeys).toEqual(["npc_elder", "npc_quest_giver", "npc_gossip"]);
  const minNpcX = Math.min(...roles.npcPositions.map((npc) => npc.x));
  const maxNpcX = Math.max(...roles.npcPositions.map((npc) => npc.x));
  const minNpcY = Math.min(...roles.npcPositions.map((npc) => npc.y));
  const maxNpcY = Math.max(...roles.npcPositions.map((npc) => npc.y));
  await captureCanvasClip(page, "npc-role-lineup", {
    x: roles.offsetX + minNpcX * 32 - 32,
    y: roles.offsetY + minNpcY * 32 - 48,
    width: (maxNpcX - minNpcX + 3) * 32,
    height: (maxNpcY - minNpcY + 4) * 32,
  });
});
