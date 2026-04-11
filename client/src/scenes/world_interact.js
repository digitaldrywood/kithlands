import { playSFX } from "../systems/audio.js";
import { isTouchDevice } from "../systems/input.js";

// TILE_COLORS needed for world map rendering
const TILE_COLORS = {
  0: 0x4caf50, // grass
  1: 0xd2b48c, // path
  2: 0x2196f3, // water
  3: 0x2e7d32, // tree
  4: 0x795548, // building
  5: 0xffc107, // door
  6: 0xbcaaa4, // floor
  7: 0x9e9e9e, // rock
  8: 0x66bb6a, // bush
  9: 0x388e3c, // dark grass
  10: 0x1b5e20, // forest (darker)
  11: 0x8d6e63, // hill
  12: 0xffe082, // sand
};

export async function interactWithDoor(scene) {
  if (scene.animating || scene.menuOpen || scene.gameOver) return;
  const spawn = scene.currentDoorSpawn;
  if (!spawn) return;

  hideInteractPrompt(scene);
  scene.currentDoorSpawn = null;
  scene.animating = true;

  // Quest advance when entering any building (await so gameState is fresh).
  // Server requires node_id to validate the player actually reached the quest
  // target (issue #63).
  const gs = scene.gameState;
  if (gs.current_quest < gs.quests.length) {
    await scene.triggerQuestAdvance(spawn.name, spawn.node_id);
  }

  // Transition to interior scene
  playSFX("sfx_door");
  scene.cameras.main.fadeOut(300, 0, 0, 0);
  scene.cameras.main.once("camerafadeoutcomplete", () => {
    scene.scene.start("Town", { gameState: scene.gameState, spawn });
  });
}

export function showWorldMap(scene) {
  scene.animating = true;
  const ol = [];

  // Full screen map overlay
  const bg = scene.add
    .rectangle(400, 300, 780, 560, 0x000000, 0.95)
    .setScrollFactor(0)
    .setDepth(50)
    .setInteractive();
  ol.push(bg);

  ol.push(
    scene.add
      .text(400, 30, "WORLD MAP", {
        fontSize: "18px",
        color: "#ffff44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(51),
  );

  // Draw large minimap
  const mmW = 600,
    mmH = 440;
  const mmX = 100,
    mmY = 55;
  const scaleX = mmW / scene.mapW;
  const scaleY = mmH / scene.mapH;

  const mmGfx = scene.add.graphics().setScrollFactor(0).setDepth(51);
  for (let y = 0; y < scene.mapH; y++) {
    for (let x = 0; x < scene.mapW; x++) {
      const tile = scene.tileData[y][x];
      const color = TILE_COLORS[tile] || 0x000000;
      mmGfx.fillStyle(color, 1);
      mmGfx.fillRect(
        mmX + x * scaleX,
        mmY + y * scaleY,
        Math.max(1, scaleX),
        Math.max(1, scaleY),
      );
    }
  }
  ol.push(mmGfx);

  // Location labels on the map
  for (const spawn of scene.spawns) {
    if (spawn.kind === "natural") continue;
    const sx = mmX + spawn.x * scaleX;
    const sy = mmY + spawn.y * scaleY;

    mmGfx.fillStyle(0xffffff, 1);
    mmGfx.fillRect(sx - 2, sy - 2, 5, 5);

    const label = scene.add
      .text(sx, sy - 8, spawn.name, {
        fontSize: "7px",
        color: "#ffffff",
        fontFamily: "monospace",
        backgroundColor: "#00000099",
        padding: { x: 1, y: 0 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(52);
    ol.push(label);
  }

  // Player position
  const px = mmX + scene.playerX * scaleX;
  const py = mmY + scene.playerY * scaleY;
  const playerDot = scene.add
    .circle(px, py, 4, 0xff4444)
    .setScrollFactor(0)
    .setDepth(52);
  ol.push(playerDot);

  ol.push(
    scene.add
      .text(400, 545, "[ CLOSE (ESC) ]", {
        fontSize: "13px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(51)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        ol.forEach((o) => o.destroy());
        scene.animating = false;
      }),
  );

  scene.input.keyboard.once("keydown-ESC", () => {
    ol.forEach((o) => o.destroy());
    scene.animating = false;
  });
}

export function showInteractPrompt(scene, spawn) {
  hideInteractPrompt(scene);
  const tags = spawn.tags || [];
  let action = "Enter";
  if (tags.includes("shop") || tags.includes("commerce")) action = "Shop";
  else if (tags.includes("rest")) action = "Rest";
  else if (tags.includes("temple") || tags.includes("revive")) action = "Pray";

  scene.interactPrompt = scene.add
    .text(
      scene.player.x,
      scene.player.y - 30,
      `${isTouchDevice() ? "[ TAP A ]" : "[ ENTER / SPACE ]"} ${action} at ${spawn.name}`,
      {
        fontSize: "10px",
        color: "#ffff44",
        fontFamily: "monospace",
        backgroundColor: "#000000cc",
        padding: { x: 6, y: 3 },
      },
    )
    .setOrigin(0.5)
    .setDepth(15);
}

export function hideInteractPrompt(scene) {
  if (scene.interactPrompt) {
    scene.interactPrompt.destroy();
    scene.interactPrompt = null;
  }
}
