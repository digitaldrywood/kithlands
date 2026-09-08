// Opaque crops of the authored background give counters and low partitions
// their own depth without adding a second, misaligned furniture painting.
export function drawInteriorForeground(scene, depthForRow) {
  const presentation = scene.interiorPresentation;
  return (presentation.foreground || []).map((region) =>
    scene.add
      .image(scene.offsetX, scene.offsetY, presentation.textureKey)
      .setOrigin(0)
      .setCrop(region.x, region.y, region.width, region.height)
      .setDepth(depthForRow(region.row)),
  );
}

export function preloadInteriorChests(scene) {
  const presentation = scene.interiorPresentation;
  for (const asset of [
    presentation?.chestClosedAsset,
    presentation?.chestOpenAsset,
  ]) {
    const key = `interior_chest:${asset}`;
    if (asset && !scene.textures.exists(key)) scene.load.image(key, asset);
  }
}

export function interiorChestKey(scene, opened) {
  const asset = opened
    ? scene.interiorPresentation?.chestOpenAsset
    : scene.interiorPresentation?.chestClosedAsset;
  const key = `interior_chest:${asset}`;
  return scene.textures.exists(key)
    ? key
    : opened
      ? "object_chest_open"
      : "object_chest_closed";
}

// Texture identity follows the reusable asset, not the individual room.
// Visiting a hundred layouts must not load a hundred copies of a bookcase.
export function interiorPropKey(asset) {
  return `interior_prop:${asset}`;
}

export function preloadInteriorProps(scene) {
  const assets = new Set(
    (scene.interiorPresentation?.props || []).map((prop) => prop.asset),
  );
  for (const asset of assets) {
    const key = interiorPropKey(asset);
    if (!scene.textures.exists(key)) scene.load.image(key, asset);
  }
}

export function drawInteriorProps(scene, depthForRow) {
  return (scene.interiorPresentation?.props || []).map((prop) =>
    scene.add
      .image(
        scene.offsetX + prop.x,
        scene.offsetY + prop.y,
        interiorPropKey(prop.asset),
      )
      .setOrigin(0)
      .setDisplaySize(prop.width, prop.height)
      .setDepth(depthForRow(prop.row)),
  );
}
