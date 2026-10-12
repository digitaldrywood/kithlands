import { nearbyResource } from "./gatheringModel.js";
import { buildWalkAuditParty } from "./walkAuditMode.js";
import { showWorldMapDialog } from "../ui/world_map_menu.js";
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
import { openDialogue } from "./town_dialogue.js";
import { rememberWorldPosition } from "./worldMapCache.js";

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
  const spawns = (scene.spawns || []).filter(
    (spawn) =>
      !isNaturalSpawn(spawn) ||
      (naturalDiscoveryDisplay(scene.gameState, spawn.node_id) &&
        scene.gameState?.current_location?.kind === "world" &&
        scene.gameState.current_location.world_node_id === spawn.node_id),
  );
  const spawn = nearbyWorldInteraction(spawns, playerX, playerY);
  scene.currentResource = nearbyResource(
    scene.gameState?.resources,
    playerX,
    playerY,
  );
  if (scene.currentResource) {
    scene.currentDoorSpawn = null;
    scene.currentNaturalSpawn = null;
    hideInteractPrompt(scene);
    scene.explorationHUD?.interaction(`Gather — ${scene.currentResource.name}`);
    return scene.currentResource;
  }
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
  if (nearby[0]?.spawn.node_id === current) return null;
  return nearby[0]?.spawn || null;
}

export function currentWorldPosition(scene) {
  if (!Number.isInteger(scene?.playerX) || !Number.isInteger(scene?.playerY)) {
    return null;
  }
  return { x: scene.playerX, y: scene.playerY };
}

async function performWorldArrival(scene, checkpoint, step, debugNoEncounters) {
  const arrival = nearbyWorldArrival(scene);
  const nodeID =
    arrival?.node_id ||
    (checkpoint || step
      ? scene?.gameState?.current_location?.world_node_id || ""
      : "");
  const position = currentWorldPosition(scene);
  if (!nodeID || !position) return null;

  scene.worldArrivalPending = nodeID;
  try {
    let result = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await transitionLocation(
          scene.gameState.id,
          step ? "world-step" : "arrive-world-node",
          nodeID,
          position,
          ...(step ? [{ debugNoEncounters }] : []),
        );
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (!result?.error) {
        if (scene.scene?.isActive()) {
          // The developer walk route renders all twelve classes over a normal
          // server game. Keep that fixture after authoritative movement acks.
          scene.gameState =
            import.meta.env.DEV && scene.gameState.walk_audit
              ? {
                  ...result,
                  party: buildWalkAuditParty(result.party),
                  walk_audit: true,
                }
              : result;
          scene.updateHUD?.();
          scene.updateInteractionTarget?.();
        }
        rememberWorldPosition(scene.gameState.id, position, scene.playerDir);
        return result;
      }
    }
    return result;
  } finally {
    scene.worldArrivalPending = null;
  }
}

// Keep graph arrivals and exact tile checkpoints ordered. Saving chains onto
// this same promise, so it cannot overtake an in-flight movement arrival.
export function syncWorldArrival(
  scene,
  { checkpoint = false, step = false, debugNoEncounters = false } = {},
) {
  const previous = scene.worldArrivalPromise || Promise.resolve(null);
  const operation = previous
    .catch(() => null)
    .then(() =>
      performWorldArrival(scene, checkpoint, step, debugNoEncounters),
    );
  const settled = operation.finally(() => {
    if (scene.worldArrivalPromise === settled) {
      scene.worldArrivalPromise = null;
    }
  });
  scene.worldArrivalPromise = settled;
  return settled;
}

export async function checkpointWorldPosition(scene) {
  if (scene?.worldStepDone) {
    const accepted = await scene.worldStepDone;
    if (accepted === false) throw new Error("the last world step was rejected");
  }
  if (scene?.worldArrivalPromise) await scene.worldArrivalPromise;
  const result = await syncWorldArrival(scene, { checkpoint: true });
  if (result?.error) throw new Error(result.error);
  return currentWorldPosition(scene);
}

export async function interactWithDoor(scene) {
  if (scene.animating || scene.menuOpen || scene.gameOver) return;
  const spawn = scene.currentDoorSpawn;
  if (!spawn) return;

  hideInteractPrompt(scene);
  scene.currentDoorSpawn = null;
  scene.animating = true;

  try {
    await checkpointWorldPosition(scene);
  } catch (error) {
    scene.animating = false;
    scene.showMessage?.(
      `Travel paused: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

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
      currentWorldPosition(scene),
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
  return showWorldMapDialog(scene);
}

export function showInteractPrompt(scene, spawn) {
  hideInteractPrompt(scene);
  const tags = spawn.tags || [];
  const portrait = scene.gameplayLayout?.portrait === true;
  const destination =
    String(spawn.name || "").trim() ||
    String(spawn.node_id || "Destination").trim();
  let action = "Enter";
  if (isNaturalSpawn(spawn)) {
    action =
      pendingNaturalDiscovery(scene.gameState, spawn.node_id)?.prompt?.trim() ||
      "Explore";
  } else if (isRestBuilding(tags)) action = "Rest";
  else if (tags.includes("shop") || tags.includes("commerce")) action = "Shop";
  else if (tags.includes("temple") || tags.includes("revive")) action = "Pray";

  if (scene.explorationHUD) {
    scene.explorationHUD.interaction(`${action} — ${destination}`);
    return;
  }
  scene.interactPrompt = scene.add
    .text(
      scene.player.x,
      scene.player.y - (portrait ? 72 : 54),
      `${isTouchDevice() ? "[ TAP A ]" : "[ ENTER ]"} ${action} — ${destination}`,
      {
        fontSize: portrait ? "24px" : "10px",
        color: "#ffff44",
        fontFamily: portrait
          ? "Trebuchet MS, Arial, sans-serif"
          : "Arial, sans-serif",
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
  scene.explorationHUD?.interaction("");
  if (scene.interactPrompt) {
    scene.interactPrompt.destroy();
    scene.interactPrompt = null;
  }
}
