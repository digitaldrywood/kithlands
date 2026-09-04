import { buildSettlementModel, tiledLayer } from "./settlementMap.js";

export function dungeonModel(dungeon) {
  const map = dungeon?.map;
  const position = dungeon?.position;
  if (
    !map ||
    !Number.isInteger(position?.x) ||
    !Number.isInteger(position?.y)
  ) {
    throw new Error("The adventure map or party position is missing");
  }
  // This is a rendering anchor, never a transition or a saved position.
  const model = buildSettlementModel(
    {
      ...map,
      layers: [
        ...map.layers.filter((layer) => layer.name !== "player-spawns"),
        {
          name: "player-spawns",
          objects: [
            {
              name: "party",
              x: position.x * map.tilewidth,
              y: position.y * map.tileheight,
            },
          ],
        },
      ],
    },
    "party",
  );
  model.foreground = tiledLayer(map, "foreground")?.image || "";
  return model;
}

export function dungeonLayout(viewport, model, position) {
  const { width, height, portrait } = viewport;
  const top = portrait ? 218 : 100;
  const bottom = height - (portrait ? 550 : 136);
  const tile = (portrait ? Math.max : Math.min)(
    (width - 32) / model.width,
    (bottom - top) / model.height,
  );
  const layout = {
    width,
    height,
    portrait,
    top,
    bottom,
    tile,
    mapWidth: model.width * tile,
    mapHeight: model.height * tile,
    offsetX: (width - model.width * tile) / 2,
    offsetY: top + (bottom - top - model.height * tile) / 2,
    actionY: portrait ? height - 482 : height - 99,
    buttonHeight: portrait ? 90 : 34,
    bodySize: portrait ? 28 : 15,
  };
  return {
    ...layout,
    ...dungeonMapOffset(
      layout,
      position || { x: (model.width - 1) / 2, y: (model.height - 1) / 2 },
    ),
  };
}

export function dungeonMapOffset(layout, position) {
  if (!layout.portrait)
    return { offsetX: layout.offsetX, offsetY: layout.offsetY };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  return {
    offsetX: clamp(
      layout.width / 2 - (position.x + 0.5) * layout.tile,
      layout.width - 16 - layout.mapWidth,
      16,
    ),
    offsetY: clamp(
      (layout.top + layout.bottom) / 2 - (position.y + 0.5) * layout.tile,
      layout.bottom - layout.mapHeight,
      layout.top,
    ),
  };
}

export function distanceToAction(position, action) {
  return Math.abs(position.x - action.x) + Math.abs(position.y - action.y);
}

// A tap is translated into cardinal input requests using visible collision.
// Go rechecks every step; this path never mutates game state or opens doors.
export function dungeonPath(tileData, start, target, adjacent = false) {
  const height = tileData.length;
  const width = tileData[0]?.length || 0;
  const inBounds = ({ x, y }) =>
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height;
  if (!inBounds(start) || !inBounds(target)) return null;
  const reached = (point) =>
    distanceToAction(point, target) <= (adjacent ? 1 : 0);
  const key = ({ x, y }) => `${x},${y}`;
  const queue = [start];
  const parents = new Map([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    if (reached(point)) {
      const path = [];
      let step = point;
      while (parents.get(key(step))) {
        path.unshift(step);
        step = parents.get(key(step));
      }
      return path;
    }
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const next = { x: point.x + dx, y: point.y + dy };
      if (
        !inBounds(next) ||
        tileData[next.y][next.x] !== 0 ||
        parents.has(key(next))
      )
        continue;
      parents.set(key(next), point);
      queue.push(next);
    }
  }
  return null;
}
