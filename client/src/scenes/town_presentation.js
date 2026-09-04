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
  for (const [state, asset] of [
    ["closed", presentation?.chestClosedAsset],
    ["open", presentation?.chestOpenAsset],
  ]) {
    const key = `${presentation?.textureKey}_chest_${state}`;
    if (asset && !scene.textures.exists(key)) scene.load.image(key, asset);
  }
}

export function interiorChestKey(scene, opened) {
  const key = `${scene.interiorPresentation?.textureKey}_chest_${opened ? "open" : "closed"}`;
  return scene.textures.exists(key)
    ? key
    : opened
      ? "object_chest_open"
      : "object_chest_closed";
}
