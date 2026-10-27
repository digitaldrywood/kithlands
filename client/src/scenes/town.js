import { interiorControls } from "../ui/interior_controls.js";
import { installInteriorCamera } from "./interiorCamera.js";
import { installEscortFollower } from "./escortFollower.js";
import { startWalkMotion } from "./walkMotion.js";
import { beginWalkStep } from "./walkPlayback.js";
import { initAudio, playSFX, playMusic } from "../systems/audio.js";
import {
  autosaveGame,
  openChest,
  collectHiddenItem,
  interactWithNpc,
  restAtTown,
  transitionLocation,
} from "../api.js";
import {
  drawTownObjective,
  nearbyQuestObjective,
  performQuestObjective,
  syncTownObjectiveVisibility,
} from "./town_objectives.js";
import { openDialogue } from "./town_dialogue.js";
import {
  drawInteriorForeground,
  preloadInteriorChests,
  preloadInteriorProps,
  drawInteriorProps,
  interiorChestKey,
} from "./town_presentation.js";
import { toggleMenu, showQuestLog } from "./world_menu.js";
import { trackedObjective } from "./questJournalModel.js";
import { openShop } from "./world_shop.js";
import { isTouchDevice, initTouchControls } from "../systems/input.js";
import {
  walkSheetKey,
  walkFrameIndex,
  walkSpritePosition,
  walkSpriteScale,
  fallbackWalkSpriteScale,
  classPortraitFallbackScale,
  WALK_IDLE_FRAME,
} from "./walkFrame.js";
import { getLeaderIndex } from "./world.js";
import { buildingTypeFromTags, isRestBuilding } from "./building_type.js";
import {
  buildInteriorFromTemplate,
  extraNpcSpritesForTags,
  furnitureDensity,
  minimumNpcSpacing,
  npcSpriteForRole,
  RENDERED_TILE,
  roomDimensions,
  SCALE,
  T_ALTAR,
  T_BED,
  T_BOOKSHELF,
  T_CANDLE,
  T_CHAIR,
  T_CHEST_CLOSED,
  T_CHEST_OPEN,
  T_COUNTER,
  T_CRATE,
  T_DESK,
  T_DOOR,
  T_FIREPLACE,
  T_FLOOR,
  T_LOCKED_DOOR,
  T_PEW,
  T_RUG,
  T_SHELF,
  T_SECRET_WALL,
  T_STAIR_DOWN,
  T_STAIR_UP,
  T_STATUE,
  T_TABLE,
  T_WALL,
  TILE_COLORS,
  TILE_WALKABLE,
  interiorPresentationFromTemplate,
  tileTextureKey,
} from "./town_layout.js";
import { walkStepMs } from "../systems/prefs.js";
import { drawPanel } from "../ui/panel.js";
import {
  hasWorldLock,
  pauseWorldFor,
  resumeWorldFor,
  isWorldInputLocked,
  topWorldLock,
} from "../systems/modalLock.js";
import { shouldStartBattle } from "./encounterFlow.js";
import { isChestOpen } from "./town_chests.js";
import {
  applyGameplayViewport,
  centeredPlayfieldOffset,
  portraitFontSize,
} from "../systems/gameplayViewport.js";

// Seeded PRNG (mulberry32). Returns a () => float [0,1) closure.
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Room dimensions and density helpers live in town_layout.js so they can be
// tested without booting Phaser.

// NPC count by building type (2-4 per spec)
function npcCount(buildingType) {
  switch (buildingType) {
    case "inn":
      return 4;
    case "shop":
      return 3;
    case "temple":
      return 4;
    default:
      return 3;
  }
}

// NPC sprite mapping by building tags (proprietor)
export function npcSpriteForTags(tags) {
  const tagSet = new Set(tags || []);
  if (tagSet.has("heal")) return "npc_priestess";
  if (tagSet.has("rest")) return "npc_innkeeper";
  if (tagSet.has("shop") || tagSet.has("commerce")) return "npc_merchant";
  if (tagSet.has("temple") || tagSet.has("revive")) return "npc_priestess";
  return "npc_elder";
}

export function interiorCharacterScale(sourcePixels = 128) {
  return (RENDERED_TILE / Math.max(sourcePixels, 1)) * SCALE;
}

// Proprietor NPC position (first NPC, behind key furniture)
function proprietorPosition(buildingType, roomW, roomH) {
  const cx = Math.floor(roomW / 2);
  switch (buildingType) {
    case "shop":
      return { x: cx, y: Math.floor(roomH / 2) - 1 }; // behind counter
    case "inn":
      return { x: cx, y: 2 }; // behind reception desk
    case "temple":
      return { x: cx, y: 1 }; // behind altar
    default:
      return { x: cx, y: 1 }; // behind desk
  }
}

// Weighted furniture pools per building type
const FURNITURE_POOLS = {
  inn: [
    { tile: T_BED, weight: 3 },
    { tile: T_TABLE, weight: 2 },
    { tile: T_RUG, weight: 2 },
    { tile: T_FIREPLACE, weight: 1 },
  ],
  shop: [
    { tile: T_SHELF, weight: 3 },
    { tile: T_COUNTER, weight: 2 },
    { tile: T_CRATE, weight: 2 },
  ],
  temple: [
    { tile: T_ALTAR, weight: 1 },
    { tile: T_CANDLE, weight: 3 },
    { tile: T_STATUE, weight: 1 },
    { tile: T_PEW, weight: 3 },
  ],
  house: [
    { tile: T_BED, weight: 1 },
    { tile: T_TABLE, weight: 1 },
    { tile: T_CHAIR, weight: 2 },
    { tile: T_BOOKSHELF, weight: 1 },
  ],
};

// Pick a tile from the weighted pool using a random value [0,1)
function pickFromPool(pool, randVal) {
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  let acc = 0;
  for (const item of pool) {
    acc += item.weight / totalWeight;
    if (randVal < acc) return item.tile;
  }
  return pool[pool.length - 1].tile;
}

// Flood-fill reachability check from (startX, startY).
// Returns a Set of "x,y" keys for all reachable walkable tiles.
function floodFill(tiles, roomW, roomH, startX, startY, npcPositions) {
  const npcSet = new Set(npcPositions.map((p) => `${p.x},${p.y}`));
  const visited = new Set();
  const queue = [{ x: startX, y: startY }];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (
        nx >= 0 &&
        nx < roomW &&
        ny >= 0 &&
        ny < roomH &&
        !visited.has(key) &&
        TILE_WALKABLE[tiles[ny][nx]] &&
        !npcSet.has(key)
      ) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return visited;
}

// Generate interior layout based on building type with seeded randomization
function generateInterior(buildingType, roomW, roomH, seed) {
  const tiles = [];
  for (let y = 0; y < roomH; y++) {
    tiles[y] = [];
    for (let x = 0; x < roomW; x++) {
      if (y === 0 || y === roomH - 1 || x === 0 || x === roomW - 1) {
        tiles[y][x] = T_WALL;
      } else {
        tiles[y][x] = T_FLOOR;
      }
    }
  }

  // Door at bottom center
  const doorX = Math.floor(roomW / 2);
  tiles[roomH - 1][doorX] = T_DOOR;

  const rng = mulberry32(seed);
  const pool = FURNITURE_POOLS[buildingType] || FURNITURE_POOLS.house;

  // Place type-specific anchor furniture first
  placeAnchorFurniture(tiles, buildingType, roomW, roomH);

  // Place random furniture from weighted pool
  const interiorArea = (roomW - 2) * (roomH - 2);
  const furnitureCount =
    Math.floor(interiorArea * furnitureDensity(buildingType)) + 2;

  for (let i = 0; i < furnitureCount; i++) {
    const tile = pickFromPool(pool, rng());
    // Try up to 10 random positions
    for (let attempt = 0; attempt < 10; attempt++) {
      const fx = 1 + Math.floor(rng() * (roomW - 2));
      const fy = 1 + Math.floor(rng() * (roomH - 2));
      // Only place on empty floor, not on door row, not adjacent to door
      if (
        tiles[fy][fx] === T_FLOOR &&
        fy !== roomH - 1 &&
        !(fy === roomH - 2 && fx === doorX)
      ) {
        tiles[fy][fx] = tile;
        break;
      }
    }
  }

  return tiles;
}

// Place signature furniture for each building type
function placeAnchorFurniture(tiles, buildingType, roomW, roomH) {
  const cx = Math.floor(roomW / 2);

  switch (buildingType) {
    case "shop":
      {
        // Counter across the middle
        const counterRow = Math.floor(roomH / 2);
        for (let x = 2; x <= roomW - 3; x++) {
          if (counterRow > 0 && counterRow < roomH - 1) {
            tiles[counterRow][x] = T_COUNTER;
          }
        }
      }
      break;
    case "inn": {
      // Reception desk near the top with a wider front so the proprietor reads
      // as the person running the room instead of a sprite glued to the wall.
      const deskRow = 3;
      for (let x = Math.max(1, cx - 2); x <= Math.min(roomW - 2, cx + 2); x++) {
        tiles[deskRow][x] = T_DESK;
      }
      // Fireplace tucked to one side so it doesn't compete with the desk area.
      if (2 < roomW - 1 && 2 < roomH - 1) tiles[2][2] = T_FIREPLACE;
      break;
    }
    case "temple":
      // Altar at top center
      if (2 < roomH - 1) {
        tiles[2][cx] = T_ALTAR;
        if (cx - 1 >= 1) tiles[2][cx - 1] = T_ALTAR;
        if (cx + 1 < roomW - 1) tiles[2][cx + 1] = T_ALTAR;
      }
      break;
    default:
      // House: desk and bookshelf
      if (2 < roomH - 1) tiles[2][cx] = T_DESK;
      if (2 < roomW - 1 && 1 < roomH - 1) tiles[1][2] = T_BOOKSHELF;
      break;
  }
}

// Validate that door and all NPC positions are reachable from the player
// start position. Returns true if valid.
function validateLayout(tiles, roomW, roomH, npcPositions) {
  const doorX = Math.floor(roomW / 2);
  const playerStartX = doorX;
  const playerStartY = roomH - 2;

  const reachable = floodFill(
    tiles,
    roomW,
    roomH,
    playerStartX,
    playerStartY,
    [],
  );

  // Check door is reachable
  if (!reachable.has(`${doorX},${roomH - 1}`)) return false;

  // Check all NPC positions are adjacent to a reachable tile
  for (const npc of npcPositions) {
    let npcReachable = false;
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      if (reachable.has(`${npc.x + dx},${npc.y + dy}`)) {
        npcReachable = true;
        break;
      }
    }
    if (!npcReachable) return false;
  }

  return true;
}

// djb2 hash — same algorithm as server's hashString, using 32-bit wrapping
// to stay within safe JS integer range.
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Generate 1-3 hidden item positions deterministically from the node ID.
// Only places items on walkable floor tiles, avoiding the NPC, door, and
// player start positions.
function generateHiddenItems(nodeId, tiles, roomW, roomH, npcX, npcY) {
  const seed = djb2(nodeId);
  const count = (seed % 3) + 1; // 1-3 items
  const doorX = Math.floor(roomW / 2);
  const playerStartY = roomH - 2;

  // Collect all valid floor tiles
  const floors = [];
  for (let y = 1; y < roomH - 1; y++) {
    for (let x = 1; x < roomW - 1; x++) {
      if (tiles[y][x] !== T_FLOOR) continue;
      if (x === npcX && y === npcY) continue;
      if (x === doorX && y === playerStartY) continue;
      floors.push({ x, y });
    }
  }

  const items = [];
  let s = seed;
  const used = new Set();
  for (let i = 0; i < count && floors.length > 0; i++) {
    s = ((s * 1103515245 + 12345) & 0x7fffffff) >>> 0;
    let idx = s % floors.length;
    // Skip already-used positions
    while (used.has(idx) && used.size < floors.length) {
      idx = (idx + 1) % floors.length;
    }
    if (used.has(idx)) break;
    used.add(idx);
    const pos = floors[idx];
    items.push({ key: nodeId + "_" + i, tileX: pos.x, tileY: pos.y });
  }
  return items;
}

function buildingMusicForTags(tags) {
  const tagSet = new Set(tags || []);
  if (tagSet.has("rest") || tagSet.has("house") || tagSet.has("safehouse")) {
    return { key: "music_inn", loop: false };
  }
  if (tagSet.has("shop") || tagSet.has("commerce")) {
    return { key: "music_shop", loop: true };
  }
  if (tagSet.has("temple") || tagSet.has("revive")) {
    return { key: "music_quest", loop: true };
  }
  return { key: "music_inn", loop: false };
}

const INTERIOR_APPEARANCES = {
  inn: [
    { floor: 0xd8b16a, wall: 0x8e5c33, wood: 0x5c3821, accent: 0xe3c45d },
    { floor: 0xc99b58, wall: 0x744829, wood: 0x4b301f, accent: 0xf0d06b },
    { floor: 0xb9854b, wall: 0x684024, wood: 0x3f291c, accent: 0xd9b45a },
  ],
  shop: [
    { floor: 0xb99a5d, wall: 0x6f4a2a, wood: 0x3f2818, accent: 0xe0c45c },
    { floor: 0xa87948, wall: 0x5d3a24, wood: 0x332013, accent: 0xd6aa4c },
    { floor: 0xc0a06a, wall: 0x7d5130, wood: 0x4b2c1b, accent: 0xf0d77a },
  ],
  temple: [
    { floor: 0xbfc8c1, wall: 0x657071, wood: 0x465154, accent: 0xe2d27a },
    { floor: 0xc8c2af, wall: 0x6e6658, wood: 0x494238, accent: 0xead88d },
    { floor: 0xb8c0c8, wall: 0x59646e, wood: 0x3f4850, accent: 0xded06d },
  ],
  house: [
    { floor: 0xc59a5a, wall: 0x80502e, wood: 0x4a2f1e, accent: 0xd9b85d },
    { floor: 0xb98950, wall: 0x704629, wood: 0x3f291b, accent: 0xe0bf68 },
    { floor: 0xd0a76a, wall: 0x8c5c35, wood: 0x5a3822, accent: 0xf0cc75 },
  ],
};

const DEPTH_ROW = 20;
const DEPTH_BASE = 0;
const DEPTH_TRIM = 2;
const DEPTH_LIGHT = 3;
const DEPTH_PROP = 8;
const DEPTH_ACTOR = 12;
const DEPTH_UI = 1400;

function setPlayerWalkFrame(scene, frame) {
  if (!scene.player) return;
  const selectedFrame = frame;
  scene.walkFrameAudit?.push({
    dir: scene.playerDir,
    frame: selectedFrame,
    frameIndex: scene.hasWalkSheet
      ? walkFrameIndex(scene.playerDir, selectedFrame, scene.leaderClass)
      : null,
    time: scene.time?.now ?? 0,
  });
  if (scene.hasWalkSheet) {
    scene.walkFrame = selectedFrame;
    scene.player.setTexture(
      walkSheetKey(scene.leaderClass),
      walkFrameIndex(scene.playerDir, selectedFrame, scene.leaderClass),
    );
  } else {
    scene.player.setTexture(
      scene.playerFallbackTexture || `player_${scene.playerDir}`,
    );
  }
}

function authoredInteriorAppearance(buildingType, seed) {
  const palettes =
    INTERIOR_APPEARANCES[buildingType] || INTERIOR_APPEARANCES.house;
  return palettes[hashCode(`${buildingType}:${seed}`) % palettes.length];
}

function tintForTile(tile, appearance) {
  if (!appearance) return null;
  if (tile === T_WALL || tile === T_SECRET_WALL || tile === T_LOCKED_DOOR) {
    return appearance.wall;
  }
  if (
    tile === T_FLOOR ||
    tile === T_DOOR ||
    tile === T_STAIR_UP ||
    tile === T_STAIR_DOWN
  ) {
    return appearance.floor;
  }
  if (
    tile === T_ALTAR ||
    tile === T_STATUE ||
    tile === T_PEW ||
    tile === T_CANDLE
  ) {
    return appearance.accent;
  }
  return null;
}

function fallbackOverlayForTile(tile) {
  switch (tile) {
    case T_DOOR:
      return { color: 0xffc107, alpha: 0.95, inset: 4 };
    case T_RUG:
      return { color: 0xc62828, alpha: 0.85, inset: 3 };
    case T_FIREPLACE:
      return { color: 0xff6f00, alpha: 0.9, inset: 3 };
    case T_CANDLE:
      return { color: 0xfff176, alpha: 0.9, inset: 10 };
    case T_STATUE:
      return { color: 0x90a4ae, alpha: 0.8, inset: 4 };
    case T_PEW:
      return { color: 0x6d4c41, alpha: 0.85, inset: 5 };
    case T_CHAIR:
      return { color: 0x795548, alpha: 0.85, inset: 6 };
    case T_STAIR_UP:
      return { kind: "stairs_up" };
    case T_STAIR_DOWN:
      return { kind: "stairs_down" };
    case T_LOCKED_DOOR:
      return { kind: "locked_door" };
    default:
      return null;
  }
}

function canTogglePartyMenu(scene) {
  const topLock = topWorldLock(scene);
  return !topLock || topLock === "shop" || topLock === "party_menu";
}

function isConfirmKey(event) {
  return (
    event?.key === "Enter" ||
    event?.code === "Enter" ||
    event?.key === " " ||
    event?.key === "Space" ||
    event?.key === "Spacebar" ||
    event?.code === "Space"
  );
}

function depthForRow(y, layer = DEPTH_BASE) {
  return y * DEPTH_ROW + layer;
}

function tileDepth(tile, y) {
  switch (tile) {
    case T_RUG:
      return depthForRow(y, DEPTH_TRIM);
    case T_WALL:
    case T_SECRET_WALL:
    case T_FLOOR:
    case T_DOOR:
    case T_STAIR_UP:
    case T_STAIR_DOWN:
    case T_LOCKED_DOOR:
      return depthForRow(y, DEPTH_BASE);
    default:
      return depthForRow(y, DEPTH_PROP);
  }
}

function actorDepth(y) {
  return depthForRow(y, DEPTH_ACTOR);
}

export class TownScene extends Phaser.Scene {
  constructor() {
    super("Town");
  }

  init(data) {
    this._exiting = false;
    this.gameState = data.gameState;
    this.spawn = data.spawn;
    this.floorIndex = data.floorIndex || 0;
    this.playerStart = data.playerStart || null;
    this.entryMessage = data.entryMessage || "";
    this.returnScene = data.returnScene || null;
  }

  preload() {
    this.interiorPresentation = interiorPresentationFromTemplate(
      this.spawn?.interior_template,
      this.floorIndex,
    );
    const presentation = this.interiorPresentation;
    if (
      presentation?.backgroundAsset &&
      !this.textures.exists(presentation.textureKey)
    ) {
      this.load.image(presentation.textureKey, presentation.backgroundAsset);
    }
    preloadInteriorChests(this);
    preloadInteriorProps(this);
  }

  create() {
    const layout = applyGameplayViewport(this);
    this.animating = false;
    initAudio(this);
    this.cameras.main.setBackgroundColor("#000000");

    const tags = this.spawn.tags || [];
    const buildingType = this.spawn.building_type || buildingTypeFromTags(tags);
    this.buildingType = buildingType;
    const interiorSeed =
      this.spawn.interior_seed || hashCode(this.spawn.node_id || "default");
    const template = this.spawn.interior_template || null;
    const authoredInterior = template
      ? buildInteriorFromTemplate(template, this.floorIndex)
      : null;
    this.interiorTemplate = template;
    this.interiorPresentation =
      authoredInterior?.presentation || this.interiorPresentation || null;
    this.interiorAppearance = authoredInteriorAppearance(
      buildingType,
      interiorSeed,
    );

    if (authoredInterior) {
      this.roomW = authoredInterior.roomW;
      this.roomH = authoredInterior.roomH;
      this.tiles = authoredInterior.tiles;
      this.stairsByPosition = authoredInterior.stairsByPosition;
      this.templateChestAnchors = authoredInterior.chestAnchors;
      this.windowAnchors = authoredInterior.windowAnchors;
      this.lightAnchors = authoredInterior.lightAnchors;
      this.currentFloor = authoredInterior.floor;
    } else {
      const dims = roomDimensions(buildingType, interiorSeed, mulberry32);
      this.roomW = dims.w;
      this.roomH = dims.h;
      this.stairsByPosition = new Map();
      this.templateChestAnchors = [];
      this.windowAnchors = [];
      this.lightAnchors = [];
      this.currentFloor = null;
    }

    const { key: musicKey, loop: musicLoop } = buildingMusicForTags(tags);
    playMusic(musicKey, musicLoop);

    let npcPositions;
    if (authoredInterior) {
      npcPositions = this.placeTemplateNPCs(
        buildingType,
        tags,
        interiorSeed,
        authoredInterior.npcAnchors,
      );
    } else {
      const numNpcs = npcCount(buildingType);
      for (let attempt = 0; attempt < 5; attempt++) {
        this.tiles = generateInterior(
          buildingType,
          this.roomW,
          this.roomH,
          interiorSeed + attempt,
        );
        npcPositions = this.placeNPCs(
          buildingType,
          tags,
          numNpcs,
          interiorSeed + attempt,
          this.tiles,
        );
        if (validateLayout(this.tiles, this.roomW, this.roomH, npcPositions)) {
          break;
        }
      }
    }

    // Center the room on screen
    const roomPixelW = this.roomW * RENDERED_TILE;
    const roomPixelH = this.roomH * RENDERED_TILE;
    const roomOffset = centeredPlayfieldOffset(layout, roomPixelW, roomPixelH);
    this.offsetX = roomOffset.x;
    this.offsetY = roomOffset.y;

    // Draw tiles
    this.roomDrawables = [];
    this.roomOverlays = [];
    this.secretHintDrawables = [];
    this.chests = (this.templateChestAnchors || []).map((anchor) => ({
      ...anchor,
      opened: isChestOpen(
        this.gameState?.triggered_flags,
        this.spawn.node_id,
        anchor.id,
      ),
    }));
    this.syncChestTiles();
    this.drawInteriorBackdrop();
    this.drawRoom();
    this.renderChests();
    this.drawLabelBar();

    // Place NPCs
    this.npcs = [];
    for (let i = 0; i < npcPositions.length; i++) {
      const pos = npcPositions[i];
      const sprite =
        pos.sprite ||
        (i === 0
          ? npcSpriteForTags(tags)
          : extraNpcSpritesForTags(tags)[
              (i - 1) % extraNpcSpritesForTags(tags).length
            ]);
      const npcImage = this.add
        .image(
          this.offsetX + pos.x * RENDERED_TILE + RENDERED_TILE / 2,
          this.offsetY + pos.y * RENDERED_TILE + RENDERED_TILE / 2,
          sprite,
        )
        .setDepth(actorDepth(pos.y));
      npcImage.setScale(
        interiorCharacterScale(
          Math.max(npcImage.width || 0, npcImage.height || 0, 1),
        ),
      );
      this.npcs.push({
        x: pos.x,
        y: pos.y,
        role: pos.role || null,
        image: npcImage,
        isProprietor: pos.isProprietor ?? i === 0,
        index: i,
      });
    }

    const entrance = authoredInterior?.entrance || {
      x: Math.floor(this.roomW / 2),
      y: this.roomH - 1,
    };
    const initialPlayerStart =
      this.playerStart ||
      (authoredInterior
        ? {
            x: entrance.x,
            y: entrance.y >= this.roomH - 1 ? entrance.y - 1 : entrance.y,
          }
        : { x: Math.floor(this.roomW / 2), y: this.roomH - 2 });
    this.playerX = initialPlayerStart.x;
    this.playerY = initialPlayerStart.y;
    this.playerDir = "up";
    this.walkFrame = 0;
    const leaderIdx = getLeaderIndex();
    const leader =
      this.gameState?.party?.[leaderIdx] || this.gameState?.party?.[0];
    this.leaderClass = leader?.sprite_id || leader?.class_id || "warrior";
    this.hasWalkSheet = this.textures.exists(walkSheetKey(this.leaderClass));
    this.playerFallbackTexture = this.textures.exists(this.leaderClass)
      ? this.leaderClass
      : `player_${this.playerDir}`;

    const playerPos = walkSpritePosition(
      this.playerX,
      this.playerY,
      RENDERED_TILE,
      this.offsetX,
      this.offsetY,
    );
    if (this.hasWalkSheet) {
      this.player = this.add
        .sprite(
          playerPos.x,
          playerPos.y,
          walkSheetKey(this.leaderClass),
          walkFrameIndex(this.playerDir, 0, this.leaderClass),
        )
        .setOrigin(0.5, 1)
        .setScale(walkSpriteScale(RENDERED_TILE, this.leaderClass))
        .setDepth(actorDepth(this.playerY));
    } else {
      this.player = this.add
        .image(playerPos.x, playerPos.y, this.playerFallbackTexture)
        .setOrigin(0.5, 1)
        .setDepth(actorDepth(this.playerY));
      this.player.setScale(
        this.playerFallbackTexture === this.leaderClass
          ? classPortraitFallbackScale(RENDERED_TILE)
          : fallbackWalkSpriteScale(RENDERED_TILE),
      );
    }

    installEscortFollower(this, RENDERED_TILE);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");
    this.menuOpen = false;
    this.menuGroup = null;
    this._modalLocks = new Set();
    this._skipShopEscapeOnce = false;

    // Hidden items — deterministic positions filtered by already-collected set
    const collected = new Set(
      Object.keys(this.gameState?.collected_hidden_items || {}),
    );
    const primaryNpc = npcPositions[0] || { x: this.playerX, y: this.playerY };
    this.hiddenItems = generateHiddenItems(
      this.spawn.node_id,
      this.tiles,
      this.roomW,
      this.roomH,
      primaryNpc.x,
      primaryNpc.y,
    ).filter((h) => !collected.has(h.key));
    this.nearChest = null;
    this.nearHiddenItem = null;
    this.searchPrompt = null;

    // Interact with NPC
    this.nearNpcIndex = -1;
    this.interactPrompt = null;
    this.input.keyboard.on("keydown", (event) => {
      if (!isConfirmKey(event)) return;
      event?.preventDefault?.();
      if (event?.repeat) return;
      this.interact();
    });
    this.input.keyboard.on("keydown-M", () => {
      if (!canTogglePartyMenu(this)) return;
      toggleMenu(this);
    });

    // ESC to exit
    this.input.keyboard.on("keydown-ESC", () => {
      if (this.menuOpen) {
        this._skipShopEscapeOnce = hasWorldLock(this, "shop");
        toggleMenu(this);
        return;
      }
      if (this.characterDetailGroup) {
        this._skipShopEscapeOnce = hasWorldLock(this, "shop");
        return;
      }
      if (isWorldInputLocked(this)) return;
      if (!this.animating) this.exitToWorld();
    });

    // Touch controls (reuse WorldScene's touch system)
    initTouchControls(this);

    // Message overlay (same pattern as WorldScene)
    this.messageText = this.add
      .text(layout.centerX, layout.messageY, "", {
        fontSize: layout.portrait ? portraitFontSize(this) : "14px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#000000dd",
        padding: { x: 16, y: 12 },
        wordWrap: { width: layout.portrait ? 680 : 500 },
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 10)
      .setScrollFactor(0)
      .setVisible(false);

    if (this.entryMessage) {
      this.showMessage(this.entryMessage);
      this.time.delayedCall(1800, () => this.hideMessage());
    }

    this.drawHelpStrip();
    drawTownObjective(this);

    this.updateInteractionTargets();
    installInteriorCamera(this, roomPixelW, roomPixelH);
    this.interiorMenuHUD = interiorControls(this, () => toggleMenu(this), {
      objective: () => trackedObjective(this),
      openJournal: () => showQuestLog(this),
    });
  }

  // Place NPCs: proprietor at anchor position, extras on walkable floor tiles.
  // tiles array is used to ensure NPCs only land on walkable tiles.
  placeNPCs(buildingType, tags, count, seed, tiles) {
    const positions = [];
    const rng = mulberry32(seed + 999);

    // Proprietor always at the standard position
    const propPos = proprietorPosition(buildingType, this.roomW, this.roomH);
    positions.push(propPos);

    // Extra NPCs on random walkable interior tiles
    const occupied = new Set([`${propPos.x},${propPos.y}`]);
    const doorX = Math.floor(this.roomW / 2);
    const preferredSpacing = minimumNpcSpacing(buildingType);
    // Also block the player start tile and the door
    occupied.add(`${doorX},${this.roomH - 2}`);
    occupied.add(`${doorX},${this.roomH - 1}`);

    const isWellSpaced = (x, y, spacing) =>
      positions.every(
        (pos) => Math.abs(pos.x - x) + Math.abs(pos.y - y) >= spacing,
      );

    const isInnLobbyLane = (x, y) =>
      buildingType === "inn" && Math.abs(x - doorX) <= 2 && y >= this.roomH - 5;

    const tryPlaceNpc = (spacing) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = 1 + Math.floor(rng() * (this.roomW - 2));
        const y = 1 + Math.floor(rng() * (this.roomH - 2));
        const key = `${x},${y}`;
        // Must be on a walkable tile, not occupied, not on bottom two rows,
        // and not crowd existing NPCs.
        if (
          !occupied.has(key) &&
          y < this.roomH - 2 &&
          !isInnLobbyLane(x, y) &&
          TILE_WALKABLE[tiles[y][x]] &&
          isWellSpaced(x, y, spacing)
        ) {
          occupied.add(key);
          positions.push({ x, y });
          return true;
        }
      }
      return false;
    };

    for (let i = 1; i < count; i++) {
      if (tryPlaceNpc(preferredSpacing)) continue;
      if (preferredSpacing > 2 && tryPlaceNpc(2)) continue;
      break;
    }

    return positions;
  }

  placeTemplateNPCs(buildingType, tags, seed, npcAnchors) {
    return (npcAnchors || []).map((anchor, index) => ({
      x: anchor.x,
      y: anchor.y,
      role: anchor.role,
      isProprietor: index === 0,
      sprite:
        anchor.sprite ||
        npcSpriteForRole(anchor.role, buildingType, tags, seed, index),
    }));
  }

  addRoomDrawable(drawable) {
    this.roomDrawables.push(drawable);
    return drawable;
  }

  addOverlayDrawable(drawable) {
    this.roomOverlays.push(drawable);
    return drawable;
  }

  clearDrawables(listName) {
    for (const drawable of this[listName] || []) {
      drawable?.destroy?.();
    }
    this[listName] = [];
  }

  drawInteriorBackdrop() {
    this.backdropDrawables?.forEach((entry) => entry.destroy());
    this.backdropDrawables = [];
    const roomPixelW = this.roomW * RENDERED_TILE;
    const roomPixelH = this.roomH * RENDERED_TILE;
    const centerX = this.offsetX + roomPixelW / 2;
    const centerY = this.offsetY + roomPixelH / 2;
    const shadow = this.add
      .rectangle(
        centerX + 8,
        centerY + 10,
        roomPixelW + 34,
        roomPixelH + 34,
        0x020603,
        0.72,
      )
      .setDepth(DEPTH_BASE - 3);
    const mat = this.add
      .rectangle(
        centerX,
        centerY,
        roomPixelW + 24,
        roomPixelH + 24,
        0x172114,
        1,
      )
      .setDepth(DEPTH_BASE - 2);
    const trim = this.add
      .rectangle(
        centerX,
        centerY,
        roomPixelW + 12,
        roomPixelH + 12,
        0xc19a55,
        1,
      )
      .setDepth(DEPTH_BASE - 1);
    const inner = this.add
      .rectangle(centerX, centerY, roomPixelW + 4, roomPixelH + 4, 0x24170f, 1)
      .setDepth(DEPTH_BASE - 1);
    this.backdropDrawables.push(shadow, mat, trim, inner);

    if (this.hasAuthoredInteriorBackground()) {
      const background = this.add
        .image(this.offsetX, this.offsetY, this.interiorPresentation.textureKey)
        .setOrigin(0)
        .setDisplaySize(roomPixelW, roomPixelH)
        .setDepth(DEPTH_BASE);
      this.backdropDrawables.push(background);
      this.backdropDrawables.push(
        ...drawInteriorForeground(this, (row) => depthForRow(row, DEPTH_PROP)),
        ...drawInteriorProps(this, (row) => depthForRow(row, DEPTH_PROP)),
      );
    }
  }

  hasAuthoredInteriorBackground() {
    const key = this.interiorPresentation?.textureKey;
    return !!key && this.textures.exists(key);
  }

  drawLabelBar() {
    this.labelBar?.forEach((entry) => entry.destroy());
    this.labelBar = [];
    const portrait = this.gameplayLayout.portrait;
    const width = portrait
      ? 560
      : Math.min(420, Math.max(300, this.spawn.name.length * 12 + 90));
    const height = portrait
      ? 104
      : this.interiorTemplate?.floors?.length > 1
        ? 56
        : 40;
    const x = Math.floor((this.gameplayLayout.width - width) / 2);
    const y = 12;
    const depth = DEPTH_UI;
    const frame = Object.values(
      drawPanel(
        this,
        this.gameplayLayout.centerX,
        y + height / 2,
        width,
        height,
        { interactive: false, depth },
      ),
    );
    const corners = [];
    const accent = this.add
      .rectangle(x + 14, y + height / 2, 6, height - 18, 0xd7b45c, 1)
      .setOrigin(0, 0.5)
      .setDepth(depth + 1);
    const title = this.add
      .text(
        this.gameplayLayout.centerX,
        y + (portrait ? 32 : 17),
        this.spawn.name,
        {
          fontSize: portrait ? portraitFontSize(this) : "15px",
          color: "#f5efe0",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        },
      )
      .setOrigin(0.5)
      .setDepth(depth + 2);
    this.labelBar.push(...frame, ...corners, accent, title);
    this.labelBar.forEach((entry) => entry.setScrollFactor(0));

    if (this.interiorTemplate?.floors?.length > 1) {
      this.labelBar.push(
        this.add
          .text(
            this.gameplayLayout.centerX,
            y + (portrait ? 72 : 35),
            `Floor ${this.floorIndex + 1}`,
            {
              fontSize: portrait ? "24px" : "10px",
              color: "#e8d8a8",
              fontFamily: "Arial, sans-serif",
            },
          )
          .setOrigin(0.5)
          .setDepth(depth + 2)
          .setScrollFactor(0),
      );
    }
  }

  drawHelpStrip() {
    this.helpStrip?.panel?.bg?.destroy?.();
    this.helpStrip?.text?.destroy?.();
    if (this.gameplayLayout.portrait) {
      this.helpStrip = null;
      return;
    }
    const panel = drawPanel(
      this,
      this.gameplayLayout.centerX,
      this.gameplayLayout.footerY,
      760,
      this.gameplayLayout.portrait ? 44 : 26,
      {
        fill: 0x09111f,
        fillAlpha: 0.92,
        stroke: 0xc7a458,
        strokeWidth: 2,
        depth: DEPTH_UI,
        interactive: false,
      },
    );
    const text = this.add
      .text(
        this.gameplayLayout.centerX,
        this.gameplayLayout.footerY,
        this.gameplayLayout.portrait
          ? "D-PAD / ARROWS  Move     A / ENTER  Talk     MENU"
          : "Move: Arrows/WASD     Talk: Enter/Space     Menu: M     Exit: Esc",
        {
          fontSize: this.gameplayLayout.portrait ? "22px" : "10px",
          color: "#e8dcc4",
          fontFamily: "Arial, sans-serif",
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 1)
      .setScrollFactor(0);
    this.helpStrip = { panel, text };
  }

  update() {
    syncTownObjectiveVisibility(this);
    if (isWorldInputLocked(this)) return;
    if (this.animating) return;

    let dx = 0,
      dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) dx = 1;
    else if (this.cursors.up.isDown || this.wasd.W.isDown) dy = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) dy = 1;

    if (dx !== 0 || dy !== 0) {
      this.tryMove(dx, dy);
    }
  }

  canWalkTile(tile) {
    return !!TILE_WALKABLE[tile];
  }

  tryMove(dx, dy) {
    if (this.animating || isWorldInputLocked(this)) return;
    const nx = this.playerX + dx;
    const ny = this.playerY + dy;
    if (nx < 0 || nx >= this.roomW || ny < 0 || ny >= this.roomH) return;

    const tile = this.tiles[ny][nx];

    // Walking into any NPC position is blocked
    for (const npc of this.npcs) {
      if (nx === npc.x && ny === npc.y) return;
    }

    if (!TILE_WALKABLE[tile]) return;

    this.playerX = nx;
    this.playerY = ny;

    // Update facing direction. Direction changes reset to frame 0 of the
    // new direction (#127 acceptance criterion 3).
    let dir = this.playerDir;
    if (dx < 0) dir = "left";
    else if (dx > 0) dir = "right";
    else if (dy < 0) dir = "up";
    else if (dy > 0) dir = "down";
    this.playerDir = dir;

    this.player.setDepth(actorDepth(this.playerY));

    const dest = walkSpritePosition(
      nx,
      ny,
      RENDERED_TILE,
      this.offsetX,
      this.offsetY,
    );
    const stepMs = walkStepMs();
    this.animating = true;
    this.walkFrameAudit = [];
    const walk = beginWalkStep(this, (frame) =>
      setPlayerWalkFrame(this, frame),
    );
    const finishStepAnimation = () => {
      walk.complete();
      this.animating = false;
    };
    startWalkMotion(this, dest, stepMs, walk, finishStepAnimation);

    const stair = this.stairsByPosition?.get(`${nx},${ny}`);
    if (stair) {
      this.useStairs(stair);
      return;
    }

    // Check if on door tile -> exit
    if (tile === T_DOOR && this.floorIndex === 0) {
      this.exitToWorld();
      return;
    }

    this.updateInteractionTargets();
  }

  async interact() {
    if (isWorldInputLocked(this)) return;
    // Reserve the interaction before the first await; two confirmations must
    // not issue overlapping NPC requests or leave a second dialogue under a shop.
    pauseWorldFor(this, "interaction");
    try {
      if (await performQuestObjective(this)) return;
      if (await this.openNearbyChest()) return;
      // Hidden item pickup takes priority
      if (this.nearHiddenItem) {
        this.hideSearchPrompt();
        const item = this.nearHiddenItem;
        const result = await collectHiddenItem(
          this.gameState.id,
          this.spawn.node_id,
          item.key,
          this.spawn.tags || [],
        );
        if (result && !result.error) {
          // Remove from local list so it won't trigger again
          this.hiddenItems = this.hiddenItems.filter((h) => h.key !== item.key);
          this.nearHiddenItem = null;
          // Merge updated game state
          Object.assign(this.gameState, result);
          playSFX("sfx_heal");
          this.showMessage(result.message || "Found an item!");
          this.time.delayedCall(1500, () => this.hideMessage());
        }
        return;
      }

      if (this.nearNpcIndex < 0) return;

      this.hideInteractPrompt();

      const npc = this.npcs[this.nearNpcIndex];
      const tags = this.spawn.tags || [];
      const tagSet = new Set(tags);
      const nodeId = npc.isProprietor
        ? this.spawn.node_id
        : this.spawn.node_id + "_npc" + npc.index;
      const interaction = await interactWithNpc(this.gameState.id, nodeId);
      if (interaction?.game_state && !interaction.game_state.error) {
        Object.assign(this.gameState, interaction.game_state);
      }
      const dialogue = interaction?.dialogue || null;

      if (npc.isProprietor) {
        await openDialogue(this, this.spawn, dialogue);

        if (isRestBuilding(tags)) {
          const result = await restAtTown(
            this.gameState.id,
            this.spawn.node_id,
            tags,
          );
          if (result && !result.error) {
            Object.assign(this.gameState, result);
            playSFX("sfx_heal");
            autosaveGame(result.id, "inn_rest").catch((e) =>
              console.error("[Town] autosave failed:", e),
            );
          }
          this.showMessage(
            result?.error ? "Could not rest here." : "HP and spells restored!",
          );
          this.time.delayedCall(1500, () => this.hideMessage());
        } else if (tagSet.has("shop") || tagSet.has("commerce")) {
          openShop(this, this.spawn);
        } else if (tagSet.has("temple") || tagSet.has("revive")) {
          const dead = this.gameState.party.filter((p) => p.hp <= 0);
          if (dead.length > 0) {
            dead.forEach((p) => {
              p.hp = 1;
              p.status = "";
            });
          } else {
            this.gameState.party.forEach((p) => {
              p.hp = p.max_hp;
            });
          }
          playSFX("sfx_heal");
        }
      } else {
        const synthSpawn = { ...this.spawn, node_id: nodeId };
        await openDialogue(this, synthSpawn, dialogue);
      }

      // Re-show talk prompt if still near an NPC
      if (this.nearNpcIndex >= 0) {
        this.showInteractPrompt("Talk");
      }
    } finally {
      resumeWorldFor(this, "interaction");
    }
  }

  handleAction() {
    return this.interact();
  }

  async openNearbyChest() {
    if (!this.nearChest) return false;

    const chest = this.nearChest;
    this.hideInteractPrompt();

    if (chest.opened) {
      playSFX("sfx_error");
      this.showMessage("It's empty.");
      this.time.delayedCall(1200, () => this.hideMessage());
      return true;
    }

    const result = await openChest(
      this.gameState.id,
      this.spawn.node_id,
      chest.id,
    );
    if (result?.error) {
      playSFX("sfx_error");
      this.showMessage(result.error);
      this.time.delayedCall(1400, () => this.hideMessage());
      return true;
    }

    Object.assign(this.gameState, result);

    if (shouldStartBattle(result)) {
      this.animating = true;
      playSFX("sfx_encounter");
      this.showMessage(result.message || "Monster-in-a-box!");
      this.time.delayedCall(500, () => {
        this.scene.start("Battle", {
          gameState: result,
          buildingType: this.buildingType,
          returnScene: {
            sceneKey: "Town",
            spawn: this.spawn,
            floorIndex: this.floorIndex,
            playerStart: { x: this.playerX, y: this.playerY },
          },
        });
      });
      return true;
    }

    playSFX("sfx_treasure");
    this.markChestOpened(chest.id);
    await this.animateChestOpen(chest.id);
    this.showMessage(result.message || "Received treasure!");
    this.time.delayedCall(1800, () => this.hideMessage());
    this.updateInteractionTargets();
    return true;
  }

  showInteractPrompt(action = "Talk") {
    this.hideInteractPrompt();
    const label = this.gameplayLayout.portrait
      ? `Tap A to ${action.toLowerCase()}`
      : isTouchDevice()
        ? `[ TAP A ] ${action}`
        : `[ ENTER / SPACE ] ${action}`;
    this.interactPrompt = this.add
      .text(this.player.x, this.player.y - 25, label, {
        fontSize: this.gameplayLayout.portrait
          ? portraitFontSize(this)
          : "10px",
        color: "#ffff44",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#000000cc",
        padding: { x: 6, y: 3 },
        wordWrap: { width: 700 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 5)
      .setScrollFactor(this.gameplayLayout.portrait ? 0 : 1);
  }

  hideInteractPrompt() {
    if (this.interactPrompt) {
      this.interactPrompt.destroy();
      this.interactPrompt = null;
    }
  }

  showSearchPrompt() {
    this.hideSearchPrompt();
    const label = isTouchDevice() ? "[ TAP A ] ?" : "?";
    this.searchPrompt = this.add
      .text(this.player.x, this.player.y - 25, label, {
        fontSize: "14px",
        color: "#ffff44",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#000000cc",
        padding: { x: 6, y: 3 },
        wordWrap: { width: 700 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 5)
      .setScrollFactor(this.gameplayLayout.portrait ? 0 : 1);
  }

  hideSearchPrompt() {
    if (this.searchPrompt) {
      this.searchPrompt.destroy();
      this.searchPrompt = null;
    }
  }

  async exitToWorld() {
    if (this._exiting) return;
    this._exiting = true;
    this.animating = true;
    let nextState = this.gameState;
    if (this.gameState?.current_location?.kind === "interior") {
      nextState = await transitionLocation(this.gameState.id, "exit-interior");
      if (nextState?.error) {
        this._exiting = false;
        this.animating = false;
        this.showMessage(nextState.error);
        this.time.delayedCall(1800, () => this.hideMessage());
        return;
      }
      this.gameState = nextState;
    }

    playSFX("sfx_door");
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      playMusic("music_overworld");
      if (nextState.current_location?.kind === "settlement") {
        this.scene.start("Settlement", { gameState: nextState });
        return;
      }
      if (this.returnScene?.sceneKey === "Settlement") {
        this.scene.start("Settlement", {
          gameState: this.gameState,
          settlementSpawn: this.returnScene.settlementSpawn,
          playerStart: this.returnScene.playerStart,
        });
        return;
      }
      this.scene.start("World", { gameState: this.gameState });
    });
  }

  showMessage(text) {
    this.messageText.setText(text).setVisible(true);
  }

  hideMessage() {
    this.messageText.setVisible(false);
  }

  useStairs(stair) {
    this.animating = true;
    playSFX("sfx_door");
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.restart({
        gameState: this.gameState,
        spawn: this.spawn,
        floorIndex: stair.to_floor,
        playerStart: { x: stair.to_x, y: stair.to_y },
        returnScene: this.returnScene,
      });
    });
  }

  // Stubs for compatibility with shop overlay (HUD lives in WorldScene)
  updateHUD() {}
  flashSaveIcon() {}

  syncChestTiles() {
    for (const chest of this.chests || []) {
      this.tiles[chest.y][chest.x] = chest.opened
        ? T_CHEST_OPEN
        : T_CHEST_CLOSED;
    }
  }

  renderChests() {
    for (const drawable of this.chestDrawables || []) {
      drawable?.destroy?.();
    }
    this.chestDrawables = [];
    this.chestSprites = new Map();
    this.chestSparkles = new Map();

    for (const chest of this.chests || []) {
      const key = interiorChestKey(this, chest.opened);
      const depth = depthForRow(chest.y, DEPTH_PROP + 1);
      const sprite = this.add
        .image(
          this.offsetX + chest.x * RENDERED_TILE + RENDERED_TILE / 2,
          this.offsetY + chest.y * RENDERED_TILE + RENDERED_TILE / 2,
          key,
        )
        .setDisplaySize(RENDERED_TILE, RENDERED_TILE)
        .setDepth(depth);
      this.chestDrawables.push(sprite);
      this.chestSprites.set(chest.id, sprite);
      if (
        !chest.opened &&
        !this.interiorPresentation?.chestClosedAsset &&
        this.textures.exists("object_chest_sparkle")
      ) {
        const sparkle = this.add
          .image(sprite.x + 8, sprite.y - 10, "object_chest_sparkle")
          .setScale(SCALE)
          .setDepth(depth + 1)
          .setAlpha(0.9);
        this.tweens.add({
          targets: sparkle,
          alpha: 0.25,
          y: sparkle.y - 2,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.InOut",
        });
        this.chestDrawables.push(sparkle);
        this.chestSparkles.set(chest.id, sparkle);
      }
    }
  }

  markChestOpened(chestId) {
    const chest = (this.chests || []).find((entry) => entry.id === chestId);
    if (!chest) return;
    chest.opened = true;
    this.syncChestTiles();
    this.chestSprites?.get(chestId)?.setTexture(interiorChestKey(this, true));
    this.chestSparkles?.get(chestId)?.destroy();
  }

  animateChestOpen(chestId) {
    const sprite = this.chestSprites?.get(chestId);
    if (!sprite) return Promise.resolve();
    return new Promise((resolve) => {
      this.tweens.add({
        targets: sprite,
        y: sprite.y - 5,
        duration: 80,
        yoyo: true,
        ease: "Quad.Out",
        onComplete: resolve,
      });
    });
  }

  updateInteractionTargets() {
    let closestChest = null;
    let closestChestDist = Infinity;
    for (const chest of this.chests || []) {
      const dist =
        Math.abs(this.playerX - chest.x) + Math.abs(this.playerY - chest.y);
      if (dist <= 1 && dist < closestChestDist) {
        closestChest = chest;
        closestChestDist = dist;
      }
    }
    this.nearChest = closestChest;

    let closestNpc = -1;
    let closestNpcDist = Infinity;
    for (let i = 0; i < this.npcs.length; i++) {
      const dist =
        Math.abs(this.playerX - this.npcs[i].x) +
        Math.abs(this.playerY - this.npcs[i].y);
      if (dist <= 2 && dist < closestNpcDist) {
        closestNpc = i;
        closestNpcDist = dist;
      }
    }
    this.nearNpcIndex = closestNpc;

    let closestHidden = null;
    for (const h of this.hiddenItems) {
      const dist =
        Math.abs(this.playerX - h.tileX) + Math.abs(this.playerY - h.tileY);
      if (dist <= 1) {
        closestHidden = h;
        break;
      }
    }
    this.nearHiddenItem = closestHidden;

    const objective = nearbyQuestObjective(this);
    if (objective) {
      this.hideSearchPrompt();
      this.showInteractPrompt(objective.action.prompt);
      return;
    }
    if (this.nearChest) {
      this.hideSearchPrompt();
      this.showInteractPrompt("Open");
      return;
    }
    if (this.nearHiddenItem) {
      this.hideInteractPrompt();
      this.showSearchPrompt();
      return;
    }
    if (this.nearNpcIndex >= 0) {
      this.hideSearchPrompt();
      this.showInteractPrompt("Talk");
      return;
    }
    this.hideInteractPrompt();
    this.hideSearchPrompt();
    this.renderSecretHints();
  }

  drawFloorTrim(x, y) {
    const tile = this.tiles[y][x];
    if (tile !== T_FLOOR && tile !== T_RUG) return;
    const above = y > 0 ? this.tiles[y - 1][x] : null;
    const left = x > 0 ? this.tiles[y][x - 1] : null;
    const right = x < this.roomW - 1 ? this.tiles[y][x + 1] : null;
    const tileX = this.offsetX + x * RENDERED_TILE;
    const tileY = this.offsetY + y * RENDERED_TILE;
    const depth = depthForRow(y, DEPTH_TRIM);

    if (above === T_WALL || above === T_SECRET_WALL) {
      this.addOverlayDrawable(
        this.add
          .rectangle(
            tileX + RENDERED_TILE / 2,
            tileY + 2,
            RENDERED_TILE - 4,
            3,
            0x7f5a2c,
            0.5,
          )
          .setDepth(depth),
      );
    }
    if (left === T_WALL || left === T_SECRET_WALL) {
      this.addOverlayDrawable(
        this.add
          .rectangle(
            tileX + 2,
            tileY + RENDERED_TILE / 2,
            3,
            RENDERED_TILE - 4,
            0x58351c,
            0.35,
          )
          .setDepth(depth),
      );
    }
    if (right === T_WALL || right === T_SECRET_WALL) {
      this.addOverlayDrawable(
        this.add
          .rectangle(
            tileX + RENDERED_TILE - 2,
            tileY + RENDERED_TILE / 2,
            3,
            RENDERED_TILE - 4,
            0x58351c,
            0.35,
          )
          .setDepth(depth),
      );
    }
  }

  drawInteriorObjectDetails(x, y, tile) {
    const tileX = this.offsetX + x * RENDERED_TILE;
    const tileY = this.offsetY + y * RENDERED_TILE;
    const depth = depthForRow(y, DEPTH_PROP + 3);
    const wood = this.interiorAppearance?.wood || 0x4a2f1e;
    const accent = this.interiorAppearance?.accent || 0xd9b85d;
    const dark = 0x1a120d;

    if (tile === T_COUNTER || tile === T_DESK) {
      this.addOverlayDrawable(
        this.add
          .rectangle(
            tileX + RENDERED_TILE / 2,
            tileY + RENDERED_TILE / 2 + 3,
            RENDERED_TILE - 3,
            RENDERED_TILE - 9,
            wood,
            0.95,
          )
          .setDepth(depth),
      );
      this.addOverlayDrawable(
        this.add
          .rectangle(
            tileX + RENDERED_TILE / 2,
            tileY + 9,
            RENDERED_TILE - 5,
            3,
            accent,
            0.75,
          )
          .setDepth(depth + 1),
      );
      return;
    }

    if (tile === T_SHELF || tile === T_BOOKSHELF) {
      this.addOverlayDrawable(
        this.add
          .rectangle(
            tileX + RENDERED_TILE / 2,
            tileY + RENDERED_TILE / 2,
            RENDERED_TILE - 6,
            RENDERED_TILE - 5,
            dark,
            0.9,
          )
          .setDepth(depth),
      );
      for (let row = 0; row < 3; row++) {
        this.addOverlayDrawable(
          this.add
            .rectangle(
              tileX + RENDERED_TILE / 2,
              tileY + 8 + row * 7,
              RENDERED_TILE - 8,
              2,
              accent,
              0.8,
            )
            .setDepth(depth + 1),
        );
      }
      return;
    }

    if (tile === T_CRATE) {
      this.addOverlayDrawable(
        this.add
          .rectangle(
            tileX + RENDERED_TILE / 2,
            tileY + RENDERED_TILE / 2 + 2,
            RENDERED_TILE - 10,
            RENDERED_TILE - 10,
            0x8f642d,
            0.92,
          )
          .setDepth(depth),
      );
      this.addOverlayDrawable(
        this.add
          .rectangle(
            tileX + RENDERED_TILE / 2,
            tileY + RENDERED_TILE / 2 + 2,
            RENDERED_TILE - 12,
            2,
            0xd3a45b,
            0.8,
          )
          .setDepth(depth + 1),
      );
      return;
    }

    if (tile === T_TABLE) {
      this.addOverlayDrawable(
        this.add
          .ellipse(
            tileX + RENDERED_TILE / 2,
            tileY + RENDERED_TILE / 2 + 2,
            RENDERED_TILE - 8,
            RENDERED_TILE - 12,
            wood,
            0.92,
          )
          .setDepth(depth),
      );
    }
  }

  drawWindowDecor() {
    for (const anchor of this.windowAnchors || []) {
      const tileX = this.offsetX + anchor.x * RENDERED_TILE;
      const tileY = this.offsetY + anchor.y * RENDERED_TILE;
      const baseDepth = depthForRow(anchor.y, DEPTH_PROP);
      const textureKey = "tile_window";
      if (this.textures.exists(textureKey)) {
        this.addOverlayDrawable(
          this.add
            .image(tileX, tileY, textureKey)
            .setOrigin(0)
            .setScale(SCALE)
            .setDepth(baseDepth),
        );
      }
      for (let step = 1; step <= 2; step++) {
        const projectionY = tileY + step * RENDERED_TILE - RENDERED_TILE / 3;
        this.addOverlayDrawable(
          this.add
            .rectangle(
              tileX + RENDERED_TILE / 2,
              projectionY,
              RENDERED_TILE + 8 - step * 2,
              RENDERED_TILE - 6,
              0xa9d7ff,
              0.16 - step * 0.04,
            )
            .setDepth(depthForRow(anchor.y + step, DEPTH_LIGHT)),
        );
      }
    }
  }

  collectLightAnchors() {
    const anchors = [...(this.lightAnchors || [])];
    for (let y = 0; y < this.roomH; y++) {
      for (let x = 0; x < this.roomW; x++) {
        const tile = this.tiles[y][x];
        if (tile === T_FIREPLACE) anchors.push({ x, y, kind: "fireplace" });
        if (tile === T_CANDLE) anchors.push({ x, y, kind: "candle" });
      }
    }
    return anchors;
  }

  drawLightSources() {
    for (const anchor of this.collectLightAnchors()) {
      const tileX = this.offsetX + anchor.x * RENDERED_TILE;
      const tileY = this.offsetY + anchor.y * RENDERED_TILE;
      const centerX = tileX + RENDERED_TILE / 2;
      const centerY = tileY + RENDERED_TILE / 2 + 2;
      const isLantern = anchor.kind === "lantern";
      if (isLantern && this.textures.exists("tile_lantern")) {
        this.addOverlayDrawable(
          this.add
            .image(tileX, tileY, "tile_lantern")
            .setOrigin(0)
            .setScale(SCALE)
            .setDepth(depthForRow(anchor.y, DEPTH_PROP + 1)),
        );
      }
      this.addOverlayDrawable(
        this.add
          .ellipse(
            centerX,
            centerY + (isLantern ? 8 : 2),
            isLantern ? RENDERED_TILE * 2.4 : RENDERED_TILE * 2.1,
            isLantern ? RENDERED_TILE * 1.9 : RENDERED_TILE * 1.7,
            0xffc978,
            isLantern ? 0.18 : 0.22,
          )
          .setDepth(depthForRow(anchor.y + 1, DEPTH_LIGHT)),
      );
      this.addOverlayDrawable(
        this.add
          .ellipse(
            centerX,
            centerY + (isLantern ? 8 : 2),
            isLantern ? RENDERED_TILE * 1.4 : RENDERED_TILE * 1.2,
            isLantern ? RENDERED_TILE * 1.2 : RENDERED_TILE * 1.1,
            0xffefb3,
            isLantern ? 0.14 : 0.18,
          )
          .setDepth(depthForRow(anchor.y + 1, DEPTH_LIGHT + 1)),
      );
    }
  }

  renderSecretHints() {
    this.clearDrawables("secretHintDrawables");
    if (!Number.isFinite(this.playerX) || !Number.isFinite(this.playerY)) {
      return;
    }
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const x = this.playerX + dx;
      const y = this.playerY + dy;
      if (x < 0 || x >= this.roomW || y < 0 || y >= this.roomH) continue;
      if (this.tiles[y][x] !== T_SECRET_WALL) continue;
      const tileX = this.offsetX + x * RENDERED_TILE;
      const tileY = this.offsetY + y * RENDERED_TILE;
      if (this.textures.exists("tile_secret_hint")) {
        this.secretHintDrawables.push(
          this.add
            .image(tileX, tileY, "tile_secret_hint")
            .setOrigin(0)
            .setScale(SCALE)
            .setDepth(depthForRow(y, DEPTH_PROP + 2)),
        );
      } else {
        this.secretHintDrawables.push(
          this.add
            .rectangle(
              tileX + RENDERED_TILE / 2,
              tileY + RENDERED_TILE / 2,
              RENDERED_TILE - 8,
              RENDERED_TILE - 8,
              0xdab57a,
              0.18,
            )
            .setDepth(depthForRow(y, DEPTH_PROP + 2)),
        );
      }
    }
  }

  drawRoom() {
    this.clearDrawables("roomDrawables");
    this.clearDrawables("roomOverlays");
    if (
      this.interiorPresentation?.hideTileLayer &&
      this.hasAuthoredInteriorBackground()
    ) {
      this.renderSecretHints();
      return;
    }
    for (let y = 0; y < this.roomH; y++) {
      for (let x = 0; x < this.roomW; x++) {
        const tile = this.tiles[y][x];
        const tileX = this.offsetX + x * RENDERED_TILE;
        const tileY = this.offsetY + y * RENDERED_TILE;
        const textureKey = tileTextureKey(
          tile,
          this.buildingType,
          x,
          y,
          this.spawn.interior_seed || 0,
        );
        const depth = tileDepth(tile, y);
        if (textureKey && this.textures.exists(textureKey)) {
          const image = this.addRoomDrawable(
            this.add
              .image(tileX, tileY, textureKey)
              .setOrigin(0)
              .setScale(SCALE)
              .setDepth(depth),
          );
          const tint = tintForTile(tile, this.interiorAppearance);
          if (tint) {
            image.setTint(tint);
          }
        } else {
          const color = TILE_COLORS[tile] || 0x000000;
          this.addRoomDrawable(
            this.add
              .rectangle(
                tileX + RENDERED_TILE / 2,
                tileY + RENDERED_TILE / 2,
                RENDERED_TILE,
                RENDERED_TILE,
                color,
                1,
              )
              .setDepth(depth),
          );
        }
        this.drawFloorTrim(x, y);

        const overlay = fallbackOverlayForTile(tile);
        if (overlay?.kind === "stairs_up" || overlay?.kind === "stairs_down") {
          const baseY = tileY + RENDERED_TILE - 6;
          for (let step = 0; step < 3; step++) {
            const width = 5 + step * 4;
            const stairY = baseY - step * 5;
            const stairX =
              overlay.kind === "stairs_up"
                ? tileX + 4
                : tileX + RENDERED_TILE - width - 4;
            this.addOverlayDrawable(
              this.add
                .rectangle(
                  stairX + width / 2,
                  stairY + 1.5,
                  width,
                  3,
                  0xffffff,
                  0.55,
                )
                .setDepth(depthForRow(y, DEPTH_PROP + 1)),
            );
          }
        } else if (overlay?.kind === "locked_door") {
          this.addOverlayDrawable(
            this.add
              .rectangle(
                tileX + RENDERED_TILE / 2,
                tileY + RENDERED_TILE / 2,
                RENDERED_TILE - 10,
                RENDERED_TILE - 6,
                0xffca28,
                0.3,
              )
              .setDepth(depthForRow(y, DEPTH_PROP + 1)),
          );
        } else if (overlay) {
          this.addOverlayDrawable(
            this.add
              .rectangle(
                tileX + RENDERED_TILE / 2,
                tileY + RENDERED_TILE / 2,
                RENDERED_TILE - overlay.inset * 2,
                RENDERED_TILE - overlay.inset * 2,
                overlay.color,
                overlay.alpha,
              )
              .setDepth(depthForRow(y, DEPTH_PROP + 1)),
          );
        }
        this.drawInteriorObjectDetails(x, y, tile);
      }
    }
    this.drawWindowDecor();
    this.drawLightSources();
    this.renderSecretHints();
  }
}

// Client-side fallback for building type derivation lives in building_type.js

// Simple string hash for seed fallback (unsigned)
function hashCode(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
