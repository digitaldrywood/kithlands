import {
  TILE_IDS,
  TILE_SPRITE_KEYS,
  blendPriority,
  isGroundTile,
  isLiquidTile,
  isPathTile,
} from "./tileConstants.js";

export const AUTOTILE_EDGE_NORTH = 1;
export const AUTOTILE_EDGE_EAST = 2;
export const AUTOTILE_EDGE_SOUTH = 4;
export const AUTOTILE_EDGE_WEST = 8;

const AUTOTILE_CENTER = 4;
const TILE_SIZE = 16;
const PATH_BASE_FALLBACK = TILE_IDS.grass;
const BRIDGE_BASE_FALLBACK = TILE_IDS.river;

function getTile(tiles, x, y) {
  if (y < 0 || y >= tiles.length) return null;
  if (x < 0 || x >= tiles[y].length) return null;
  return tiles[y][x];
}

function orthogonalMask(tiles, x, y, predicate) {
  let mask = 0;
  if (predicate(getTile(tiles, x, y - 1))) mask |= AUTOTILE_EDGE_NORTH;
  if (predicate(getTile(tiles, x + 1, y))) mask |= AUTOTILE_EDGE_EAST;
  if (predicate(getTile(tiles, x, y + 1))) mask |= AUTOTILE_EDGE_SOUTH;
  if (predicate(getTile(tiles, x - 1, y))) mask |= AUTOTILE_EDGE_WEST;
  return mask;
}

function pickMostCommonGround(tiles, x, y, fallback) {
  const counts = new Map();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tile = getTile(tiles, x + dx, y + dy);
      if (!isGroundTile(tile)) continue;
      counts.set(tile, (counts.get(tile) || 0) + 1);
    }
  }

  let bestTile = fallback;
  let bestCount = -1;
  for (const [tile, count] of counts.entries()) {
    if (count > bestCount) {
      bestTile = tile;
      bestCount = count;
    }
  }
  return bestTile;
}

function chooseOverlayTile(tiles, x, y, currentTile) {
  let bestTile = null;
  let bestPriority = blendPriority(currentTile);
  for (const [nx, ny] of [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y],
  ]) {
    const tile = getTile(tiles, nx, ny);
    const priority = blendPriority(tile);
    if (priority > bestPriority) {
      bestTile = tile;
      bestPriority = priority;
    }
  }
  return bestTile;
}

function pickBridgeBaseTile(tiles, x, y) {
  let liquidTile = null;
  for (const [nx, ny] of [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y],
  ]) {
    const tile = getTile(tiles, nx, ny);
    if (isLiquidTile(tile)) {
      liquidTile = tile;
      if (tile === TILE_IDS.river) {
        return tile;
      }
    }
  }

  if (liquidTile != null) {
    return liquidTile;
  }

  return pickMostCommonGround(tiles, x, y, BRIDGE_BASE_FALLBACK);
}

export function buildTerrainRenderPlan(tiles, x, y) {
  const tile = getTile(tiles, x, y);
  const spriteKey = TILE_SPRITE_KEYS[tile] || null;

  if (tile == null) {
    return { baseKey: null, overlay: null };
  }

  if (isPathTile(tile)) {
    const baseTile =
      tile === TILE_IDS.bridge
        ? pickBridgeBaseTile(tiles, x, y)
        : pickMostCommonGround(tiles, x, y, PATH_BASE_FALLBACK);
    const mask = orthogonalMask(tiles, x, y, (neighbor) =>
      isPathTile(neighbor),
    );
    return {
      baseKey:
        TILE_SPRITE_KEYS[baseTile] || TILE_SPRITE_KEYS[PATH_BASE_FALLBACK],
      overlay: {
        key: spriteKey,
        mask,
        kind: "path",
      },
    };
  }

  if (!spriteKey || !isGroundTile(tile)) {
    return { baseKey: spriteKey, overlay: null };
  }

  const overlayTile = chooseOverlayTile(tiles, x, y, tile);
  if (overlayTile == null) {
    return { baseKey: spriteKey, overlay: null };
  }

  const mask = orthogonalMask(
    tiles,
    x,
    y,
    (neighbor) => neighbor === overlayTile,
  );
  if (!mask) {
    return { baseKey: spriteKey, overlay: null };
  }

  return {
    baseKey: spriteKey,
    overlay: {
      key: TILE_SPRITE_KEYS[overlayTile],
      mask,
      kind: "edge",
    },
  };
}

function getTextureImage(scene, key) {
  const texture = scene.textures.get(key);
  if (!texture) return null;
  return texture.getSourceImage();
}

function drawQuarter(ctx, image, sx, sy, dx, dy) {
  ctx.drawImage(
    image,
    sx,
    sy,
    TILE_SIZE / 2,
    TILE_SIZE / 2,
    dx,
    dy,
    TILE_SIZE / 2,
    TILE_SIZE / 2,
  );
}

function drawEdgeOverlay(ctx, image, mask) {
  const north = !!(mask & AUTOTILE_EDGE_NORTH);
  const east = !!(mask & AUTOTILE_EDGE_EAST);
  const south = !!(mask & AUTOTILE_EDGE_SOUTH);
  const west = !!(mask & AUTOTILE_EDGE_WEST);

  if (!mask) return;
  if (
    mask ===
    (AUTOTILE_EDGE_NORTH |
      AUTOTILE_EDGE_EAST |
      AUTOTILE_EDGE_SOUTH |
      AUTOTILE_EDGE_WEST)
  ) {
    ctx.drawImage(
      image,
      0,
      0,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
      TILE_SIZE,
      TILE_SIZE,
    );
    return;
  }

  if (north || west) drawQuarter(ctx, image, 0, 0, 0, 0);
  if (north || east)
    drawQuarter(ctx, image, TILE_SIZE / 2, 0, TILE_SIZE / 2, 0);
  if (south || west)
    drawQuarter(ctx, image, 0, TILE_SIZE / 2, 0, TILE_SIZE / 2);
  if (south || east)
    drawQuarter(
      ctx,
      image,
      TILE_SIZE / 2,
      TILE_SIZE / 2,
      TILE_SIZE / 2,
      TILE_SIZE / 2,
    );

  if (
    (north && south) ||
    (east && west) ||
    [north, east, south, west].filter(Boolean).length >= 3
  ) {
    ctx.drawImage(
      image,
      AUTOTILE_CENTER,
      AUTOTILE_CENTER,
      TILE_SIZE - AUTOTILE_CENTER * 2,
      TILE_SIZE - AUTOTILE_CENTER * 2,
      AUTOTILE_CENTER,
      AUTOTILE_CENTER,
      TILE_SIZE - AUTOTILE_CENTER * 2,
      TILE_SIZE - AUTOTILE_CENTER * 2,
    );
  }
}

function drawPathOverlay(ctx, image, mask) {
  ctx.drawImage(
    image,
    AUTOTILE_CENTER,
    AUTOTILE_CENTER,
    TILE_SIZE - AUTOTILE_CENTER * 2,
    TILE_SIZE - AUTOTILE_CENTER * 2,
    AUTOTILE_CENTER,
    AUTOTILE_CENTER,
    TILE_SIZE - AUTOTILE_CENTER * 2,
    TILE_SIZE - AUTOTILE_CENTER * 2,
  );

  if (mask & AUTOTILE_EDGE_NORTH) {
    ctx.drawImage(
      image,
      AUTOTILE_CENTER,
      0,
      TILE_SIZE - AUTOTILE_CENTER * 2,
      TILE_SIZE / 2,
      AUTOTILE_CENTER,
      0,
      TILE_SIZE - AUTOTILE_CENTER * 2,
      TILE_SIZE / 2,
    );
  }
  if (mask & AUTOTILE_EDGE_EAST) {
    ctx.drawImage(
      image,
      TILE_SIZE / 2,
      AUTOTILE_CENTER,
      TILE_SIZE / 2,
      TILE_SIZE - AUTOTILE_CENTER * 2,
      TILE_SIZE / 2,
      AUTOTILE_CENTER,
      TILE_SIZE / 2,
      TILE_SIZE - AUTOTILE_CENTER * 2,
    );
  }
  if (mask & AUTOTILE_EDGE_SOUTH) {
    ctx.drawImage(
      image,
      AUTOTILE_CENTER,
      TILE_SIZE / 2,
      TILE_SIZE - AUTOTILE_CENTER * 2,
      TILE_SIZE / 2,
      AUTOTILE_CENTER,
      TILE_SIZE / 2,
      TILE_SIZE - AUTOTILE_CENTER * 2,
      TILE_SIZE / 2,
    );
  }
  if (mask & AUTOTILE_EDGE_WEST) {
    ctx.drawImage(
      image,
      0,
      AUTOTILE_CENTER,
      TILE_SIZE / 2,
      TILE_SIZE - AUTOTILE_CENTER * 2,
      0,
      AUTOTILE_CENTER,
      TILE_SIZE / 2,
      TILE_SIZE - AUTOTILE_CENTER * 2,
    );
  }
}

function addCanvasTexture(scene, key, canvas) {
  if (scene.textures.exists(key)) return key;
  scene.textures.addCanvas(key, canvas);
  return key;
}

function buildCanvas(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  draw(ctx);
  return canvas;
}

export function ensureTerrainRenderTexture(scene, plan) {
  if (!plan.baseKey) return null;
  if (!plan.overlay) return plan.baseKey;

  const textureKey = `terrain:${plan.baseKey}:${plan.overlay.key}:${plan.overlay.kind}:${plan.overlay.mask}`;
  if (scene.textures.exists(textureKey)) return textureKey;

  const baseImage = getTextureImage(scene, plan.baseKey);
  const overlayImage = getTextureImage(scene, plan.overlay.key);
  if (!baseImage || !overlayImage) return plan.baseKey;

  const canvas = buildCanvas((ctx) => {
    ctx.drawImage(
      baseImage,
      0,
      0,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
      TILE_SIZE,
      TILE_SIZE,
    );
    if (plan.overlay.kind === "path") {
      drawPathOverlay(ctx, overlayImage, plan.overlay.mask);
    } else {
      drawEdgeOverlay(ctx, overlayImage, plan.overlay.mask);
    }
  });
  return addCanvasTexture(scene, textureKey, canvas);
}

function noisePixel(seed, x, y, range) {
  return (seed + x * 17 + y * 31 + ((x + y) % 3) * 13) % range;
}

function makeBasePattern(scene, sourceKey, key, embellish) {
  if (scene.textures.exists(key)) return;
  const image = getTextureImage(scene, sourceKey);
  if (!image) return;
  const canvas = buildCanvas((ctx) => {
    ctx.drawImage(
      image,
      0,
      0,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
      TILE_SIZE,
      TILE_SIZE,
    );
    embellish(ctx);
  });
  addCanvasTexture(scene, key, canvas);
}

export function registerGeneratedTerrainTextures(scene) {
  makeBasePattern(scene, "tile_water", "tile_lake", (ctx) => {
    ctx.fillStyle = "rgba(12, 57, 108, 0.35)";
    ctx.fillRect(0, 0, TILE_SIZE, 2);
    ctx.fillRect(0, TILE_SIZE - 2, TILE_SIZE, 2);
    ctx.fillRect(0, 0, 2, TILE_SIZE);
    ctx.fillRect(TILE_SIZE - 2, 0, 2, TILE_SIZE);
  });

  makeBasePattern(scene, "tile_water", "tile_river", (ctx) => {
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(5, 0, 6, TILE_SIZE);
    ctx.fillStyle = "rgba(13, 72, 138, 0.22)";
    ctx.fillRect(0, 0, 3, TILE_SIZE);
    ctx.fillRect(TILE_SIZE - 3, 0, 3, TILE_SIZE);
  });

  makeBasePattern(scene, "tile_grass", "tile_marsh", (ctx) => {
    ctx.fillStyle = "rgba(81, 62, 24, 0.35)";
    ctx.fillRect(2, 3, 5, 4);
    ctx.fillRect(8, 8, 6, 5);
    ctx.fillStyle = "rgba(180, 210, 110, 0.45)";
    for (let x = 1; x < TILE_SIZE; x += 4) {
      ctx.fillRect(x, 1 + (x % 3), 1, 4);
      ctx.fillRect(x + 1, 8 + (x % 2), 1, 5);
    }
  });

  makeBasePattern(scene, "tile_hill", "tile_snow", (ctx) => {
    ctx.fillStyle = "rgba(245, 252, 255, 0.8)";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "rgba(180, 210, 235, 0.35)";
    for (let y = 1; y < TILE_SIZE; y += 4) {
      for (let x = (y % 2) + 1; x < TILE_SIZE; x += 5) {
        ctx.fillRect(x, y, 2, 1);
      }
    }
  });

  makeBasePattern(scene, "tile_rock", "tile_mountain", (ctx) => {
    ctx.fillStyle = "rgba(36, 41, 48, 0.45)";
    ctx.beginPath();
    ctx.moveTo(2, TILE_SIZE - 2);
    ctx.lineTo(7, 4);
    ctx.lineTo(11, 8);
    ctx.lineTo(14, 2);
    ctx.lineTo(14, TILE_SIZE - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(210, 220, 228, 0.28)";
    ctx.fillRect(6, 5, 2, 4);
    ctx.fillRect(12, 4, 1, 3);
  });

  makeBasePattern(scene, "tile_path", "tile_bridge", (ctx) => {
    ctx.fillStyle = "rgba(76, 45, 18, 0.4)";
    for (let y = 1; y < TILE_SIZE; y += 4) {
      ctx.fillRect(0, y, TILE_SIZE, 1);
    }
    ctx.fillStyle = "rgba(138, 98, 54, 0.4)";
    ctx.fillRect(3, 0, 2, TILE_SIZE);
    ctx.fillRect(TILE_SIZE - 5, 0, 2, TILE_SIZE);
  });
}
