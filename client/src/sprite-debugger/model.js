import { MONSTER_SPRITE_LOAD } from "../data/monsterSprites.js";
import {
  WALK_DIRS,
  WALK_FRAME_COUNT,
  WALK_SHEET_CLASS_IDS,
} from "../scenes/walkFrame.js";

export const GRID_DIMENSION = WALK_FRAME_COUNT;
const UPPERCASE_TOKENS = new Set(["xp"]);

function titleCase(value) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) =>
      UPPERCASE_TOKENS.has(part) ? part.toUpperCase() : capitalize(part),
    )
    .join(" ");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function asset(id, path, badgeLabel) {
  return {
    id,
    label: titleCase(id),
    badgeLabel,
    path,
  };
}

export const debuggerCatalog = {
  fallbackDirectionals: WALK_DIRS.map((dir) =>
    asset(
      `player_${dir}`,
      `/sprites/player_${dir}.png`,
      "Fallback directional",
    ),
  ),
  walkSheets: WALK_SHEET_CLASS_IDS.map((id) => ({
    id,
    label: titleCase(id),
    path: `/sprites/walk/${id}_walk.png`,
    runtimeKey: `${id}_walk`,
  })),
  portraits: WALK_SHEET_CLASS_IDS.map((id) =>
    asset(id, `/sprites/${id}.png`, "Class portrait"),
  ),
  monsters: MONSTER_SPRITE_LOAD.map(({ key, path }) =>
    asset(key.replace(/^monster_/, ""), path, "Monster"),
  ),
  npcs: [
    asset("elder", "/sprites/npcs/elder.png", "NPC"),
    asset("merchant", "/sprites/npcs/merchant.png", "NPC"),
    asset("blacksmith", "/sprites/npcs/blacksmith.png", "NPC"),
    asset("innkeeper", "/sprites/npcs/innkeeper.png", "NPC"),
    asset("priestess", "/sprites/npcs/priestess.png", "NPC"),
    asset("guard", "/sprites/npcs/guard.png", "NPC"),
  ],
  ui: [
    asset("sword", "/sprites/ui/icon_sword.png", "UI"),
    asset("shield", "/sprites/ui/icon_shield.png", "UI"),
    asset("potion", "/sprites/ui/icon_potion.png", "UI"),
    asset("spell", "/sprites/ui/icon_spell.png", "UI"),
    asset("gold", "/sprites/ui/icon_gold.png", "UI"),
    asset("xp", "/sprites/ui/icon_xp.png", "UI"),
    asset("poison", "/sprites/ui/icon_poison.png", "UI"),
    asset("sleep", "/sprites/ui/icon_sleep.png", "UI"),
    asset("mute", "/sprites/ui/icon_mute.png", "UI"),
    asset("slow", "/sprites/ui/icon_slow.png", "UI"),
    asset("paralyze", "/sprites/ui/icon_paralyze.png", "UI"),
    asset("confuse", "/sprites/ui/icon_confuse.png", "UI"),
  ],
};

export function buildSheetCells(imageWidth, imageHeight) {
  if (
    !Number.isInteger(imageWidth) ||
    !Number.isInteger(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    imageWidth % GRID_DIMENSION !== 0 ||
    imageHeight % GRID_DIMENSION !== 0
  ) {
    throw new Error(
      `Walk sheets must form an even ${GRID_DIMENSION}x${GRID_DIMENSION} grid.`,
    );
  }

  const cellWidth = imageWidth / GRID_DIMENSION;
  const cellHeight = imageHeight / GRID_DIMENSION;

  return WALK_DIRS.flatMap((direction, row) =>
    Array.from({ length: GRID_DIMENSION }, (_, col) => ({
      id: `r${row}-c${col}`,
      row,
      col,
      direction,
      frame: col,
      x: col * cellWidth,
      y: row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    })),
  );
}

export function formatSpriteLabel(value) {
  return titleCase(value);
}
