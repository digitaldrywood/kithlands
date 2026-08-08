export const LEGACY_WALK_FRAME_COUNT = 8;
export const SKILL_WALK_FRAME_COUNT = 6;
export const SKILL_WALK_EIGHT_FRAME_COUNT = 8;
export const WALK_FRAME_COUNT = SKILL_WALK_FRAME_COUNT;
export const WALK_IDLE_FRAME = 0;
export const LEGACY_WALK_STEP_FRAME_SEQUENCE = [0, 1, 2, 3, 4, 5, 6, 7];
export const SKILL_WALK_STEP_FRAME_SEQUENCE = [0, 1, 2, 3, 4, 5];
export const SKILL_WALK_EIGHT_STEP_FRAME_SEQUENCE = [0, 1, 2, 3, 4, 5, 6, 7];
export const WALK_STEP_FRAME_SEQUENCE = SKILL_WALK_STEP_FRAME_SEQUENCE;
export const WALK_FRAME_POSES = [
  {
    id: "contact-a",
    label: "Contact A",
    shortLabel: "Contact",
    critique:
      "Front heel reaches while the rear toe still trails; this is an extreme, not the whole step.",
  },
  {
    id: "down-a",
    label: "Down A",
    shortLabel: "Down",
    critique:
      "Weight settles onto the front foot; hips and shoulders are slightly lower than contact.",
  },
  {
    id: "passing-a",
    label: "Passing A",
    shortLabel: "Passing",
    critique:
      "Rear foot passes under the body with the support leg near vertical; this frame prevents skipping.",
  },
  {
    id: "high-a",
    label: "High A",
    shortLabel: "High",
    critique:
      "Body rises as the free foot moves forward; this is the lifted recovery before the next contact.",
  },
  {
    id: "contact-b",
    label: "Contact B",
    shortLabel: "Contact",
    critique: "Opposite-foot contact mirrors frame 0 with the stride reversed.",
  },
  {
    id: "down-b",
    label: "Down B",
    shortLabel: "Down",
    critique:
      "Opposite-foot weight settles; do not duplicate the contact pose.",
  },
];
export const LEGACY_WALK_FRAME_POSES = [
  ...WALK_FRAME_POSES,
  {
    id: "passing-b",
    label: "Passing B",
    shortLabel: "Passing",
    critique:
      "Opposite rear foot passes under the body with the support leg near vertical.",
  },
  {
    id: "high-b",
    label: "High B",
    shortLabel: "High",
    critique:
      "Body rises into the opposite lifted recovery before the loop returns.",
  },
];
export const WALK_DIRS = ["down", "up", "left", "right"];
export const LEGACY_WALK_DIRECTIONS = WALK_DIRS;
export const WALK_SKILL_DIRECTIONS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
];
export const WALK_SKILL_DIRECTION_INDEX = {
  south: 0,
  "south-east": 1,
  east: 2,
  "north-east": 3,
  north: 4,
  "north-west": 5,
  west: 6,
  "south-west": 7,
};
export const WALK_DIR_TO_SKILL_DIRECTION = {
  down: "south",
  up: "north",
  left: "west",
  right: "east",
};
export const LEGACY_WALK_DIR_INDEX = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
};
export const WALK_DIR_INDEX = {
  down: WALK_SKILL_DIRECTION_INDEX.south,
  up: WALK_SKILL_DIRECTION_INDEX.north,
  left: WALK_SKILL_DIRECTION_INDEX.west,
  right: WALK_SKILL_DIRECTION_INDEX.east,
};
export const LEGACY_WALK_SHEET_CELL_SIZE = 128;
export const SKILL_WALK_SHEET_CELL_SIZE = 64;
export const WALK_SHEET_CELL_SIZE = SKILL_WALK_SHEET_CELL_SIZE;
export const LEGACY_WALK_SHEET_ROW_COUNT = LEGACY_WALK_DIRECTIONS.length;
export const SKILL_WALK_SHEET_ROW_COUNT = WALK_SKILL_DIRECTIONS.length;
export const WALK_SHEET_ROW_COUNT = SKILL_WALK_SHEET_ROW_COUNT;
export const WALK_SHEET_COLUMN_COUNT = SKILL_WALK_FRAME_COUNT;
export const WALK_SPRITE_SCALE_MULTIPLIER = 2.0;
export const WALK_SHEET_CLASS_IDS = [
  "warrior",
  "brawler",
  "rogue",
  "mender",
  "cinder",
  "wayfarer",
  "knight",
  "champion",
  "shadow",
  "sage",
  "pyromancer",
  "wanderer",
];
export const RUNTIME_WALK_SHEET_CLASS_IDS = WALK_SHEET_CLASS_IDS;

export const WALK_SHEET_FORMATS = {
  legacy128: {
    id: "legacy128",
    label: "Legacy Kithlands 128",
    cellSize: LEGACY_WALK_SHEET_CELL_SIZE,
    columns: LEGACY_WALK_FRAME_COUNT,
    rows: LEGACY_WALK_SHEET_ROW_COUNT,
    directions: LEGACY_WALK_DIRECTIONS,
    directionIndex: LEGACY_WALK_DIR_INDEX,
    stepFrameSequence: LEGACY_WALK_STEP_FRAME_SEQUENCE,
    poses: LEGACY_WALK_FRAME_POSES,
  },
  gameCharacter64: {
    id: "gameCharacter64",
    label: "Game Character 64 native",
    cellSize: SKILL_WALK_SHEET_CELL_SIZE,
    columns: SKILL_WALK_FRAME_COUNT,
    rows: SKILL_WALK_SHEET_ROW_COUNT,
    directions: WALK_SKILL_DIRECTIONS,
    directionIndex: WALK_SKILL_DIRECTION_INDEX,
    gameDirToSheetDir: WALK_DIR_TO_SKILL_DIRECTION,
    stepFrameSequence: SKILL_WALK_STEP_FRAME_SEQUENCE,
    poses: WALK_FRAME_POSES,
  },
  gameCharacter64Eight: {
    id: "gameCharacter64Eight",
    label: "Game Character 64 native 8-step",
    cellSize: SKILL_WALK_SHEET_CELL_SIZE,
    columns: SKILL_WALK_EIGHT_FRAME_COUNT,
    rows: SKILL_WALK_SHEET_ROW_COUNT,
    directions: WALK_SKILL_DIRECTIONS,
    directionIndex: WALK_SKILL_DIRECTION_INDEX,
    gameDirToSheetDir: WALK_DIR_TO_SKILL_DIRECTION,
    stepFrameSequence: SKILL_WALK_EIGHT_STEP_FRAME_SEQUENCE,
    poses: LEGACY_WALK_FRAME_POSES,
  },
};

export const WALK_SHEET_FORMAT_BY_CLASS = {
  warrior: "gameCharacter64",
  brawler: "gameCharacter64",
  rogue: "gameCharacter64",
  mender: "gameCharacter64",
  cinder: "gameCharacter64",
  wayfarer: "gameCharacter64",
  knight: "gameCharacter64",
  champion: "gameCharacter64",
  shadow: "gameCharacter64",
  sage: "gameCharacter64",
  pyromancer: "gameCharacter64",
  wanderer: "gameCharacter64",
};

export function nextWalkFrame(prevFrame) {
  return (prevFrame + 1) % WALK_FRAME_COUNT;
}

export function walkSheetKey(classId) {
  return `${classId}_walk`;
}

export function attackSheetKey(classId) {
  return `${classId}_attack`;
}

export function attackSheetFrameSize() {
  return SKILL_WALK_SHEET_CELL_SIZE;
}

export function attackFrameIndex(dir, frame) {
  const sheetDir = WALK_DIR_TO_SKILL_DIRECTION[dir] || dir;
  const row =
    WALK_SKILL_DIRECTION_INDEX[sheetDir] ?? WALK_SKILL_DIRECTION_INDEX.east;
  return (
    row * SKILL_WALK_EIGHT_FRAME_COUNT + (frame % SKILL_WALK_EIGHT_FRAME_COUNT)
  );
}

export function walkSheetFormatForClass(classId) {
  const formatId = WALK_SHEET_FORMAT_BY_CLASS[classId] || "legacy128";
  return WALK_SHEET_FORMATS[formatId] || WALK_SHEET_FORMATS.legacy128;
}

export function walkSheetGeometryForClass(classId) {
  const format = walkSheetFormatForClass(classId);
  return {
    formatId: format.id,
    formatLabel: format.label,
    cellSize: format.cellSize,
    columns: format.columns,
    rows: format.rows,
    directions: format.directions,
    poses: format.poses,
  };
}

export function walkSheetFrameSize(classId) {
  return walkSheetFormatForClass(classId).cellSize;
}

export function walkFrameCount(classId) {
  return walkSheetFormatForClass(classId).columns;
}

export function walkFrameSequence(classId) {
  return walkSheetFormatForClass(classId).stepFrameSequence;
}

export function walkFrameIndex(dir, frame, classId) {
  const format = walkSheetFormatForClass(classId);
  const sheetDir = format.gameDirToSheetDir?.[dir] || dir;
  const row = format.directionIndex[sheetDir] ?? 0;
  return row * format.columns + (frame % format.columns);
}

export function walkFramePose(frame) {
  return WALK_FRAME_POSES[frame % WALK_FRAME_POSES.length];
}

export function walkFrameForProgress(progress, classId) {
  const sequence = walkFrameSequence(classId);
  const clamped = Math.max(0, Math.min(0.999, Number(progress) || 0));
  const index = Math.floor(clamped * sequence.length);
  return sequence[index];
}

export function walkSpriteScale(renderedTile, classId) {
  const cellSize = walkSheetFrameSize(classId);
  return (renderedTile / cellSize) * WALK_SPRITE_SCALE_MULTIPLIER;
}

export function fallbackWalkSpriteScale(renderedTile) {
  return (
    (renderedTile / LEGACY_WALK_SHEET_CELL_SIZE) * WALK_SPRITE_SCALE_MULTIPLIER
  );
}

export function classPortraitFallbackScale(renderedTile) {
  return (renderedTile / 192) * WALK_SPRITE_SCALE_MULTIPLIER;
}

export function walkSpritePosition(
  tileX,
  tileY,
  renderedTile,
  offsetX = 0,
  offsetY = 0,
) {
  return {
    x: offsetX + tileX * renderedTile + renderedTile / 2,
    y: offsetY + (tileY + 1) * renderedTile,
  };
}

/**
 * Return the next alive party-member index, skipping dead (hp <= 0) members.
 * Wraps around to the beginning. Returns currentIndex unchanged when the party
 * has zero or one alive member.
 */
export function nextLeaderIndex(party, currentIndex) {
  if (!party || party.length <= 1) return 0;
  let next = (currentIndex + 1) % party.length;
  const start = next;
  do {
    if (party[next].hp > 0) return next;
    next = (next + 1) % party.length;
  } while (next !== start);
  return currentIndex;
}
