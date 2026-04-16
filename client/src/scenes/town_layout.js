// Pure helpers for town interiors. Keep these Phaser-free so unit tests can
// verify sizing and render choices without booting a scene.

export const TILE_SIZE = 16;
export const SCALE = 2;
export const RENDERED_TILE = TILE_SIZE * SCALE;

// Interior tile IDs (local to TownScene)
export const T_WALL = 0;
export const T_FLOOR = 1;
export const T_DOOR = 2;
export const T_COUNTER = 3;
export const T_SHELF = 4;
export const T_BED = 5;
export const T_ALTAR = 6;
export const T_DESK = 7;
export const T_RUG = 8;
export const T_FIREPLACE = 9;
export const T_CRATE = 10;
export const T_CANDLE = 11;
export const T_STATUE = 12;
export const T_PEW = 13;
export const T_BOOKSHELF = 14;
export const T_CHAIR = 15;
export const T_TABLE = 16;

export const TILE_COLORS = {
  [T_WALL]: 0x5d4037,
  [T_FLOOR]: 0xbcaaa4,
  [T_DOOR]: 0xffc107,
  [T_COUNTER]: 0x8d6e63,
  [T_SHELF]: 0x6d4c41,
  [T_BED]: 0x7986cb,
  [T_ALTAR]: 0xffd54f,
  [T_DESK]: 0x8d6e63,
  [T_RUG]: 0xc62828,
  [T_FIREPLACE]: 0xff6f00,
  [T_CRATE]: 0xa1887f,
  [T_CANDLE]: 0xfff176,
  [T_STATUE]: 0x90a4ae,
  [T_PEW]: 0x6d4c41,
  [T_BOOKSHELF]: 0x4e342e,
  [T_CHAIR]: 0x795548,
  [T_TABLE]: 0x8d6e63,
};

export const TILE_WALKABLE = {
  [T_WALL]: false,
  [T_FLOOR]: true,
  [T_DOOR]: true,
  [T_COUNTER]: false,
  [T_SHELF]: false,
  [T_BED]: false,
  [T_ALTAR]: false,
  [T_DESK]: false,
  [T_RUG]: true,
  [T_FIREPLACE]: false,
  [T_CRATE]: false,
  [T_CANDLE]: false,
  [T_STATUE]: false,
  [T_PEW]: false,
  [T_BOOKSHELF]: false,
  [T_CHAIR]: false,
  [T_TABLE]: false,
};

export function roomDimensions(buildingType, seed, rngFactory) {
  const rng = (rngFactory || defaultRngFactory)(seed);
  switch (buildingType) {
    case "inn":
      return { w: 18 + Math.floor(rng() * 3), h: 12 + Math.floor(rng() * 3) };
    case "shop":
      return { w: 14 + Math.floor(rng() * 5), h: 10 + Math.floor(rng() * 4) };
    case "temple":
      return { w: 18 + Math.floor(rng() * 3), h: 12 + Math.floor(rng() * 5) };
    default:
      return { w: 16 + Math.floor(rng() * 5), h: 12 + Math.floor(rng() * 5) };
  }
}

function defaultRngFactory() {
  throw new Error("rngFactory required for randomized building dimensions");
}

export function furnitureDensity(buildingType) {
  switch (buildingType) {
    case "inn":
      return 0.05;
    case "temple":
      return 0.16;
    default:
      return 0.2;
  }
}

export function minimumNpcSpacing(buildingType) {
  switch (buildingType) {
    case "inn":
      return 5;
    case "temple":
      return 2;
    default:
      return 2;
  }
}

export function extraNpcSpritesForTags(tags) {
  const tagSet = new Set(tags || []);
  if (tagSet.has("rest")) {
    return ["npc_guard", "npc_blacksmith", "npc_elder"];
  }
  if (tagSet.has("shop") || tagSet.has("commerce")) {
    return ["npc_guard", "npc_elder"];
  }
  if (tagSet.has("temple") || tagSet.has("revive")) {
    return ["npc_guard", "npc_elder", "npc_blacksmith"];
  }
  return ["npc_guard", "npc_blacksmith", "npc_elder"];
}

function wallTextureKey(buildingType) {
  return buildingType === "temple" ? "tile_stone_wall" : "tile_wooden_wall";
}

function floorTextureKey(buildingType) {
  switch (buildingType) {
    case "shop":
      return "tile_shop_floor";
    case "temple":
      return "tile_temple_floor";
    default:
      return "tile_inn_floor";
  }
}

export function tileTextureKey(tile, buildingType) {
  switch (tile) {
    case T_WALL:
      return wallTextureKey(buildingType);
    case T_FLOOR:
    case T_DOOR:
    case T_RUG:
    case T_CANDLE:
      return floorTextureKey(buildingType);
    case T_COUNTER:
    case T_DESK:
    case T_TABLE:
      return "tile_counter";
    case T_SHELF:
    case T_BOOKSHELF:
    case T_CRATE:
      return "tile_bookshelf";
    case T_BED:
      return "tile_bed";
    case T_ALTAR:
    case T_STATUE:
    case T_PEW:
      return "tile_altar";
    default:
      return null;
  }
}
