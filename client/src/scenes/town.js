import { initAudio, playSFX, playMusic } from "../systems/audio.js";
import {
  autosaveGame,
  collectHiddenItem,
  interactWithNpc,
  restAtTown,
} from "../api.js";
import { openDialogue } from "./town_dialogue.js";
import { openShop } from "./world_shop.js";
import { isTouchDevice, initTouchControls } from "../systems/input.js";
import {
  nextWalkFrame,
  walkSheetKey,
  walkFrameIndex,
} from "./walkFrame.js";
import { getLeaderIndex } from "./world.js";
import { buildingTypeFromTags, isRestBuilding } from "./building_type.js";
import {
  extraNpcSpritesForTags,
  furnitureDensity,
  minimumNpcSpacing,
  RENDERED_TILE,
  roomDimensions,
  SCALE,
  T_ALTAR,
  T_BED,
  T_BOOKSHELF,
  T_CANDLE,
  T_CHAIR,
  T_COUNTER,
  T_CRATE,
  T_DESK,
  T_DOOR,
  T_FIREPLACE,
  T_FLOOR,
  T_PEW,
  T_RUG,
  T_SHELF,
  T_STATUE,
  T_TABLE,
  T_WALL,
  TILE_COLORS,
  TILE_WALKABLE,
  tileTextureKey,
} from "./town_layout.js";
import { walkStepMs } from "../systems/prefs.js";
import { isWorldInputLocked } from "../systems/modalLock.js";

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
  if (tagSet.has("rest")) return "npc_innkeeper";
  if (tagSet.has("heal")) return "npc_priestess";
  if (tagSet.has("shop") || tagSet.has("commerce")) return "npc_merchant";
  if (tagSet.has("temple") || tagSet.has("revive")) return "npc_priestess";
  return "npc_elder";
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
    default:
      return null;
  }
}

export class TownScene extends Phaser.Scene {
  constructor() {
    super("Town");
  }

  init(data) {
    this.gameState = data.gameState;
    this.spawn = data.spawn;
  }

  create() {
    this.animating = false;
    initAudio(this);
    this.cameras.main.setBackgroundColor("#000000");

    const tags = this.spawn.tags || [];
    const buildingType = this.spawn.building_type || buildingTypeFromTags(tags);
    this.buildingType = buildingType;
    const interiorSeed =
      this.spawn.interior_seed || hashCode(this.spawn.node_id || "default");

    // Determine room dimensions
    const dims = roomDimensions(buildingType, interiorSeed, mulberry32);
    this.roomW = dims.w;
    this.roomH = dims.h;

    const { key: musicKey, loop: musicLoop } = buildingMusicForTags(tags);
    playMusic(musicKey, musicLoop);

    // Generate interior first, then place NPCs on walkable tiles
    const numNpcs = npcCount(buildingType);
    let tiles;
    let npcPositions;
    for (let attempt = 0; attempt < 5; attempt++) {
      tiles = generateInterior(
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
        tiles,
      );
      if (validateLayout(tiles, this.roomW, this.roomH, npcPositions)) break;
    }
    this.tiles = tiles;

    // Center the room on screen
    const roomPixelW = this.roomW * RENDERED_TILE;
    const roomPixelH = this.roomH * RENDERED_TILE;
    this.offsetX = Math.floor((800 - roomPixelW) / 2);
    this.offsetY = Math.floor((600 - roomPixelH) / 2);

    // Draw tiles
    this.tileLayer = this.add.container(0, 0);
    this.tileGraphics = this.add.graphics();
    this.drawRoom();

    // Location name
    this.add
      .text(400, this.offsetY - 20, this.spawn.name, {
        fontSize: "16px",
        color: "#ffff44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setDepth(5);

    // Place NPCs
    this.npcs = [];
    const extraNpcSprites = extraNpcSpritesForTags(tags);
    for (let i = 0; i < npcPositions.length; i++) {
      const pos = npcPositions[i];
      const sprite =
        i === 0
          ? npcSpriteForTags(tags)
          : extraNpcSprites[(i - 1) % extraNpcSprites.length];
      const npcImage = this.add
        .image(
          this.offsetX + pos.x * RENDERED_TILE + RENDERED_TILE / 2,
          this.offsetY + pos.y * RENDERED_TILE + RENDERED_TILE / 2,
          sprite,
        )
        .setScale(SCALE)
        .setDepth(10);
      this.npcs.push({
        x: pos.x,
        y: pos.y,
        image: npcImage,
        isProprietor: i === 0,
        index: i,
      });
    }

    // Player starts near door
    const doorX = Math.floor(this.roomW / 2);
    this.playerX = doorX;
    this.playerY = this.roomH - 2;
    this.playerDir = "up";
    this.walkFrame = 0;
    const leaderIdx = getLeaderIndex();
    const leader =
      this.gameState?.party?.[leaderIdx] || this.gameState?.party?.[0];
    this.leaderClass = leader?.sprite_id || leader?.class_id || "warrior";
    this.hasWalkSheet = this.textures.exists(walkSheetKey(this.leaderClass));

    const playerCx =
      this.offsetX + this.playerX * RENDERED_TILE + RENDERED_TILE / 2;
    const playerCy =
      this.offsetY + this.playerY * RENDERED_TILE + RENDERED_TILE / 2;
    if (this.hasWalkSheet) {
      this.player = this.add
        .sprite(
          playerCx,
          playerCy,
          walkSheetKey(this.leaderClass),
          walkFrameIndex(this.playerDir, 0),
        )
        .setScale((RENDERED_TILE / 128) * SCALE)
        .setDepth(10);
    } else {
      this.player = this.add
        .image(playerCx, playerCy, `player_${this.playerDir}`)
        .setScale(SCALE)
        .setDepth(10);
    }

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");
    this.lastMoveTime = 0;
    this.moveCooldown = 150;

    // Hidden items — deterministic positions filtered by already-collected set
    const collected = new Set(
      Object.keys(this.gameState?.collected_hidden_items || {}),
    );
    this.hiddenItems = generateHiddenItems(
      this.spawn.node_id,
      this.tiles,
      this.roomW,
      this.roomH,
      this.npcTileX,
      this.npcTileY,
    ).filter((h) => !collected.has(h.key));
    this.nearHiddenItem = null;
    this.searchPrompt = null;

    // Interact with NPC
    this.nearNpcIndex = -1;
    this.interactPrompt = null;
    this.input.keyboard.on("keydown-ENTER", () => this.interact());
    this.input.keyboard.on("keydown-SPACE", () => this.interact());

    // ESC to exit
    this.input.keyboard.on("keydown-ESC", () => {
      if (!this.animating) this.exitToWorld();
    });

    // Touch controls (reuse WorldScene's touch system)
    initTouchControls(this);

    // Message overlay (same pattern as WorldScene)
    this.messageText = this.add
      .text(400, 300, "", {
        fontSize: "14px",
        color: "#ffffff",
        fontFamily: "monospace",
        backgroundColor: "#000000dd",
        padding: { x: 16, y: 12 },
        wordWrap: { width: 500 },
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    // Instructions
    this.add
      .text(400, 590, "Arrow keys: move | ENTER/SPACE: talk | ESC: exit", {
        fontSize: "10px",
        color: "#666666",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setDepth(5);
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

  update(time) {
    if (isWorldInputLocked(this)) return;
    if (time - this.lastMoveTime < this.moveCooldown) return;

    let dx = 0,
      dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) dx = 1;
    else if (this.cursors.up.isDown || this.wasd.W.isDown) dy = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) dy = 1;

    if (dx !== 0 || dy !== 0) {
      this.tryMove(dx, dy);
      this.lastMoveTime = time;
    }
  }

  canWalkTile(tile) {
    return !!TILE_WALKABLE[tile];
  }

  tryMove(dx, dy) {
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
    const dirChanged = dir !== this.playerDir;
    this.playerDir = dir;

    if (this.hasWalkSheet) {
      this.walkFrame = dirChanged ? 0 : nextWalkFrame(this.walkFrame);
      this.player.setTexture(
        walkSheetKey(this.leaderClass),
        walkFrameIndex(this.playerDir, this.walkFrame),
      );
    } else {
      this.player.setTexture(`player_${this.playerDir}`);
    }

    this.tweens.add({
      targets: this.player,
      x: this.offsetX + nx * RENDERED_TILE + RENDERED_TILE / 2,
      y: this.offsetY + ny * RENDERED_TILE + RENDERED_TILE / 2,
      duration: walkStepMs(),
      ease: "Linear",
    });

    // Check if on door tile -> exit
    if (tile === T_DOOR) {
      this.exitToWorld();
      return;
    }

    // Check proximity to nearest NPC
    let closestIdx = -1;
    let closestDist = Infinity;
    for (let i = 0; i < this.npcs.length; i++) {
      const dist =
        Math.abs(this.playerX - this.npcs[i].x) +
        Math.abs(this.playerY - this.npcs[i].y);
      if (dist <= 2 && dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    if (closestIdx >= 0) {
      if (this.nearNpcIndex !== closestIdx) {
        this.nearNpcIndex = closestIdx;
        this.showInteractPrompt();
      }
    } else if (this.nearNpcIndex >= 0) {
      this.nearNpcIndex = -1;
      this.hideInteractPrompt();
    }

    // Check proximity to hidden items (Manhattan distance <= 1)
    let closestHidden = null;
    for (const h of this.hiddenItems) {
      const dist =
        Math.abs(this.playerX - h.tileX) + Math.abs(this.playerY - h.tileY);
      if (dist <= 1) {
        closestHidden = h;
        break;
      }
    }
    if (closestHidden) {
      if (this.nearHiddenItem !== closestHidden) {
        this.nearHiddenItem = closestHidden;
        this.showSearchPrompt();
      }
    } else if (this.nearHiddenItem) {
      this.nearHiddenItem = null;
      this.hideSearchPrompt();
    }
  }

  async interact() {
    if (isWorldInputLocked(this)) return;
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
      this.showInteractPrompt();
    }
  }

  showInteractPrompt() {
    this.hideInteractPrompt();
    const label = isTouchDevice() ? "[ TAP A ] Talk" : "[ ENTER / SPACE ] Talk";
    this.interactPrompt = this.add
      .text(this.player.x, this.player.y - 25, label, {
        fontSize: "10px",
        color: "#ffff44",
        fontFamily: "monospace",
        backgroundColor: "#000000cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(15);
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
        fontFamily: "monospace",
        backgroundColor: "#000000cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(15);
  }

  hideSearchPrompt() {
    if (this.searchPrompt) {
      this.searchPrompt.destroy();
      this.searchPrompt = null;
    }
  }

  exitToWorld() {
    this.animating = true;
    playSFX("sfx_door");
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      playMusic("music_overworld");
      this.scene.start("World", { gameState: this.gameState });
    });
  }

  showMessage(text) {
    this.messageText.setText(text).setVisible(true);
  }

  hideMessage() {
    this.messageText.setVisible(false);
  }

  // Stubs for compatibility with shop overlay (HUD lives in WorldScene)
  updateHUD() {}
  flashSaveIcon() {}

  drawRoom() {
    if (this.tileLayer) {
      this.tileLayer.removeAll(true);
    }
    this.tileGraphics.clear();
    for (let y = 0; y < this.roomH; y++) {
      for (let x = 0; x < this.roomW; x++) {
        const tile = this.tiles[y][x];
        const tileX = this.offsetX + x * RENDERED_TILE;
        const tileY = this.offsetY + y * RENDERED_TILE;
        const textureKey = tileTextureKey(tile, this.buildingType);
        if (textureKey && this.textures.exists(textureKey)) {
          this.tileLayer.add(
            this.add
              .image(tileX, tileY, textureKey)
              .setOrigin(0)
              .setScale(SCALE),
          );
        } else {
          const color = TILE_COLORS[tile] || 0x000000;
          this.tileGraphics.fillStyle(color, 1);
          this.tileGraphics.fillRect(
            tileX,
            tileY,
            RENDERED_TILE,
            RENDERED_TILE,
          );
        }

        const overlay = fallbackOverlayForTile(tile);
        if (overlay) {
          this.tileGraphics.fillStyle(overlay.color, overlay.alpha);
          this.tileGraphics.fillRect(
            tileX + overlay.inset,
            tileY + overlay.inset,
            RENDERED_TILE - overlay.inset * 2,
            RENDERED_TILE - overlay.inset * 2,
          );
        }
      }
    }
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
