import { playSFX } from "../systems/audio.js";
import { isTouchDevice } from "../systems/input.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { isRestBuilding } from "./building_type.js";
import { TILE_COLORS } from "./tileConstants.js";

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
  pauseWorldFor(scene, "world_map");
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

  // Quest target marker (issue #86). Highlights the current main quest's
  // target building so the player can see where to go.
  const gs = scene.gameState;
  if (gs && gs.quests && gs.current_quest < gs.quests.length) {
    const current = gs.quests[gs.current_quest];
    const targetNodeID = current && current.target_node_id;
    if (targetNodeID) {
      const target = scene.spawns.find((s) => s.node_id === targetNodeID);
      if (target) {
        const tx = mmX + target.x * scaleX;
        const ty = mmY + target.y * scaleY;
        const marker = scene.add
          .circle(tx, ty, 7, 0xffff00, 0)
          .setStrokeStyle(2, 0xffff00, 1)
          .setScrollFactor(0)
          .setDepth(52);
        ol.push(marker);
        const star = scene.add
          .text(tx, ty, "★", {
            fontSize: "11px",
            color: "#ffff44",
            fontFamily: "monospace",
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(53);
        ol.push(star);
      }
    }
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
        resumeWorldFor(scene, "world_map");
      }),
  );

  scene.input.keyboard.once("keydown-ESC", () => {
    ol.forEach((o) => o.destroy());
    resumeWorldFor(scene, "world_map");
  });
}

export function showInteractPrompt(scene, spawn) {
  hideInteractPrompt(scene);
  const tags = spawn.tags || [];
  let action = "Enter";
  if (tags.includes("shop") || tags.includes("commerce")) action = "Shop";
  else if (isRestBuilding(tags)) action = "Rest";
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
