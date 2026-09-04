import { dungeonAction } from "../api.js";
import { isWorldInputLocked } from "../systems/modalLock.js";
import { drawButton } from "../ui/panel.js";

export function dungeonEntryVisible(scene) {
  const entry = scene.gameState?.dungeon_entry;
  if (
    !entry?.node_id ||
    ["combat", "defeat", "victory", "promotion"].includes(
      scene.gameState?.phase,
    )
  )
    return false;
  const near = (x, y) =>
    Math.abs(scene.playerX - x) + Math.abs(scene.playerY - y) <= 3;
  if (scene.gameState.current_location?.kind === "settlement") {
    if (scene.gameState.current_location.world_node_id !== entry.node_id)
      return false;
    return (
      scene.model?.interactions?.some(
        (object) =>
          object.type === "exit" &&
          near(
            Math.floor(object.x / scene.model.tileWidth),
            Math.floor(object.y / scene.model.tileHeight),
          ),
      ) || false
    );
  }
  if (
    scene.gameState.current_location?.kind &&
    scene.gameState.current_location.kind !== "world"
  )
    return false;
  return (scene.spawns || []).some(
    (spawn) => spawn.node_id === entry.node_id && near(spawn.x, spawn.y),
  );
}

export function updateDungeonEntry(scene) {
  const visible = dungeonEntryVisible(scene);
  if (!visible) {
    scene.dungeonEntryButton?.destroy();
    scene.dungeonEntryButton = null;
    return;
  }
  const entry = scene.gameState.dungeon_entry;
  if (scene.dungeonEntryButton) {
    scene.dungeonEntryButton.setLabel(entry.label);
    return;
  }
  const portrait = scene.gameplayLayout?.portrait;
  const settlement = scene.gameState.current_location?.kind === "settlement";
  const y = settlement
    ? portrait
      ? 66
      : 29
    : portrait
      ? scene.gameplayLayout.height - 572
      : 528;
  const button = drawButton(
    scene,
    400,
    y,
    portrait ? 664 : 352,
    portrait ? 88 : 42,
    entry.label,
    () => enterDungeon(scene),
    {
      depth: settlement ? 1003 : 25,
      fontSize: portrait ? "28px" : "16px",
      fontFamily: "Trebuchet MS, Arial, sans-serif",
      fill: 0x173b3a,
      fillHover: 0x315653,
      fillPress: 0x102a2b,
      stroke: 0xd6c18a,
      textColor: "#fff0c2",
      strokeWidth: 2,
    },
  );
  button.label.setWordWrapWidth(portrait ? 630 : 328).setAlign("center");
  // The global tap-to-walk handler must not also receive a trail-button tap.
  for (const object of [button.bg, button.label]) {
    object.on("pointerdown", (_pointer, _x, _y, event) =>
      event?.stopPropagation(),
    );
  }
  scene.dungeonEntryButton = button;
  scene.events.once("shutdown", () => {
    scene.dungeonEntryButton = null;
  });
}

async function enterDungeon(scene) {
  if (isWorldInputLocked(scene) || !dungeonEntryVisible(scene)) return;
  scene.animating = true;
  try {
    const result = await dungeonAction(scene.gameState.id, {
      type: "enter",
      node_id: scene.gameState.dungeon_entry.node_id,
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
