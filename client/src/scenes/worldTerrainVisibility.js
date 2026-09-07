// Terrain images are grouped in a Container, which does not cull its children.
// Use the camera's finalized world view so zoom and follow movement agree with
// the renderer in the same frame. Keep one tile beyond each edge for safety.
export function updateWorldTerrainVisibility(tiles, view, tileSize = 32) {
  const left = view.x - tileSize;
  const top = view.y - tileSize;
  const right = view.x + view.width + tileSize;
  const bottom = view.y + view.height + tileSize;
  for (const tile of tiles) {
    tile.visible =
      tile.x + tileSize >= left &&
      tile.x <= right &&
      tile.y + tileSize >= top &&
      tile.y <= bottom;
  }
}
