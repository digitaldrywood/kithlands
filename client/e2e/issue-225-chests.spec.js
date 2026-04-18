import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.join(SPEC_DIR, "tmp");
const WALKABLE_TILES = new Set([".", "D", "R", "S", "U", "V"]);

mkdirSync(PROOF_DIR, { recursive: true });

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function waitForScene(page, sceneKey) {
  await page.waitForFunction(
    (expected) => window.__kithlandsTest.sceneIsActive(expected),
    sceneKey,
  );
}

async function startQuickGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await waitForScene(page, "World");
}

async function captureProof(page, suffix) {
  const target = path.join(PROOF_DIR, `issue-225-${suffix}-${RUN_ID}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function addProofOverlay(page, label) {
  await page.evaluate((overlayLabel) => {
    const existing = document.getElementById("issue-225-proof");
    if (existing) existing.remove();

    const activeScene = ["Battle", "Town", "World", "Title"].find((sceneKey) =>
      window.__kithlandsTest.sceneIsActive(sceneKey),
    );
    const gameState =
      window.__kithlandsTest.gameState(activeScene) ||
      window.__kithlandsTest.gameState("World");
    const townSnapshot =
      activeScene === "Town"
        ? window.__kithlandsTest.townSnapshot("Town")
        : null;
    const visibleTexts = (
      window.__kithlandsTest.visibleTexts(activeScene) || []
    )
      .map((entry) => entry.text)
      .filter(Boolean)
      .slice(0, 5);

    const panel = document.createElement("div");
    panel.id = "issue-225-proof";
    panel.style.position = "fixed";
    panel.style.top = "8px";
    panel.style.left = "8px";
    panel.style.zIndex = "9999";
    panel.style.background = "rgba(15, 23, 42, 0.92)";
    panel.style.color = "#e2e8f0";
    panel.style.padding = "10px 12px";
    panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
    panel.style.borderRadius = "8px";
    panel.style.fontFamily = "monospace";
    panel.style.fontSize = "12px";
    panel.style.whiteSpace = "pre";

    const lines = [
      overlayLabel,
      `Scene: ${activeScene}`,
      `Message: ${gameState?.message || "(none)"}`,
    ];
    if (townSnapshot) {
      const openChests = townSnapshot.chests
        .filter((chest) => chest.opened)
        .map((chest) => chest.id);
      lines.push(
        `Town: ${townSnapshot.templateId || "custom"} f${townSnapshot.floorIndex + 1}`,
      );
      lines.push(`Open chests: ${openChests.join(", ") || "(none)"}`);
    }
    if (visibleTexts.length > 0) {
      lines.push(`Texts: ${visibleTexts.join(" | ")}`);
    }
    panel.textContent = lines.join("\n");
    document.body.appendChild(panel);
  }, label);
}

async function worldSpawnByChest(page, chestId) {
  return page.evaluate((targetChestId) => {
    const spawns =
      window.__kithlandsTest.gameState("World")?.tilemap?.spawns || [];
    return (
      spawns.find((spawn) =>
        (spawn.interior_template?.floors || []).some((floor) =>
          (floor.chest_anchors || []).some(
            (chest) => chest.id === targetChestId,
          ),
        ),
      ) || null
    );
  }, chestId);
}

async function worldSpawnById(page, nodeId) {
  return page.evaluate((targetNodeId) => {
    const spawns =
      window.__kithlandsTest.gameState("World")?.tilemap?.spawns || [];
    return spawns.find((spawn) => spawn.node_id === targetNodeId) || null;
  }, nodeId);
}

function chestFloorData(spawn, chestId) {
  for (
    let floorIndex = 0;
    floorIndex < (spawn.interior_template?.floors || []).length;
    floorIndex += 1
  ) {
    const floor = spawn.interior_template.floors[floorIndex];
    const chest = (floor.chest_anchors || []).find(
      (entry) => entry.id === chestId,
    );
    if (chest) {
      return { floorIndex, floor, chest };
    }
  }
  throw new Error(`Chest ${chestId} not found in spawn ${spawn?.node_id}`);
}

function isWalkableTile(floor, x, y) {
  if (y < 0 || y >= floor.rows.length) return false;
  if (x < 0 || x >= floor.rows[y].length) return false;
  return WALKABLE_TILES.has(floor.rows[y][x]);
}

function chestApproach(floor, chest) {
  const candidates = [
    { x: chest.x, y: chest.y + 1, moveDir: "up", startDx: 0, startDy: 1 },
    { x: chest.x, y: chest.y - 1, moveDir: "down", startDx: 0, startDy: -1 },
    { x: chest.x - 1, y: chest.y, moveDir: "right", startDx: -1, startDy: 0 },
    { x: chest.x + 1, y: chest.y, moveDir: "left", startDx: 1, startDy: 0 },
  ];

  for (const candidate of candidates) {
    if (!isWalkableTile(floor, candidate.x, candidate.y)) continue;

    const walkStart = {
      x: candidate.x + candidate.startDx,
      y: candidate.y + candidate.startDy,
    };
    if (isWalkableTile(floor, walkStart.x, walkStart.y)) {
      return {
        playerStart: walkStart,
        finalTile: { x: candidate.x, y: candidate.y },
        moveDir: candidate.moveDir,
      };
    }

    return {
      playerStart: { x: candidate.x, y: candidate.y },
      finalTile: { x: candidate.x, y: candidate.y },
      moveDir: null,
    };
  }

  throw new Error(`No walkable approach found for chest ${chest.id}`);
}

async function startTownAtChest(page, spawn, chestId) {
  const { floorIndex, floor, chest } = chestFloorData(spawn, chestId);
  const approach = chestApproach(floor, chest);

  await page.evaluate(
    ({ nextSpawn, sceneData }) =>
      window.__kithlandsTest.startTownScene(nextSpawn, "World", sceneData),
    {
      nextSpawn: spawn,
      sceneData: {
        floorIndex,
        playerStart: approach.playerStart,
      },
    },
  );
  await waitForScene(page, "Town");
  await page.waitForTimeout(150);

  if (approach.moveDir) {
    await page.evaluate(
      (dir) => window.__kithlandsTest.movePlayer(dir, "Town"),
      approach.moveDir,
    );
  }

  await page.waitForFunction(
    ({ x, y, chestId: expectedChestId }) => {
      const snapshot = window.__kithlandsTest.townSnapshot("Town");
      return (
        snapshot.playerX === x &&
        snapshot.playerY === y &&
        snapshot.chests.some((chest) => chest.id === expectedChestId)
      );
    },
    {
      x: approach.finalTile.x,
      y: approach.finalTile.y,
      chestId,
    },
  );

  return { floorIndex, chest, approach };
}

test.describe("issue 225 chest system", () => {
  test("normal chest persists open state through save/load and mimic chests resolve correctly", async ({
    page,
  }) => {
    await startQuickGame(page);

    const itemChestId = "riverrest_guest_cache";
    const itemSpawn = await worldSpawnByChest(page, itemChestId);
    expect(itemSpawn).toBeTruthy();

    await startTownAtChest(page, itemSpawn, itemChestId);
    await page.evaluate(() => window.__kithlandsTest.beginInteract("Town"));
    await page.waitForFunction(() =>
      (window.__kithlandsTest.visibleTexts("Town") || []).some((entry) =>
        entry.text.includes("Received 2x Potion!"),
      ),
    );
    await page.waitForFunction(
      (expectedChestId) =>
        window.__kithlandsTest
          .townSnapshot("Town")
          .chests.find((chest) => chest.id === expectedChestId)?.opened ===
        true,
      itemChestId,
    );

    await addProofOverlay(page, "Normal chest opened: Received 2x Potion!");
    await captureProof(page, "normal-chest-open");

    const saveName = `Issue 225 chest save ${RUN_ID}`;
    const saveResult = await page.evaluate(
      (name) => window.__kithlandsTest.saveGame(name, "Town"),
      saveName,
    );
    expect(saveResult.status).toBe("saved");

    const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
    const savedEntry = saves.saves.find((entry) => entry.name === saveName);
    expect(savedEntry).toBeTruthy();

    await page.evaluate(
      (saveId) => window.__kithlandsTest.loadSave(saveId),
      savedEntry.id,
    );
    await waitForScene(page, "World");

    const reloadedItemSpawn = await worldSpawnById(page, itemSpawn.node_id);
    expect(reloadedItemSpawn).toBeTruthy();
    await startTownAtChest(page, reloadedItemSpawn, itemChestId);
    await page.waitForFunction(
      (expectedChestId) =>
        window.__kithlandsTest
          .townSnapshot("Town")
          .chests.find((chest) => chest.id === expectedChestId)?.opened ===
        true,
      itemChestId,
    );

    await addProofOverlay(page, "Reloaded save: chest remains open");
    await captureProof(page, "normal-chest-reload");

    await page.evaluate(() =>
      window.__kithlandsTest.startScene("World", {
        gameState: window.__kithlandsTest.gameState("Town"),
      }),
    );
    await waitForScene(page, "World");

    const mimicChestId = "crypt_reliquary";
    const mimicSpawn = await worldSpawnByChest(page, mimicChestId);
    expect(mimicSpawn).toBeTruthy();

    await startTownAtChest(page, mimicSpawn, mimicChestId);
    await page.evaluate(() => window.__kithlandsTest.beginInteract("Town"));
    await waitForScene(page, "Battle");
    await page.waitForFunction(() => {
      const battle = window.__kithlandsTest.gameState("Battle");
      return battle?.pending_chest_claim?.chest_id === "crypt_reliquary";
    });

    await addProofOverlay(page, "Mimic encounter triggered from chest");
    await captureProof(page, "mimic-battle");

    await page.evaluate(() => window.__kithlandsTest.forceVictory("Battle"));
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.sceneIsActive("Town") ||
        (window.__kithlandsTest.visibleTexts("Battle") || []).some((entry) =>
          entry.text.includes("VICTORY!"),
        ),
    );
    if (
      await page.evaluate(() => window.__kithlandsTest.sceneIsActive("Battle"))
    ) {
      await page.evaluate(() =>
        window.__kithlandsTest.pressKey("Space", "Battle"),
      );
      await page.waitForFunction(
        () =>
          window.__kithlandsTest.sceneIsActive("Town") ||
          (window.__kithlandsTest.visibleTexts("Battle") || []).some((entry) =>
            entry.text.includes("CONTINUE"),
          ),
      );
      if (
        await page.evaluate(() =>
          window.__kithlandsTest.sceneIsActive("Battle"),
        )
      ) {
        await page.evaluate(() =>
          window.__kithlandsTest.clickInteractiveText("CONTINUE", "Battle"),
        );
      }
    }
    await waitForScene(page, "Town");
    await page.waitForFunction(() =>
      (window.__kithlandsTest.visibleTexts("Town") || []).some((entry) =>
        entry.text.includes("Received 2x Phoenix Down!"),
      ),
    );
    await page.waitForFunction(
      (expectedChestId) =>
        window.__kithlandsTest
          .townSnapshot("Town")
          .chests.find((chest) => chest.id === expectedChestId)?.opened ===
        true,
      mimicChestId,
    );

    await addProofOverlay(
      page,
      "Mimic defeated: reward claimed and chest opened",
    );
    await captureProof(page, "mimic-reward");
  });
});
