import { trackedQuestID, trackQuest } from "../scenes/questJournalModel.js";
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
    (entry) => `dungeon:${entry.id}` === trackedQuestID(scene),
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
  let dialog, mapResize;
  const close = () => {
    mapResize?.disconnect();
    scene.events.off("shutdown", close);
    dialog.dispose();
  };
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
  // Adventure badges may share the campaign destination's coordinates.
  // Keep the destination ring visible above those badges.
  for (const place of model.locations.filter((place) => place.target)) {
    ctx.strokeStyle = "#f4d881";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(place.x * sx, place.y * sy, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#ed8d83";
  ctx.beginPath();
  ctx.arc(model.player.x * sx, model.player.y * sy, 7, 0, Math.PI * 2);
  ctx.fill();
  const mapImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const inspect = element("select", "world-map-place-select");
  inspect.id = `${dialog.root.id || "world-map"}-place`;
  const picker = element("label", "world-map-place-picker", "Inspect a place");
  picker.htmlFor = inspect.id;
  const selection = element("p", "world-map-selection");
  selection.setAttribute("role", "status");
  selection.setAttribute("aria-live", "polite");
  const initial =
    model.locations.find((place) => place.target) || model.locations[0];
  for (const place of model.locations) {
    const option = element(
      "option",
      "",
      `${place.target ? "★ " : ""}${place.name}`,
    );
    option.value = place.node_id;
    option.selected = place === initial;
    inspect.append(option);
  }
  const showPlace = () => {
    const place = model.locations.find(
      (place) => place.node_id === inspect.value,
    );
    if (!place) return;
    const dx = place.x - model.player.x,
      dy = place.y - model.player.y;
    const northSouth =
      Math.abs(dy) >= Math.abs(dx) * 0.414
        ? dy < 0
          ? "north"
          : dy > 0
            ? "south"
            : ""
        : "";
    const eastWest =
      Math.abs(dx) >= Math.abs(dy) * 0.414
        ? dx < 0
          ? "west"
          : dx > 0
            ? "east"
            : ""
        : "";
    const direction = northSouth + eastWest;
    selection.textContent = `${place.target ? "Destination" : "Selected place"}: ${place.name} · ${direction ? `${direction[0].toUpperCase()}${direction.slice(1)} of you` : "You are here"}`;
    ctx.putImageData(mapImage, 0, 0);
    const x = place.x * sx,
      y = place.y * sy;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 23, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "bold 22px sans-serif";
    const labelWidth = Math.min(
      canvas.width - 16,
      ctx.measureText(place.name).width + 20,
    );
    const left = Math.max(
      8,
      Math.min(canvas.width - labelWidth - 8, x - labelWidth / 2),
    );
    const top = y < 54 ? y + 28 : y - 54;
    ctx.fillStyle = "#151e2b";
    ctx.fillRect(left, top, labelWidth, 32);
    ctx.fillStyle = "#f4d881";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(place.name, left + labelWidth / 2, top + 16, labelWidth - 12);
    canvas.setAttribute(
      "aria-label",
      `Map: red marks your position; gold marks your destination. ${selection.textContent}. The white ring marks the inspected place.`,
    );
  };
  inspect.addEventListener("change", showPlace);
  picker.append(inspect);
  dialog.header.append(picker, selection);
  showPlace();
  dialog.body.append(
    canvas,
    element(
      "p",
      "world-map-legend",
      "● Red: you   ·   Gold: destination   ·   White ring: inspected place   ·   Numbers: adventures   ·   Sage: natural place",
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
        trackQuest(scene, `dungeon:${adventure.id}`);
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
  const button = element("button", "primary", "Back to game");
  button.addEventListener("click", close);
  dialog.footer.append(button);
  const fitMap = () => {
    const style = getComputedStyle(dialog.body);
    canvas.style.maxHeight = `${Math.max(100, dialog.body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))}px`;
  };
  mapResize = new ResizeObserver(fitMap);
  mapResize.observe(dialog.body);
  scene.events.once("shutdown", close);
  fitMap();
  return dialog;
}
