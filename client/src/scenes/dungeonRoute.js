const ARRIVAL_RADIUS = 3;
const WAYPOINT_RADIUS = 2;
const RENDERED_TILE = 32;

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

export function planDungeonWaypointPath({
  tileData,
  start,
  target,
  spawns,
  currentNodeID,
  canWalk,
}) {
  const height = tileData?.length || 0;
  const width = tileData?.[0]?.length || 0;
  if (!width || !height || !target || !Number.isInteger(start?.x)) return null;
  const current = (spawns || []).find(
    (spawn) => spawn.node_id === currentNodeID,
  );
  const offRoute = (spawns || []).filter(
    (spawn) =>
      spawn.node_id !== currentNodeID && spawn.node_id !== target.node_id,
  );
  const inBounds = (point) =>
    point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
  const walkable = (point) =>
    inBounds(point) && canWalk(tileData[point.y][point.x]);
  const avoidsOffRouteArrival = (point) =>
    offRoute.every((spawn) => distance(point, spawn) > ARRIVAL_RADIUS);
  const reached = (point) =>
    distance(point, target) <= WAYPOINT_RADIUS &&
    (!current ||
      current.node_id === target.node_id ||
      distance(point, current) > ARRIVAL_RADIUS);

  if (reached(start)) return [];
  const queue = [start];
  const parents = new Map([[pointKey(start), null]]);
  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index];
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const next = { x: point.x + dx, y: point.y + dy };
      const key = pointKey(next);
      if (parents.has(key) || !walkable(next) || !avoidsOffRouteArrival(next))
        continue;
      parents.set(key, point);
      if (reached(next)) {
        const path = [next];
        let step = point;
        while (parents.get(pointKey(step))) {
          path.unshift(step);
          step = parents.get(pointKey(step));
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function dungeonRouteForScene(scene) {
  if (
    scene?.gameState?.current_location?.kind !== "world" ||
    ["combat", "defeat", "victory", "promotion"].includes(
      scene.gameState?.phase,
    )
  )
    return null;
  const currentNodeID = scene.gameState.current_location.world_node_id;
  const candidates = (scene.gameState.dungeon_entries || [])
    .filter(
      (entry) =>
        entry.node_id !== currentNodeID &&
        entry.route_node_ids?.length > 0 &&
        scene.spawns?.some((spawn) => spawn.node_id === entry.node_id),
    )
    .sort(
      (a, b) =>
        b.route_node_ids.length - a.route_node_ids.length ||
        a.title.localeCompare(b.title),
    );
  return (
    candidates.find((entry) => entry.id === scene.currentDungeonRouteID) ||
    candidates[0] ||
    null
  );
}

function clearRouteGuide(scene) {
  for (const marker of scene.dungeonRouteGuide || []) marker.destroy?.();
  scene.dungeonRouteGuide = [];
}

export function cancelDungeonRoute(scene) {
  if (scene.dungeonRouteToken) scene.dungeonRouteToken.cancelled = true;
  scene.dungeonRouteRunning = false;
  scene.currentDungeonRouteID = null;
  clearRouteGuide(scene);
}

function drawRouteGuide(scene, entry) {
  clearRouteGuide(scene);
  scene.dungeonRouteGuide = (entry.route_node_ids || []).flatMap(
    (nodeID, index) => {
      const spawn = scene.spawns.find(
        (candidate) => candidate.node_id === nodeID,
      );
      if (!spawn) return [];
      const x = spawn.x * RENDERED_TILE + RENDERED_TILE / 2;
      const y = spawn.y * RENDERED_TILE + RENDERED_TILE / 2;
      const marker = scene.add
        .circle(x, y, 19, 0x173b3a, 0.55)
        .setStrokeStyle(3, 0xf4d881, 0.95)
        .setDepth(9);
      const label = scene.add
        .text(x, y, String(index + 1), {
          fontSize: "15px",
          color: "#fff0bc",
          fontFamily: "Trebuchet MS, Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(10);
      return [marker, label];
    },
  );
}

export async function followDungeonRoute(scene, entry) {
  if (
    !entry?.route_node_ids?.length ||
    scene.dungeonRouteRunning ||
    scene.animating
  )
    return false;
  const token = { cancelled: false };
  scene.dungeonRouteToken = token;
  scene.dungeonRouteRunning = true;
  scene.currentDungeonRouteID = entry.id;
  drawRouteGuide(scene, entry);
  scene.updateHUD?.();
  try {
    for (const nodeID of entry.route_node_ids) {
      if (token.cancelled || !scene.scene?.isActive()) return false;
      if (scene.gameState.current_location?.world_node_id === nodeID) continue;
      const target = scene.spawns.find((spawn) => spawn.node_id === nodeID);
      const path = planDungeonWaypointPath({
        tileData: scene.tileData,
        start: { x: scene.playerX, y: scene.playerY },
        target,
        spawns: scene.spawns,
        currentNodeID: scene.gameState.current_location?.world_node_id,
        canWalk: (tile) => scene.canWalkTile(tile),
      });
      if (!path) {
        scene.showMessage?.(
          `No safe marked path reaches ${target?.name || entry.title}. Try another approach.`,
        );
        return false;
      }
      for (const step of path) {
        if (token.cancelled || !scene.scene?.isActive()) return false;
        const dx = step.x - scene.playerX;
        const dy = step.y - scene.playerY;
        if (!scene.tryMove(dx, dy, { route: true })) {
          scene.showMessage?.("The marked path is blocked. Try again nearby.");
          return false;
        }
        if (!(await scene.worldStepDone)) return false;
      }
      if (scene.gameState.current_location?.world_node_id !== nodeID) {
        scene.showMessage?.(
          `Travel paused before ${target?.name || entry.title}. Return to the marked path and try again.`,
        );
        return false;
      }
    }
    scene.showMessage?.(`${entry.title} is just ahead.`);
    return true;
  } finally {
    if (scene.dungeonRouteToken === token) {
      scene.dungeonRouteToken = null;
      cancelDungeonRoute(scene);
      if (scene.scene?.isActive()) scene.updateHUD?.();
    }
  }
}
