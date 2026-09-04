let cachedGameID = null;
let cachedTileMap = null;
let cachedPosition = null;
let cachedDirection = "down";

function selectGame(gameID) {
  if (!gameID) return false;
  if (cachedGameID !== gameID) {
    cachedGameID = gameID;
    cachedTileMap = null;
    cachedPosition = null;
    cachedDirection = "down";
  }
  return true;
}

export function rememberWorldTileMap(gameState) {
  if (!selectGame(gameState?.id) || !gameState?.tilemap) return false;
  cachedTileMap = gameState.tilemap;
  return true;
}

export function rememberWorldCheckpoint(gameState) {
  if (!selectGame(gameState?.id)) return false;
  const checkpoint = gameState?.world_checkpoint;
  if (!Number.isInteger(checkpoint?.x) || !Number.isInteger(checkpoint?.y)) {
    return false;
  }
  cachedPosition = { x: checkpoint.x, y: checkpoint.y };
  return true;
}

export function rememberWorldPosition(gameID, position, direction) {
  if (
    !selectGame(gameID) ||
    !Number.isInteger(position?.x) ||
    !Number.isInteger(position?.y)
  ) {
    return false;
  }
  cachedPosition = { x: position.x, y: position.y };
  if (direction) cachedDirection = direction;
  return true;
}

export function worldTileMapForGame(gameID) {
  if (!gameID || gameID !== cachedGameID) return null;
  return cachedTileMap;
}

export function worldPositionForGame(gameID) {
  if (!gameID || gameID !== cachedGameID || !cachedPosition) return null;
  return { ...cachedPosition };
}

export function worldDirectionForGame(gameID) {
  if (!gameID || gameID !== cachedGameID) return "down";
  return cachedDirection;
}

export function clearWorldTileMapCache() {
  cachedGameID = null;
  cachedTileMap = null;
  cachedPosition = null;
  cachedDirection = "down";
}
