const NODE_ARRIVAL_RADIUS = 3;

function validPoint(point, width, height, tileData, canWalk) {
  return (
    Number.isInteger(point?.x) &&
    Number.isInteger(point?.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < width &&
    point.y < height &&
    !!tileData?.[point.y] &&
    canWalk(tileData[point.y][point.x])
  );
}

function firstWalkable(width, height, tileData, canWalk) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (validPoint({ x, y }, width, height, tileData, canWalk))
        return { x, y };
    }
  }
  return null;
}

export function resolveWorldStartPosition({
  tileData,
  width,
  height,
  spawns,
  currentNodeID,
  preferredPosition,
  defaultPosition,
  canWalk,
}) {
  if (validPoint(preferredPosition, width, height, tileData, canWalk)) {
    return preferredPosition;
  }

  const fallback = validPoint(defaultPosition, width, height, tileData, canWalk)
    ? defaultPosition
    : firstWalkable(width, height, tileData, canWalk);
  const spawn = (spawns || []).find(
    (candidate) => candidate.node_id === currentNodeID,
  );
  if (!Number.isInteger(spawn?.x) || !Number.isInteger(spawn?.y)) {
    return fallback;
  }

  const candidates = [];
  for (
    let y = spawn.y - NODE_ARRIVAL_RADIUS;
    y <= spawn.y + NODE_ARRIVAL_RADIUS;
    y += 1
  ) {
    for (
      let x = spawn.x - NODE_ARRIVAL_RADIUS;
      x <= spawn.x + NODE_ARRIVAL_RADIUS;
      x += 1
    ) {
      const distance = Math.abs(x - spawn.x) + Math.abs(y - spawn.y);
      if (
        distance <= NODE_ARRIVAL_RADIUS &&
        validPoint({ x, y }, width, height, tileData, canWalk)
      ) {
        candidates.push({ x, y, distance });
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  if (candidates.length === 0) return fallback;
  return { x: candidates[0].x, y: candidates[0].y };
}
