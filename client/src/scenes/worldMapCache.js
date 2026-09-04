let cachedGameID = null;
let cachedTileMap = null;

export function rememberWorldTileMap(gameState) {
  if (!gameState?.id || !gameState?.tilemap) return false;
  cachedGameID = gameState.id;
  cachedTileMap = gameState.tilemap;
  return true;
}

export function worldTileMapForGame(gameID) {
  if (!gameID || gameID !== cachedGameID) return null;
  return cachedTileMap;
}

export function clearWorldTileMapCache() {
  cachedGameID = null;
  cachedTileMap = null;
}
