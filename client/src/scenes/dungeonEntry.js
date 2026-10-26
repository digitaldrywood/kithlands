import { dungeonAction } from "../api.js";
import { isWorldInputLocked } from "../systems/modalLock.js";
import { drawButton } from "../ui/panel.js";
import { dungeonRouteForScene, followDungeonRoute } from "./dungeonRoute.js";
import { checkpointWorldPosition } from "./world_interact.js";
import { portraitFontSize } from "../systems/gameplayViewport.js";

export function dungeonEntryForScene(scene) {
  const entries = scene.gameState?.dungeon_entries?.length
    ? scene.gameState.dungeon_entries
    : scene.gameState?.dungeon_entry
      ? [scene.gameState.dungeon_entry]
      : [];
  if (
    entries.length === 0 ||
    ["combat", "defeat", "victory", "promotion"].includes(
      scene.gameState?.phase,
    )
  )
    return null;
  const near = (x, y) =>
    Math.abs(scene.playerX - x) + Math.abs(scene.playerY - y) <= 3;
  if (scene.gameState.current_location?.kind === "settlement") {
    const entry = entries.find(
      (candidate) =>
        candidate.node_id === scene.gameState.current_location.world_node_id,
    );
    if (!entry) return null;
    return scene.model?.interactions?.some(
      (object) =>
        object.type === "exit" &&
        near(
          Math.floor(object.x / scene.model.tileWidth),
          Math.floor(object.y / scene.model.tileHeight),
        ),
    )
      ? entry
      : null;
  }
  if (
    scene.gameState.current_location?.kind &&
    scene.gameState.current_location.kind !== "world"
  )
    return null;
  const currentNodeID = scene.gameState.current_location?.world_node_id;
  const matches = [];
  for (const entry of entries) {
    if (entry.node_id !== currentNodeID) continue;
    const spawn = (scene.spawns || []).find(
      (candidate) => candidate.node_id === entry.node_id,
    );
    if (!spawn || !near(spawn.x, spawn.y)) continue;
    matches.push({
      entry,
      distance:
        Math.abs(scene.playerX - spawn.x) + Math.abs(scene.playerY - spawn.y),
    });
  }
  matches.sort((a, b) => a.distance - b.distance);
  return matches[0]?.entry || null;
}

export function dungeonEntryVisible(scene) {
  return dungeonEntryForScene(scene) !== null;
}

export function updateDungeonEntry(scene) {
  // Arrival state can update just before the final movement promise settles.
  // Do not present a trail button until that authoritative step is actually
  // usable; otherwise a quick click looks accepted but is ignored by the
  // world input lock.
  const entry =
    scene.animating || scene.dungeonRouteRunning
      ? null
      : dungeonEntryForScene(scene);
  if (!entry) {
    scene.dungeonEntryButton?.destroy();
    scene.dungeonEntryButton = null;
    scene.currentDungeonEntry = null;
  } else {
    scene.currentDungeonEntry = entry;
    if (scene.dungeonEntryButton) {
      scene.dungeonEntryButton.setLabel(entry.label);
    } else {
      scene.dungeonEntryButton = createTrailButton(
        scene,
        entry.label,
        () => enterDungeon(scene),
        false,
      );
    }
  }

  // World route navigation lives in the map, not a permanent field prompt.
  const route = scene.explorationHUD ? null : dungeonRouteForScene(scene);
  if (!route) {
    scene.dungeonRouteButton?.destroy();
    scene.dungeonRouteButton = null;
    return;
  }
  const label = scene.dungeonRouteRunning
    ? `Following path to ${route.title}…`
    : `Follow path to ${route.title}`;
  const routeEnabled = !scene.dungeonRouteRunning && !scene.animating;
  if (scene.dungeonRouteButton) {
    scene.dungeonRouteButton.setLabel(label);
    scene.dungeonRouteButton.setEnabled(routeEnabled);
    return;
  }
  scene.dungeonRouteButton = createTrailButton(
    scene,
    label,
    () => void followDungeonRoute(scene, dungeonRouteForScene(scene)),
    true,
  );
  scene.dungeonRouteButton.setEnabled(routeEnabled);
}

function createTrailButton(scene, label, onClick, route) {
  if (scene.explorationHUD) {
    const button = scene.explorationHUD.trail(label, onClick, route);
    scene.events.once("shutdown", () => {
      button.destroy();
      if (route) scene.dungeonRouteButton = null;
      else scene.dungeonEntryButton = null;
    });
    return button;
  }
  const portrait = scene.gameplayLayout?.portrait;
  const settlement = scene.gameState.current_location?.kind === "settlement";
  const y = settlement
    ? portrait
      ? 66
      : 29
    : portrait
      ? scene.gameplayLayout.height - (route ? 670 : 572)
      : route
        ? 478
        : 528;
  const button = drawButton(
    scene,
    400,
    y,
    portrait ? 664 : 352,
    portrait
      ? settlement
        ? Math.max(88, parseFloat(portraitFontSize(scene, 44)))
        : 88
      : 42,
    label,
    onClick,
    {
      depth: settlement ? 1003 : 25,
      fontSize: portrait
        ? settlement
          ? portraitFontSize(scene, 16)
          : "28px"
        : "16px",
      fontFamily: "Trebuchet MS, Arial, sans-serif",
      fill: route ? 0x29412e : 0x173b3a,
      fillHover: route ? 0x49613f : 0x315653,
      fillPress: 0x102a2b,
      stroke: 0xd6c18a,
      textColor: "#fff0c2",
      strokeWidth: 2,
    },
  );
  button.label.setWordWrapWidth(portrait ? 630 : 328).setAlign("center");
  for (const object of [button.bg, button.label]) {
    object.on("pointerdown", (_pointer, _x, _y, event) =>
      event?.stopPropagation(),
    );
  }
  scene.events.once("shutdown", () => {
    button.destroy();
    if (route) scene.dungeonRouteButton = null;
    else scene.dungeonEntryButton = null;
  });
  return button;
}

export async function enterDungeon(scene) {
  const entry = dungeonEntryForScene(scene);
  if (isWorldInputLocked(scene) || !entry) return;
  scene.animating = true;
  try {
    const worldPosition =
      scene.gameState.current_location?.kind === "world"
        ? await checkpointWorldPosition(scene)
        : null;
    const result = await dungeonAction(scene.gameState.id, {
      type: "enter",
      node_id: entry.node_id,
      ...(worldPosition ? { world_position: worldPosition } : {}),
    });
    if (!scene.scene.isActive()) return;
    if (result?.error || result?.current_location?.kind !== "dungeon") {
      scene.animating = false;
      scene.showMessage(
        result?.error || "The trail is unavailable. Please try again.",
      );
      return;
    }
    scene.scene.start("Dungeon", { gameState: result });
  } catch {
    scene.animating = false;
    scene.showMessage("Could not reach the trail. Please try again.");
  }
}
