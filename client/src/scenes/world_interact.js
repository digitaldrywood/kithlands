import { playSFX } from "../systems/audio.js";
import { isTouchDevice } from "../systems/input.js";
import {
  hasWorldLock,
  isWorldInputLocked,
  pauseWorldFor,
  resumeWorldFor,
} from "../systems/modalLock.js";
import { gameAction, transitionLocation } from "../api.js";
import { isRestBuilding } from "./building_type.js";
import { TILE_COLORS } from "./tileConstants.js";
import { openDialogue } from "./town_dialogue.js";

function isNaturalSpawn(spawn) {
  return (spawn?.kind || "").toLowerCase() === "natural";
}

export function pendingNaturalDiscovery(gameState, nodeId) {
  return (gameState?.natural_discoveries || []).find(
    (discovery) => discovery.node_id === nodeId && discovery.claimed !== true,
  );
}

export function naturalDiscoveryDisplay(gameState, nodeId) {
  const discoveries = (gameState?.natural_discoveries || []).filter(
    (discovery) => discovery.node_id === nodeId,
  );
  return pendingNaturalDiscovery(gameState, nodeId) || discoveries.at(-1);
}

export function nearbyWorldInteraction(spawns, playerX, playerY) {
  return (spawns || [])
    .filter(
      (spawn) =>
        Math.abs(spawn.x - playerX) <= 1 && Math.abs(spawn.y - playerY) <= 2,
    )
    .sort((a, b) => {
      const distanceA = Math.abs(a.x - playerX) + Math.abs(a.y - playerY);
      const distanceB = Math.abs(b.x - playerX) + Math.abs(b.y - playerY);
      if (distanceA !== distanceB) return distanceA - distanceB;
      return Number(isNaturalSpawn(a)) - Number(isNaturalSpawn(b));
    })[0];
}

export function updateWorldInteractionTarget(scene, playerX, playerY) {
  const spawn = nearbyWorldInteraction(scene.spawns, playerX, playerY);
  scene.currentDoorSpawn = spawn && !isNaturalSpawn(spawn) ? spawn : null;
  scene.currentNaturalSpawn = spawn && isNaturalSpawn(spawn) ? spawn : null;
  if (spawn) showInteractPrompt(scene, spawn);
  else hideInteractPrompt(scene);
  return spawn || null;
}

export function nearbyWorldArrival(scene) {
  if (scene?.gameState?.current_location?.kind !== "world") return null;
  const current = scene.gameState.current_location.world_node_id;
  const nearby = (scene.spawns || [])
    .map((spawn) => ({
      spawn,
      distance:
        Math.abs(scene.playerX - spawn.x) + Math.abs(scene.playerY - spawn.y),
    }))
    .filter(({ distance }) => distance <= 3)
    .sort((a, b) => a.distance - b.distance);
  if (nearby.some(({ spawn }) => spawn.node_id === current)) return null;
  return nearby[0]?.spawn || null;
}

// Keep the server's graph arrival in step with ordinary on-foot movement.
// Calls are serialized so a fast held key cannot reorder adjacent arrivals.
export async function syncWorldArrival(scene) {
  const arrival = nearbyWorldArrival(scene);
  if (!arrival) return null;
  if (scene.worldArrivalPending) {
    scene.worldArrivalQueued = true;
    return null;
  }

  scene.worldArrivalPending = arrival.node_id;
  try {
    let result = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await transitionLocation(
          scene.gameState.id,
          "arrive-world-node",
          arrival.node_id,
        );
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (!result?.error) {
        if (scene.scene?.isActive()) {
          scene.gameState = result;
          scene.updateHUD?.();
        }
        return result;
      }
    }
    return result;
  } finally {
    scene.worldArrivalPending = null;
    if (scene.worldArrivalQueued) {
      scene.worldArrivalQueued = false;
      void syncWorldArrival(scene);
    }
  }
}

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

  // World.create routes story phases to the guardian battle, promotion
  // prompt, or ending. Entering an interior here would hide that result.
  if (
    ["combat", "promotion", "victory", "defeat"].includes(
      scene.gameState?.phase,
    )
  ) {
    scene.scene.start("World", { gameState: scene.gameState });
    return;
  }

  const entersAuthoredSettlement =
    scene.gameState?.settlement_map &&
    scene.gameState?.settlement_entry_node_id === spawn.node_id;
  if (entersAuthoredSettlement) {
    const result = await transitionLocation(
      scene.gameState.id,
      "enter-settlement",
      spawn.node_id,
    );
    if (result?.error) {
      scene.animating = false;
      scene.showMessage?.(result.error);
      return;
    }
    scene.gameState = result;
  }

  // Transition to the authored exterior or the existing direct interior.
  playSFX("sfx_door");
  scene.cameras.main.fadeOut(300, 0, 0, 0);
  scene.cameras.main.once("camerafadeoutcomplete", () => {
    if (entersAuthoredSettlement) {
      scene.scene.start("Settlement", { gameState: scene.gameState });
      return;
    }
    scene.scene.start("Town", { gameState: scene.gameState, spawn });
  });
}

function refreshWorldPresentation(scene) {
  scene.updateHUD?.();
  scene.updateQuestDisplay?.();
  scene.updateVehicleIndicator?.();
}

function showTransientError(scene, message) {
  scene.showMessage?.(message);
  scene.time?.delayedCall?.(3000, () => scene.hideMessage?.());
}

function restoreWorldInteraction(scene) {
  scene.animating = false;
  scene.updateInteractionTarget?.();
}

export async function interactWithNaturalNode(scene) {
  if (
    scene.naturalInteractionActive ||
    isWorldInputLocked(scene) ||
    scene.menuOpen ||
    scene.gameOver
  )
    return;
  const spawn = scene.currentNaturalSpawn;
  if (!spawn?.node_id || !scene.gameState?.id) return;

  const discovery = naturalDiscoveryDisplay(scene.gameState, spawn.node_id);
  scene.naturalInteractionActive = true;
  hideInteractPrompt(scene);
  pauseWorldFor(scene, "natural_discovery_request");
  scene.animating = true;

  try {
    const result = await gameAction(scene.gameState.id, {
      type: "natural_discovery",
      node_id: spawn.node_id,
    });
    if (!result || result.error) {
      showTransientError(
        scene,
        result?.error || "Could not explore this landmark. Please try again.",
      );
      return;
    }

    scene.gameState = result;
    refreshWorldPresentation(scene);
    await scene.triggerAutosave?.("natural_discovery");
    if (!result.message) return;

    resumeWorldFor(scene, "natural_discovery_request");
    scene.animating = false;
    await openDialogue(scene, spawn, {
      npc_name: discovery?.title || spawn.name,
      lines: [result.message],
    });
  } catch (error) {
    console.error("[World] natural discovery failed:", error);
    showTransientError(
      scene,
      "Could not explore this landmark. Please try again.",
    );
  } finally {
    if (hasWorldLock(scene, "natural_discovery_request")) {
      resumeWorldFor(scene, "natural_discovery_request");
    }
    scene.naturalInteractionActive = false;
    restoreWorldInteraction(scene);
  }
}

export function canShowWorldMap(scene) {
  const { mapW, mapH, tileData, spawns, playerX, playerY } = scene || {};
  return (
    Number.isInteger(mapW) &&
    mapW > 0 &&
    Number.isInteger(mapH) &&
    mapH > 0 &&
    Array.isArray(tileData) &&
    tileData.length >= mapH &&
    Array.from({ length: mapH }, (_, y) => tileData[y]).every(
      (row) => Array.isArray(row) && row.length >= mapW,
    ) &&
    Array.isArray(spawns) &&
    Number.isFinite(playerX) &&
    Number.isFinite(playerY)
  );
}

export function showWorldMap(scene) {
  if (!canShowWorldMap(scene)) return;

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
    const sx = mmX + spawn.x * scaleX;
    const sy = mmY + spawn.y * scaleY;

    mmGfx.fillStyle(isNaturalSpawn(spawn) ? 0x9fd27d : 0xffffff, 1);
    mmGfx.fillRect(sx - 2, sy - 2, 5, 5);

    const label = scene.add
      .text(sx, sy - 8, spawn.name, {
        fontSize: "7px",
        color: isNaturalSpawn(spawn) ? "#dff5c9" : "#ffffff",
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
  const portrait = scene.gameplayLayout?.portrait === true;
  let action = "Enter";
  if (isNaturalSpawn(spawn)) {
    action =
      pendingNaturalDiscovery(scene.gameState, spawn.node_id)?.prompt?.trim() ||
      "Explore";
  } else if (isRestBuilding(tags)) action = "Rest";
  else if (tags.includes("shop") || tags.includes("commerce")) action = "Shop";
  else if (tags.includes("temple") || tags.includes("revive")) action = "Pray";

  scene.interactPrompt = scene.add
    .text(
      scene.player.x,
      scene.player.y - (portrait ? 72 : 54),
      `${isTouchDevice() ? "[ TAP A ]" : "[ ENTER ]"} ${action}`,
      {
        fontSize: portrait ? "24px" : "10px",
        color: "#ffff44",
        fontFamily: portrait ? "Trebuchet MS, Arial, sans-serif" : "monospace",
        backgroundColor: "#000000cc",
        padding: portrait ? { x: 12, y: 7 } : { x: 6, y: 3 },
        align: "center",
        wordWrap: { width: portrait ? 520 : 360 },
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
