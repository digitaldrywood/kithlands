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
export const T_STAIR_UP = 17;
export const T_STAIR_DOWN = 18;
export const T_SECRET_WALL = 19;
export const T_LOCKED_DOOR = 20;
export const T_CHEST_CLOSED = 21;
export const T_CHEST_OPEN = 22;

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
  [T_STAIR_UP]: 0xcfd8dc,
  [T_STAIR_DOWN]: 0xb0bec5,
  [T_SECRET_WALL]: 0x5d4037,
  [T_LOCKED_DOOR]: 0xffca28,
  [T_CHEST_CLOSED]: 0x8d6e63,
  [T_CHEST_OPEN]: 0xa1887f,
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
  [T_STAIR_UP]: true,
  [T_STAIR_DOWN]: true,
  [T_SECRET_WALL]: true,
  [T_LOCKED_DOOR]: false,
  [T_CHEST_CLOSED]: false,
  [T_CHEST_OPEN]: false,
};

const TEMPLATE_TILE_BY_SYMBOL = {
  W: T_WALL,
  ".": T_FLOOR,
  D: T_DOOR,
  C: T_COUNTER,
  O: T_BOOKSHELF,
  B: T_BED,
  A: T_ALTAR,
  K: T_DESK,
  R: T_RUG,
  F: T_FIREPLACE,
  X: T_CRATE,
  N: T_CANDLE,
  T: T_STATUE,
  P: T_PEW,
  H: T_CHAIR,
  M: T_TABLE,
  U: T_STAIR_UP,
  V: T_STAIR_DOWN,
  S: T_SECRET_WALL,
  L: T_LOCKED_DOOR,
};

export function buildInteriorFromTemplate(template, floorIndex = 0) {
  const floor = template?.floors?.[floorIndex];
  if (!floor) {
    throw new Error(`missing floor ${floorIndex} for template ${template?.id}`);
  }

  const tiles = floor.rows.map((row) =>
    [...row].map((symbol) => {
      const tile = TEMPLATE_TILE_BY_SYMBOL[symbol];
      if (tile === undefined) {
        throw new Error(
          `unknown interior symbol ${symbol} in template ${template.id}`,
        );
      }
      return tile;
    }),
  );

  for (const chest of floor.chest_anchors || []) {
    tiles[chest.y][chest.x] = T_CHEST_CLOSED;
  }

  return {
    roomW: floor.width,
    roomH: floor.height,
    tiles,
    floor,
    entrance: floor.entrance || null,
    npcAnchors: floor.npc_anchors || [],
    chestAnchors: floor.chest_anchors || [],
    windowAnchors: floor.window_anchors || [],
    lightAnchors: floor.light_anchors || [],
    stairsByPosition: new Map(
      (floor.stairs || []).map((stair) => [`${stair.x},${stair.y}`, stair]),
    ),
  };
}

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
    return ["npc_flavor_amber", "npc_flavor_bram", "npc_gossip"];
  }
  if (tagSet.has("shop") || tagSet.has("commerce")) {
    return ["npc_flavor_bram", "npc_gossip"];
  }
  if (tagSet.has("temple") || tagSet.has("revive")) {
    return ["npc_guard", "npc_flavor_amber", "npc_gossip"];
  }
  return ["npc_flavor_amber", "npc_flavor_bram", "npc_gossip"];
}

const ROLE_SPRITES = {
  innkeeper: ["npc_innkeeper"],
  shopkeeper: ["npc_merchant"],
  priestess: ["npc_priestess"],
  priest: ["npc_priestess"],
  blacksmith: ["npc_blacksmith"],
  guard: ["npc_guard"],
  elder: ["npc_elder"],
  widow: ["npc_elder"],
  merchant_wandering: ["npc_flavor_bram"],
  quest_giver: ["npc_quest_giver"],
  gossip: ["npc_gossip"],
  flavor: ["npc_flavor_amber", "npc_flavor_bram", "npc_gossip"],
};

const FLOOR_TEXTURES = {
  house: [
    "tile_house_floor",
    "tile_house_floor_b",
    "tile_house_floor_c",
    "tile_house_floor_d",
  ],
  inn: [
    "tile_inn_floor",
    "tile_inn_floor_b",
    "tile_inn_floor_c",
    "tile_inn_floor_d",
  ],
  shop: [
    "tile_shop_floor",
    "tile_shop_floor_b",
    "tile_shop_floor_c",
    "tile_shop_floor_d",
  ],
  temple: [
    "tile_temple_floor",
    "tile_temple_floor_b",
    "tile_temple_floor_c",
    "tile_temple_floor_d",
  ],
};

const WALL_TEXTURES = {
  house: ["tile_house_wall", "tile_house_wall_b", "tile_house_wall_c"],
  inn: ["tile_inn_wall", "tile_inn_wall_b", "tile_inn_wall_c"],
  shop: ["tile_shop_wall", "tile_shop_wall_b", "tile_shop_wall_c"],
  temple: ["tile_temple_wall", "tile_temple_wall_b", "tile_temple_wall_c"],
};

const RUG_TEXTURES = {
  house: ["tile_rug_house"],
  inn: ["tile_rug_inn"],
  shop: ["tile_rug_shop"],
  temple: ["tile_rug_temple"],
};

function hashCode(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function pickVariant(family, buildingType, x, y, variantSeed) {
  const textures = family[buildingType] || family.house || family.inn;
  if (!textures?.length) return null;
  if (x === undefined || y === undefined) return textures[0];
  const buildingBias = hashCode(buildingType) % textures.length;
  const variant =
    Math.abs(x * 7 + y * 11 + variantSeed * 13 + buildingBias) %
    textures.length;
  return textures[variant];
}

export function npcSpriteForRole(role, buildingType, tags, seed = 0, index = 0) {
  const choices = ROLE_SPRITES[role] || extraNpcSpritesForTags(tags);
  const pick = hashCode(`${role}:${buildingType}:${seed}:${index}`);
  return choices[pick % choices.length];
}

export function tileTextureKey(tile, buildingType, x, y, variantSeed = 0) {
  switch (tile) {
    case T_WALL:
    case T_SECRET_WALL:
      return pickVariant(WALL_TEXTURES, buildingType, x, y, variantSeed);
    case T_FLOOR:
      return pickVariant(FLOOR_TEXTURES, buildingType, x, y, variantSeed);
    case T_DOOR:
      return "tile_door";
    case T_STAIR_UP:
      return "tile_stairs_up";
    case T_STAIR_DOWN:
      return "tile_stairs_down";
    case T_LOCKED_DOOR:
      return "tile_locked_door";
    case T_CHEST_CLOSED:
    case T_CHEST_OPEN:
      return pickVariant(FLOOR_TEXTURES, buildingType, x, y, variantSeed);
    case T_RUG:
      return pickVariant(RUG_TEXTURES, buildingType, x, y, variantSeed);
    case T_FIREPLACE:
      return "tile_fireplace";
    case T_CRATE:
      return "tile_crate";
    case T_CANDLE:
      return "tile_candle";
    case T_STATUE:
      return "tile_statue";
    case T_PEW:
      return "tile_pew";
    case T_COUNTER:
      return "tile_counter";
    case T_DESK:
      return "tile_desk";
    case T_TABLE:
      return "tile_table";
    case T_CHAIR:
      return "tile_chair";
    case T_SHELF:
    case T_BOOKSHELF:
      return "tile_bookshelf";
    case T_BED:
      return "tile_bed";
    case T_ALTAR:
      return "tile_altar";
    default:
      return null;
  }
}

export function surfaceVariantKey(buildingType, surface, x, y, variantSeed = 0) {
  switch (surface) {
    case "floor":
      return pickVariant(FLOOR_TEXTURES, buildingType, x, y, variantSeed);
    case "wall":
      return pickVariant(WALL_TEXTURES, buildingType, x, y, variantSeed);
    case "rug":
      return pickVariant(RUG_TEXTURES, buildingType, x, y, variantSeed);
    default:
      return null;
  }
}
