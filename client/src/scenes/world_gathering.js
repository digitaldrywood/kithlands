import { nearbyResource } from "./gatheringModel.js";
import { gatherResource, getResourceStatus } from "../api.js";
import { checkpointWorldPosition } from "./world_interact.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import field from "../../../shared/field_presentation.json";

export function renderWorldResources(scene, tileSize) {
  scene.resourceTileSize = tileSize;
  const group = scene.add.group();
  for (const node of scene.gameState.resources || []) {
    renderHabitat(scene, group, node, tileSize);
    const x = (node.x + 0.5) * tileSize;
    const y = (node.y + 0.7) * tileSize;
    const art = scene.add.graphics().setPosition(x, y).setDepth(2);
    art.fillStyle(0x071c16, 0.5).fillEllipse(0, 2, 24, 9);
    if (node.gathered) {
      if (node.visual === "mineral") {
        art
          .fillStyle(0x50575a)
          .fillTriangle(-12, 1, -4, -8, 6, 1)
          .fillTriangle(0, 2, 7, -6, 14, 2);
        art.lineStyle(1, 0x222e30).lineBetween(-5, -4, 5, 0);
      } else if (node.visual === "wood") {
        art.fillStyle(0x75604b).fillEllipse(1, 0, 15, 7);
        art.lineStyle(1, 0xa69368).strokeEllipse(1, 0, 9, 4);
      } else {
        art
          .lineStyle(1, 0x88794c)
          .lineBetween(-4, 0, -3, -4)
          .lineBetween(3, 0, 4, -5);
      }
      group.add(art);
      continue;
    }
    const prop = field.meadow.resource_props[node.material_id];
    if (prop && scene.textures.exists(prop.key)) {
      const footY = (node.y + 0.95) * tileSize;
      const sprite = scene.add
        .image(x, footY, prop.key)
        .setOrigin(0.5, 1)
        .setDepth(10 + footY / 10000);
      sprite.resourceNodeID = node.id;
      group.add(art);
      group.add(sprite);
      continue;
    }
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
    } else if (node.visual === "wood") {
      art.fillStyle(0x614228).fillRoundedRect(-13, -9, 26, 11, 3);
      art
        .lineStyle(2, 0xb08858)
        .lineBetween(-9, -7, 8, -7)
        .lineBetween(-7, -3, 11, -3);
      art.fillStyle(0xc9a777).fillEllipse(12, -4, 6, 11);
      art.lineStyle(1, 0x775632).strokeEllipse(12, -4, 3, 6);
    } else {
      art
        .fillStyle(0x5c6366)
        .fillTriangle(-13, 1, -6, -13, 5, 1)
        .fillTriangle(-2, 2, 5, -17, 14, 2);
      art.fillStyle(0x768584).fillTriangle(-7, -10, -6, -13, -1, -1);
      art
        .fillStyle(node.required_level ? 0x6aade0 : 0xb97747)
        .fillTriangle(2, -4, 5, -14, 9, -3);
      art
        .lineStyle(1, node.required_level ? 0xc5f2ff : 0xffd49a)
        .lineBetween(5, -14, 5, -5);
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
  const waits = (scene.gameState.resources || [])
    .filter((n) => n.gathered)
    .map((n) => n.remaining_seconds);
  scene.resourceRefreshAt = waits.length
    ? performance.now() + Math.max(1, Math.min(...waits)) * 1000
    : Infinity;
  if (!scene.resourceRespawnTimer) {
    scene.resourceRespawnTimer = scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => refreshExpiredResources(scene),
    });
    scene.events.once("shutdown", () => {
      scene.resourceRespawnTimer?.remove();
      scene.resourceRespawnTimer = null;
    });
  }
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
    const material = next.materials?.find((m) => m.id === resource.material_id);
    scene.showMessage?.(
      `+${resource.quantity} ${material?.name || resource.name}`,
    );
    scene.updateInteractionTarget?.();
  } catch (error) {
    if (scene.scene.isActive())
      scene.showMessage?.(error.message || "Gathering could not be completed.");
  } finally {
    scene.gatheringPending = false;
    resumeWorldFor(scene, "gathering");
  }
}

// A local timer requests Go's confirmation; it never decides availability.
export async function refreshExpiredResources(scene) {
  if (
    performance.now() < scene.resourceRefreshAt ||
    scene.resourceRefreshPending ||
    scene.gatheringPending ||
    scene.animating ||
    scene.menuOpen
  )
    return;
  const snapshot = scene.gameState;
  scene.resourceRefreshPending = true;
  try {
    const result = await getResourceStatus(snapshot.id);
    if (!scene.scene.isActive() || scene.gameState !== snapshot) return;
    if (result.error || !Array.isArray(result.resources))
      throw new Error("Resource refresh failed");
    scene.gameState.resources = result.resources;
    renderWorldResources(scene, scene.resourceTileSize);
    scene.updateInteractionTarget?.();
  } catch {
    scene.resourceRefreshAt = performance.now() + 5000;
  } finally {
    scene.resourceRefreshPending = false;
  }
}

function renderHabitat(scene, group, node, tileSize) {
  const ground = scene.add.graphics().setDepth(0.6);
  for (const p of node.habitat_tiles || []) {
    const x = (p.x + 0.5) * tileSize,
      y = (p.y + 0.5) * tileSize;
    const seed = (p.x * 17 + p.y * 31) >>> 0;
    if (node.habitat === "rocky") {
      for (let i = 0; i < 4; i++) {
        const ox = ((seed + i * 13) % 27) - 13,
          oy = ((seed + i * 7) % 19) - 9;
        ground
          .fillStyle(i % 2 ? 0x697269 : 0x969987, 0.85)
          .fillRoundedRect(x + ox - 3, y + oy - 2, 7, 4, 2);
      }
    } else if (node.habitat === "woodland") {
      ground
        .fillStyle(0x38482c, 0.25)
        .fillEllipse(x, y, tileSize * 1.25, tileSize);
      for (let i = 0; i < 5; i++) {
        const ox = ((seed + i * 11) % 27) - 13,
          oy = ((seed + i * 9) % 23) - 11;
        ground
          .fillStyle(i % 2 ? 0x97704b : 0x70834b, 0.65)
          .fillEllipse(x + ox, y + oy, 5, 2);
      }
    } else {
      ground
        .fillStyle(0x60864c, 0.2)
        .fillEllipse(x, y, tileSize * 1.2, tileSize);
      for (let i = 0; i < 3; i++) {
        const ox = ((seed + i * 11) % 27) - 13,
          oy = ((seed + i * 9) % 23) - 11;
        ground
          .lineStyle(1, 0x345b36, 0.8)
          .lineBetween(x + ox, y + oy, x + ox - 2, y + oy - 5)
          .lineBetween(x + ox, y + oy, x + ox + 3, y + oy - 4);
        ground.fillStyle(0xd9d199, 0.75).fillCircle(x + ox - 2, y + oy - 5, 1);
      }
    }
  }
  group.add(ground);
}

// Visual-only ground details share existing terrain blending. Traversal still
// reads the canonical tile map; paths, water and structures stay untouched.
export function resourceTerrain(tiles, nodes) {
  const result = tiles.map((row) => row.slice());
  for (const node of nodes || []) {
    for (const p of node.habitat_tiles || []) {
      if (
        [0, 9, 11, 12].includes(tiles[p.y]?.[p.x]) &&
        [0, 9, 11].includes(node.surface_tile)
      )
        result[p.y][p.x] = node.surface_tile;
    }
  }
  return result;
}
