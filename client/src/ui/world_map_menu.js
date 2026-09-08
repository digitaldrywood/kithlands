import { element, viewportDialog } from "./viewport_dialog.js";
import {
  cancelDungeonRoute,
  followDungeonRoute,
} from "../scenes/dungeonRoute.js";
import { TILE_COLORS } from "../scenes/tileConstants.js";

export function worldMapModel(scene) {
  const quest = scene.gameState?.quests?.[scene.gameState.current_quest];
  const adventures = (scene.gameState?.dungeon_entries || []).map(
    (entry, index) => ({
      ...entry,
      number: index + 1,
      entrance: scene.spawns.find((spawn) => spawn.node_id === entry.node_id),
    }),
  );
  const tracked = adventures.find(
    (entry) => entry.id === scene.trackedDungeonID,
  );
  return {
    adventures,
    width: scene.mapW,
    height: scene.mapH,
    tiles: scene.tileData,
    player: { x: scene.playerX, y: scene.playerY },
    locations: scene.spawns.map((spawn) => ({
      ...spawn,
      natural: (spawn.kind || "").toLowerCase() === "natural",
      target: tracked
        ? spawn.node_id === tracked.node_id
        : !quest?.hidden &&
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
  for (const adventure of model.adventures) {
    if (!adventure.entrance) continue;
    const x = adventure.entrance.x * sx,
      y = adventure.entrance.y * sy;
    ctx.fillStyle = "#182536";
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4d881";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(adventure.number), x, y);
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
      "● Red: you   ·   Gold: destination   ·   Numbers: adventures   ·   Sage: natural place",
    ),
  );
  if (model.adventures.length) {
    const section = element("section", "world-map-adventures");
    section.append(element("h2", "", "Adventures"));
    for (const adventure of model.adventures) {
      const card = element("article", "world-map-adventure");
      card.append(
        element("h3", "", `${adventure.number}. ${adventure.title}`),
        element("p", "", adventure.description || ""),
        element(
          "p",
          "",
          `Entrance: ${adventure.entrance?.name || "Not on this map"}${adventure.completed ? " · Completed" : ""}`,
        ),
      );
      const follow = element("button", "primary", "Follow route");
      follow.setAttribute("aria-label", `Follow route to ${adventure.title}`);
      follow.disabled = !adventure.entrance;
      follow.addEventListener("click", async () => {
        scene.trackedDungeonID = adventure.id;
        cancelDungeonRoute(scene);
        close();
        if (scene.animating) await scene.worldStepDone;
        if (scene.scene?.isActive()) void followDungeonRoute(scene, adventure);
      });
      card.append(follow);
      section.append(card);
    }
    const find = element(
      "button",
      "world-map-find-adventures",
      `Find adventures (${model.adventures.length})`,
    );
    find.addEventListener("click", () => {
      section.scrollIntoView({ block: "start" });
      section
        .querySelector("button:not(:disabled)")
        ?.focus({ preventScroll: true });
    });
    dialog.header.append(find);
    dialog.body.append(section);
  }
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
