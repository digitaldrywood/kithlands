export function tiledProperty(properties, name) {
  return properties?.find((property) => property.name === name)?.value ?? "";
}

export function tiledLayer(tiledMap, name) {
  return tiledMap?.layers?.find((layer) => layer.name === name) ?? null;
}

export function objectProperty(object, name) {
  return tiledProperty(object?.properties, name);
}

function tileCenter(model, x, y) {
  return {
    x: x * model.tileWidth + model.tileWidth / 2,
    y: y * model.tileHeight + model.tileHeight / 2,
  };
}

function rectangleContainsPoint(rectangle, x, y) {
  return (
    x >= rectangle.x &&
    x < rectangle.x + rectangle.width &&
    y >= rectangle.y &&
    y < rectangle.y + rectangle.height
  );
}

export function tileIntersectsObject(model, object, x, y) {
  const center = tileCenter(model, x, y);
  return rectangleContainsPoint(object, center.x, center.y);
}

export function settlementSpawn(model, anchor) {
  const spawn = model.spawns.find((candidate) => candidate.name === anchor);
  if (!spawn) throw new Error(`Settlement spawn ${anchor} is missing`);
  return {
    x: Math.floor(spawn.x / model.tileWidth),
    y: Math.floor(spawn.y / model.tileHeight),
    direction: objectProperty(spawn, "direction") || "up",
  };
}

export function interactionAt(model, playerX, playerY, direction = "up") {
  const deltas = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };
  const [dx, dy] = deltas[direction] || deltas.up;
  const candidates = [
    [playerX + dx, playerY + dy],
    [playerX, playerY],
    [playerX, playerY - 1],
    [playerX, playerY + 1],
    [playerX - 1, playerY],
    [playerX + 1, playerY],
  ];
  for (const [x, y] of candidates) {
    const interaction = model.interactions.find((object) =>
      tileIntersectsObject(model, object, x, y),
    );
    if (interaction) return interaction;
  }
  return null;
}

export function buildSettlementModel(tiledMap, anchor) {
  if (
    tiledMap?.type !== "map" ||
    tiledMap.orientation !== "orthogonal" ||
    !Number.isInteger(tiledMap.width) ||
    !Number.isInteger(tiledMap.height) ||
    !Number.isInteger(tiledMap.tilewidth) ||
    !Number.isInteger(tiledMap.tileheight)
  ) {
    throw new Error("Settlement requires an orthogonal Tiled JSON map");
  }

  const model = {
    id: tiledProperty(tiledMap.properties, "id"),
    width: tiledMap.width,
    height: tiledMap.height,
    tileWidth: tiledMap.tilewidth,
    tileHeight: tiledMap.tileheight,
    background: tiledLayer(tiledMap, "ground")?.image || "",
    collisions: tiledLayer(tiledMap, "collision")?.objects || [],
    interactions: tiledLayer(tiledMap, "interactions")?.objects || [],
    npcs: tiledLayer(tiledMap, "npc-spawns")?.objects || [],
    spawns: tiledLayer(tiledMap, "player-spawns")?.objects || [],
  };
  if (!model.id || !model.background) {
    throw new Error("Settlement map is missing its id or ground image");
  }

  model.spawn = settlementSpawn(model, anchor);
  model.tileData = Array.from({ length: model.height }, (_, y) =>
    Array.from({ length: model.width }, (_, x) => {
      const blockedByMap = model.collisions.some((collision) =>
        tileIntersectsObject(model, collision, x, y),
      );
      const blockedByNpc = model.npcs.some(
        (npc) =>
          Math.floor(npc.x / model.tileWidth) === x &&
          Math.floor(npc.y / model.tileHeight) === y,
      );
      return blockedByMap || blockedByNpc ? 1 : 0;
    }),
  );
  return model;
}
