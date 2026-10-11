import { nearbyResource } from "./gatheringModel.js";
import { gatherResource } from "../api.js";
import { checkpointWorldPosition } from "./world_interact.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";

export function renderWorldResources(scene, tileSize) {
  scene.resourceTileSize = tileSize;
  const group = scene.add.group();
  for (const node of scene.gameState.resources || []) {
    if (node.gathered) continue;
    const x = (node.x + 0.5) * tileSize;
    const y = (node.y + 0.7) * tileSize;
    const art = scene.add.graphics().setPosition(x, y).setDepth(2);
    art.fillStyle(0x071c16, 0.5).fillEllipse(0, 2, 24, 9);
    if (node.visual === "herb") {
      art.lineStyle(2, 0x6e9852).lineBetween(0, 1, 0, -15);
      art
        .fillStyle(0x3b6841)
        .fillEllipse(-6, -6, 13, 7)
        .fillEllipse(6, -10, 13, 7);
      art
        .fillStyle(0x83b866)
        .fillEllipse(-5, -9, 10, 5)
        .fillEllipse(5, -13, 10, 5);
      art.fillStyle(0xeee3b1).fillCircle(0, -17, 3).fillCircle(3, -15, 2);
    } else {
      art
        .fillStyle(0x5c6366)
        .fillTriangle(-13, 1, -6, -13, 5, 1)
        .fillTriangle(-2, 2, 5, -17, 14, 2);
      art.fillStyle(0x768584).fillTriangle(-7, -10, -6, -13, -1, -1);
      art.fillStyle(0xb97747).fillTriangle(2, -4, 5, -14, 9, -3);
      art.lineStyle(1, 0xffd49a).lineBetween(5, -14, 5, -5);
    }
    art.lineStyle(1, 0xe8d49a, 0.8).strokeEllipse(0, 2, 28, 12);
    group.add(art);
  }
  if (!scene.resourceArt)
    scene.events.once("shutdown", () => {
      scene.resourceArt?.destroy(true);
      scene.resourceArt = null;
    });
  scene.resourceArt?.destroy(true);
  scene.resourceArt = group;
}

export async function gatherNearbyResource(scene) {
  if (scene.animating || scene.menuOpen || scene.gatheringPending) return;
  const resource = nearbyResource(
    scene.gameState.resources,
    scene.playerX,
    scene.playerY,
  );
  if (!resource) return;
  const gameID = scene.gameState.id;
  scene.gatheringPending = true;
  pauseWorldFor(scene, "gathering");
  try {
    await checkpointWorldPosition(scene);
    const next = await gatherResource(gameID, resource.id);
    if (!scene.scene.isActive() || scene.gameState.id !== gameID) return;
    if (next.error) throw new Error(next.error);
    scene.gameState = next;
    renderWorldResources(scene, scene.resourceTileSize);
    scene.updateHUD?.();
    scene.showMessage?.(next.message);
    scene.updateInteractionTarget?.();
  } catch (error) {
    if (scene.scene.isActive())
      scene.showMessage?.(error.message || "Gathering could not be completed.");
  } finally {
    scene.gatheringPending = false;
    resumeWorldFor(scene, "gathering");
  }
}
