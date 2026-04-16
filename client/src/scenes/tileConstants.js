export const TILE_IDS = Object.freeze({
  grass: 0,
  path: 1,
  water: 2,
  tree: 3,
  building: 4,
  door: 5,
  floor: 6,
  rock: 7,
  bush: 8,
  darkGrass: 9,
  forest: 10,
  hill: 11,
  sand: 12,
  marsh: 13,
  lake: 14,
  river: 15,
  snow: 16,
  mountain: 17,
  bridge: 18,
});

export const TILE_COLORS = Object.freeze({
  [TILE_IDS.grass]: 0x5ea84a,
  [TILE_IDS.path]: 0xc9965c,
  [TILE_IDS.water]: 0x2372c7,
  [TILE_IDS.tree]: 0x195f29,
  [TILE_IDS.building]: 0x795548,
  [TILE_IDS.door]: 0xffc107,
  [TILE_IDS.floor]: 0xbcaaa4,
  [TILE_IDS.rock]: 0x8b8b8b,
  [TILE_IDS.bush]: 0x3f8e41,
  [TILE_IDS.darkGrass]: 0x2f7c38,
  [TILE_IDS.forest]: 0x103d1b,
  [TILE_IDS.hill]: 0x8d7751,
  [TILE_IDS.sand]: 0xe9cb77,
  [TILE_IDS.marsh]: 0x5b7040,
  [TILE_IDS.lake]: 0x2b92d6,
  [TILE_IDS.river]: 0x52b8ea,
  [TILE_IDS.snow]: 0xdfeef8,
  [TILE_IDS.mountain]: 0x5f6772,
  [TILE_IDS.bridge]: 0x8b5b34,
});

export const TILE_SPRITE_KEYS = Object.freeze({
  [TILE_IDS.grass]: "tile_grass",
  [TILE_IDS.path]: "tile_path",
  [TILE_IDS.water]: "tile_water",
  [TILE_IDS.tree]: "tile_tree",
  [TILE_IDS.rock]: "tile_rock",
  [TILE_IDS.bush]: "tile_bush",
  [TILE_IDS.darkGrass]: "tile_dark_grass",
  [TILE_IDS.forest]: "tile_forest",
  [TILE_IDS.hill]: "tile_hill",
  [TILE_IDS.sand]: "tile_sand",
  [TILE_IDS.marsh]: "tile_marsh",
  [TILE_IDS.lake]: "tile_lake",
  [TILE_IDS.river]: "tile_river",
  [TILE_IDS.snow]: "tile_snow",
  [TILE_IDS.mountain]: "tile_mountain",
  [TILE_IDS.bridge]: "tile_bridge",
});

export const TILE_WALKABLE = Object.freeze({
  [TILE_IDS.grass]: true,
  [TILE_IDS.path]: true,
  [TILE_IDS.water]: false,
  [TILE_IDS.tree]: false,
  [TILE_IDS.building]: false,
  [TILE_IDS.door]: true,
  [TILE_IDS.floor]: true,
  [TILE_IDS.rock]: false,
  [TILE_IDS.bush]: false,
  [TILE_IDS.darkGrass]: true,
  [TILE_IDS.forest]: false,
  [TILE_IDS.hill]: true,
  [TILE_IDS.sand]: true,
  [TILE_IDS.marsh]: true,
  [TILE_IDS.lake]: false,
  [TILE_IDS.river]: false,
  [TILE_IDS.snow]: true,
  [TILE_IDS.mountain]: false,
  [TILE_IDS.bridge]: true,
});

export const WATER_TILES = Object.freeze({
  [TILE_IDS.water]: true,
  [TILE_IDS.lake]: true,
  [TILE_IDS.river]: true,
});

export const FLY_TILES = Object.freeze({
  [TILE_IDS.water]: true,
  [TILE_IDS.tree]: true,
  [TILE_IDS.rock]: true,
  [TILE_IDS.bush]: true,
  [TILE_IDS.forest]: true,
  [TILE_IDS.lake]: true,
  [TILE_IDS.river]: true,
  [TILE_IDS.snow]: true,
  [TILE_IDS.mountain]: true,
});

export const TILE_ENCOUNTER_MULTIPLIERS = Object.freeze({
  [TILE_IDS.grass]: 0.5,
  [TILE_IDS.path]: 0.1,
  [TILE_IDS.water]: 0,
  [TILE_IDS.tree]: 0,
  [TILE_IDS.building]: 0,
  [TILE_IDS.door]: 0,
  [TILE_IDS.floor]: 0,
  [TILE_IDS.rock]: 0,
  [TILE_IDS.bush]: 0,
  [TILE_IDS.darkGrass]: 1.0,
  [TILE_IDS.forest]: 1.5,
  [TILE_IDS.hill]: 1.2,
  [TILE_IDS.sand]: 0.7,
  [TILE_IDS.marsh]: 1.3,
  [TILE_IDS.lake]: 0,
  [TILE_IDS.river]: 0,
  [TILE_IDS.snow]: 0.9,
  [TILE_IDS.mountain]: 0,
  [TILE_IDS.bridge]: 0.1,
});

const GROUND_TILES = new Set([
  TILE_IDS.grass,
  TILE_IDS.darkGrass,
  TILE_IDS.sand,
  TILE_IDS.marsh,
  TILE_IDS.hill,
  TILE_IDS.snow,
]);

const LIQUID_TILES = new Set([TILE_IDS.water, TILE_IDS.lake, TILE_IDS.river]);

const PATH_TILES = new Set([TILE_IDS.path, TILE_IDS.bridge]);

export function isGroundTile(tile) {
  return GROUND_TILES.has(tile);
}

export function isLiquidTile(tile) {
  return LIQUID_TILES.has(tile);
}

export function isPathTile(tile) {
  return PATH_TILES.has(tile);
}

export function blendPriority(tile) {
  switch (tile) {
    case TILE_IDS.water:
    case TILE_IDS.lake:
    case TILE_IDS.river:
      return 100;
    case TILE_IDS.mountain:
      return 90;
    case TILE_IDS.forest:
    case TILE_IDS.tree:
      return 80;
    case TILE_IDS.snow:
    case TILE_IDS.hill:
      return 65;
    case TILE_IDS.marsh:
      return 55;
    case TILE_IDS.darkGrass:
      return 45;
    case TILE_IDS.sand:
      return 35;
    case TILE_IDS.grass:
      return 25;
    default:
      return 0;
  }
}
