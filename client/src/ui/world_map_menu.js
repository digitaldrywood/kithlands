import { element, viewportDialog } from "./viewport_dialog.js";
import { TILE_COLORS } from "../scenes/tileConstants.js";

export function worldMapModel(scene) {
  const quest = scene.gameState?.quests?.[scene.gameState.current_quest];
  return {
    width: scene.mapW,
    height: scene.mapH,
    tiles: scene.tileData,
    player: { x: scene.playerX, y: scene.playerY },
    locations: scene.spawns.map((spawn) => ({
      ...spawn,
      natural: (spawn.kind || "").toLowerCase() === "natural",
      target:
        !quest?.hidden &&
        !!quest?.target_node_id &&
        spawn.node_id === quest.target_node_id,
    })),
  };
}

export function showWorldMapDialog(scene) {
  const model = worldMapModel(scene);
  let dialog;
  const close = () => dialog.dispose();
  dialog = viewportDialog(scene, {
    key: "world_map",
    title: "World map",
    onEscape: close,
  });
  dialog.root.classList.add("world-map-dialog");
  dialog.header.append(
    element("p", "", "Your travels, nearby places, and current destination."),
  );
  const canvas = element("canvas", "world-map-canvas");
  canvas.width = 900;
  canvas.height = 660;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Map: red marks your position; gold marks your current destination. Locations are listed below.",
  );
  const ctx = canvas.getContext("2d");
  const sx = canvas.width / model.width,
    sy = canvas.height / model.height;
  for (let y = 0; y < model.height; y++)
    for (let x = 0; x < model.width; x++) {
      ctx.fillStyle = `#${(TILE_COLORS[model.tiles[y][x]] ?? 0).toString(16).padStart(6, "0")}`;
      ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
    }
  for (const place of model.locations) {
    ctx.fillStyle = place.target
      ? "#c9b589"
      : place.natural
        ? "#8ac7aa"
        : "#e9eef7";
    ctx.beginPath();
    ctx.arc(place.x * sx, place.y * sy, place.target ? 10 : 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ed8d83";
  ctx.beginPath();
  ctx.arc(model.player.x * sx, model.player.y * sy, 7, 0, Math.PI * 2);
  ctx.fill();
  dialog.body.append(
    canvas,
    element(
      "p",
      "world-map-legend",
      "● Red: you   ·   Gold: destination   ·   Sage: natural place",
    ),
  );
  const list = element("ul", "world-map-places");
  for (const place of model.locations)
    list.append(
      element(
        "li",
        place.target ? "is-target" : "",
        `${place.target ? "★ " : ""}${place.name}`,
      ),
    );
  dialog.body.append(list);
  const button = element("button", "primary", "Back to game");
  button.addEventListener("click", close);
  dialog.footer.append(button);
  return dialog;
}
