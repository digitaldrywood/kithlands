import { MONSTER_SPRITE_LOAD } from "../data/monsterSprites.js";
import {
  WALK_DIRS,
  WALK_FRAME_COUNT,
  WALK_FRAME_POSES,
  WALK_SHEET_ROW_COUNT,
  WALK_SHEET_CLASS_IDS,
  WALK_SKILL_DIRECTIONS,
  LEGACY_WALK_DIRECTIONS,
  WALK_SHEET_FORMATS,
  attackSheetKey,
  walkSheetGeometryForClass,
} from "../scenes/walkFrame.js";
import {
  BG_VARIANTS,
  enumerateBackgrounds,
} from "../scenes/battleBackgrounds.js";

export const GRID_DIMENSION = WALK_FRAME_COUNT;
export const SHEET_ROW_COUNT = WALK_SHEET_ROW_COUNT;
export const WALK_POSE_SEQUENCE = WALK_FRAME_POSES;
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
    geometry: walkSheetGeometryForClass(id),
  })),
  attackSheets: WALK_SHEET_CLASS_IDS.map((id) => ({
    id,
    label: `${titleCase(id)} Attack`,
    path: `/sprites/attack/${id}_attack.png`,
    runtimeKey: attackSheetKey(id),
    geometry: {
      formatId: "gameCharacter64AttackEight",
      formatLabel: "Game Character 64 attack 8-step",
      cellSize: 64,
      columns: 8,
      rows: WALK_SKILL_DIRECTIONS.length,
      directions: WALK_SKILL_DIRECTIONS,
      poses: WALK_SHEET_FORMATS.legacy128.poses,
    },
  })),
  walkCandidates: [
    {
      id: "warrior-greenkey-side-20260427",
      label: "Warrior Side Row Candidate",
      status: "Review only - not installed",
      sourcePath:
        "/tmp/walk-audit/row-candidates/warrior-right-greenkey-20260427.png",
      leftRowPath:
        "/tmp/walk-audit/rows/warrior_left_row_greenkey_20260427.png",
      rightRowPath:
        "/tmp/walk-audit/rows/warrior_right_row_greenkey_20260427.png",
      leftMotionPath:
        "/tmp/walk-audit/rows/warrior_left_row_greenkey_20260427.motion.json",
      rightMotionPath:
        "/tmp/walk-audit/rows/warrior_right_row_greenkey_20260427.motion.json",
      sideSheetPath:
        "/tmp/walk-audit/rows/warrior_side_only_greenkey_sheet_20260427.png",
      gifPath:
        "/tmp/walk-audit/animation-proof-row/warrior_greenkey_side_candidate_side_compare.gif",
      notes: [
        "Generated from the row-only prompt after the full-sheet candidate failed.",
        "Shows richer side-profile art, but has green-key edge contamination.",
        "Frames include large knee-lift poses that may still read as skipping.",
        "Preview is intentionally separate from runtime sheets until accepted.",
      ],
    },
    {
      id: "warrior-magenta-side-20260427",
      label: "Warrior Side Row Candidate v1",
      status: "Rejected - edge contamination",
      sourcePath:
        "/tmp/walk-audit/row-candidates/warrior-left-prompt-facing-right-20260427.png",
      leftRowPath:
        "/tmp/walk-audit/rows/warrior_left_row_candidate_20260427.png",
      rightRowPath:
        "/tmp/walk-audit/rows/warrior_right_row_candidate_20260427.png",
      leftMotionPath: null,
      rightMotionPath: null,
      sideSheetPath:
        "/tmp/walk-audit/rows/warrior_side_only_candidate_sheet_20260427.png",
      gifPath:
        "/tmp/walk-audit/animation-proof-row/warrior_side_candidate_side_compare.gif",
      notes: [
        "Older magenta-key candidate kept for comparison.",
        "Rejected because magenta leaked into hair, outline, boots, and shadow.",
      ],
    },
  ],
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
  backgrounds: enumerateBackgrounds().map(({ motif, variant, key, path }) => ({
    id: key,
    label: `${titleCase(motif)} #${variant}`,
    badgeLabel: "BG",
    path: `/${path}`,
    motif,
    variant,
  })),
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

function defaultGeometryForImage(imageWidth, imageHeight) {
  if (imageWidth % 8 === 0 && imageHeight % 4 === 0) {
    return {
      columns: 8,
      rows: 4,
      directions: LEGACY_WALK_DIRECTIONS,
      poses: WALK_SHEET_FORMATS.legacy128.poses,
    };
  }
  return {
    columns: GRID_DIMENSION,
    rows: SHEET_ROW_COUNT,
    directions: WALK_SKILL_DIRECTIONS,
    poses: WALK_FRAME_POSES,
  };
}

export function buildSheetCells(imageWidth, imageHeight, geometry = null) {
  const resolvedGeometry =
    geometry || defaultGeometryForImage(imageWidth, imageHeight);
  const columns = resolvedGeometry.columns;
  const rows = resolvedGeometry.rows;
  const directions = resolvedGeometry.directions;
  const poses = resolvedGeometry.poses;

  if (
    !Number.isInteger(imageWidth) ||
    !Number.isInteger(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    imageWidth % columns !== 0 ||
    imageHeight % rows !== 0
  ) {
    throw new Error(`Walk sheets must form an even ${columns}x${rows} grid.`);
  }

  const cellWidth = imageWidth / columns;
  const cellHeight = imageHeight / rows;

  return directions.flatMap((direction, row) =>
    Array.from({ length: columns }, (_, col) => ({
      id: `r${row}-c${col}`,
      row,
      col,
      direction,
      frame: col,
      pose: poses[col % poses.length],
      x: col * cellWidth,
      y: row * cellHeight,
      width: cellWidth,
      height: cellHeight,
      sheetWidth: imageWidth,
      sheetHeight: imageHeight,
    })),
  );
}

export function formatSpriteLabel(value) {
  return titleCase(value);
}

export function totalBackgroundCount() {
  return Object.values(BG_VARIANTS).reduce((acc, n) => acc + n, 0);
}
