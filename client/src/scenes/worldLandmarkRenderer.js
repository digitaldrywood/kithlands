import {
  WORLD_LANDMARK_CATALOG,
  landmarkMarkerFor,
} from "../data/worldLandmarks.js";

const RENDERED_TILE = 32;

function worldPoint(spawn) {
  return {
    x: spawn.x * RENDERED_TILE + RENDERED_TILE / 2,
    y: spawn.y * RENDERED_TILE + RENDERED_TILE / 2,
  };
}

export function clearWorldLandmarks(scene) {
  scene.landmarkMarkerContainer?.destroy(true);
  scene.landmarkBadgeContainer?.destroy(true);
  scene.landmarkMarkerContainer = null;
  scene.landmarkBadgeContainer = null;
  scene.landmarkMarkerModels = [];
}

export function renderWorldLandmarks(
  scene,
  spawns = [],
  gameState = scene.gameState,
  source = WORLD_LANDMARK_CATALOG,
) {
  clearWorldLandmarks(scene);

  const markers = scene.add.container(0, 0).setDepth(source.marker.depth);
  const badgeDepth = source.marker.depth + source.badge.depth_offset;
  const badges = scene.add.container(0, 0).setDepth(badgeDepth);
  const models = [];

  for (const spawn of spawns) {
    if (!Number.isFinite(spawn?.x) || !Number.isFinite(spawn?.y)) continue;

    const point = worldPoint(spawn);
    const descriptor = landmarkMarkerFor(spawn, gameState, source);
    const markerY = point.y + (descriptor.variant.offset_y ?? 0);
    const marker = scene.add
      .image(point.x, markerY, descriptor.variant.key)
      .setOrigin(source.marker.origin_x, source.marker.origin_y);
    markers.add(marker);

    const badgeModels = descriptor.badges.map((badge, index) => {
      const x = point.x + source.badge.offset_x - index * 18;
      const y = markerY + source.badge.offset_y;
      badges.add(scene.add.image(x, y, badge.key).setOrigin(0.5));
      return {
        dungeonId: badge.dungeon_id,
        id: badge.id,
        key: badge.key,
        x,
        y,
        depth: badgeDepth,
      };
    });

    models.push({
      nodeId: spawn.node_id,
      name: spawn.name,
      family: descriptor.family,
      variantId: descriptor.variant.id,
      key: descriptor.variant.key,
      x: point.x,
      y: markerY,
      width: source.marker.width,
      height: source.marker.height,
      originX: source.marker.origin_x,
      originY: source.marker.origin_y,
      depth: source.marker.depth,
      badges: badgeModels,
    });
  }

  scene.landmarkMarkerContainer = markers;
  scene.landmarkBadgeContainer = badges;
  scene.landmarkMarkerModels = models;
  return { markers, badges, models };
}
