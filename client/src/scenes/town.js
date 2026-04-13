import { playSFX, playMusic } from "../systems/audio.js";
import { collectHiddenItem } from "../api.js";
import { openDialogue } from "./town_dialogue.js";
import { openShop } from "./world_shop.js";
import { isTouchDevice, initTouchControls } from "../systems/input.js";
import {
  nextWalkFrame,
  walkSheetKey,
  walkFrameIndex,
  nextLeaderIndex,
} from "./walkFrame.js";
import { getLeaderIndex } from "./world.js";
import { walkStepMs } from "../systems/prefs.js";
import { isWorldInputLocked } from "../systems/modalLock.js";
import { getNpcDialogue } from "../api.js";

const TILE_SIZE = 16;
const SCALE = 2;
const RENDERED_TILE = TILE_SIZE * SCALE;

// Interior tile IDs (local to this scene)
const T_WALL = 0;
const T_FLOOR = 1;
const T_DOOR = 2;
const T_COUNTER = 3;
const T_SHELF = 4;
const T_BED = 5;
const T_ALTAR = 6;
const T_DESK = 7;
const T_RUG = 8;
const T_FIREPLACE = 9;
const T_CRATE = 10;
const T_CANDLE = 11;
const T_STATUE = 12;
const T_PEW = 13;
const T_BOOKSHELF = 14;
const T_CHAIR = 15;
const T_TABLE = 16;

const TILE_COLORS = {
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

const TILE_WALKABLE = {
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

// Room dimensions by building type
function roomDimensions(buildingType, seed) {
  switch (buildingType) {
    case "inn":
      return { w: 8, h: 8 };
    case "shop":
      return { w: 10, h: 8 };
    case "temple":
      return { w: 12, h: 10 };
    default: {
      // house: random in [8..12] x [6..10]
      const rng = mulberry32(seed);
      const w = 8 + Math.floor(rng() * 5); // 8-12
      const h = 6 + Math.floor(rng() * 5); // 6-10
      return { w, h };
    }
  }
}

// NPC count by building type (2-4 per spec)
function npcCount(buildingType) {
  switch (buildingType) {
    case "inn":
      return 3;
    case "shop":
      return 2;
    case "temple":
      return 4;
    default:
      return 2;
  }
}

// NPC sprite mapping by building tags (proprietor)
function npcSpriteForTags(tags) {
  const tagSet = new Set(tags || []);
  if (tagSet.has("shop") || tagSet.has("commerce")) return "npc_merchant";
  if (tagSet.has("rest")) return "npc_innkeeper";
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
      return { x: cx, y: 1 }; // behind desk
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
  const furnitureCount = Math.floor(interiorArea * 0.2) + 2; // ~20% coverage + 2

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
    case "inn":
      // Desk/reception near top
      if (2 < roomH - 1) tiles[2][cx] = T_DESK;
      // Fireplace on one side
      if (1 < roomW - 1 && 1 < roomH - 1) tiles[1][1] = T_FIREPLACE;
      break;
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
function generateHiddenItems(nodeId, tiles, npcX, npcY) {
  const seed = djb2(nodeId);
  const count = (seed % 3) + 1; // 1-3 items
  const doorX = Math.floor(ROOM_W / 2);
  const playerStartY = ROOM_H - 2;

  // Collect all valid floor tiles
  const floors = [];
  for (let y = 1; y < ROOM_H - 1; y++) {
    for (let x = 1; x < ROOM_W - 1; x++) {
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

    const tags = this.spawn.tags || [];
    const tagSet = new Set(tags);
    const buildingType = this.spawn.building_type || buildingTypeFromTags(tags);
    const interiorSeed =
      this.spawn.interior_seed || hashCode(this.spawn.node_id || "default");

    // Determine room dimensions
    const dims = roomDimensions(buildingType, interiorSeed);
    this.roomW = dims.w;
    this.roomH = dims.h;

    // Pick music
    if (tagSet.has("shop") || tagSet.has("commerce")) {
      playMusic("music_shop");
    } else if (tagSet.has("rest")) {
      playMusic("music_inn", false);
    } else {
      playMusic("music_overworld");
    }

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
    for (let i = 0; i < npcPositions.length; i++) {
      const pos = npcPositions[i];
      const sprite = i === 0 ? npcSpriteForTags(tags) : "npc_elder";
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
    // Also block the player start tile and the door
    occupied.add(`${doorX},${this.roomH - 2}`);
    occupied.add(`${doorX},${this.roomH - 1}`);

    for (let i = 1; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = 1 + Math.floor(rng() * (this.roomW - 2));
        const y = 1 + Math.floor(rng() * (this.roomH - 2));
        const key = `${x},${y}`;
        // Must be on a walkable tile, not occupied, not on bottom two rows
        if (
          !occupied.has(key) &&
          y < this.roomH - 2 &&
          TILE_WALKABLE[tiles[y][x]]
        ) {
          occupied.add(key);
          positions.push({ x, y });
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Fallback: skip this NPC
        break;
      }
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

    if (npc.isProprietor) {
      // Proprietor NPC: special behavior by building type
      if (tagSet.has("shop") || tagSet.has("commerce")) {
        openShop(this, this.spawn);
      } else if (tagSet.has("rest")) {
        this.gameState.party.forEach((p) => {
          if (p.hp > 0) {
            p.hp = p.max_hp;
            p.mp = p.max_mp;
          }
        });
        playSFX("sfx_heal");
        await openDialogue(this, this.spawn);
        this.showMessage("HP and spells restored!");
        this.time.delayedCall(1500, () => this.hideMessage());
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
        await openDialogue(this, this.spawn);
      } else {
        await openDialogue(this, this.spawn);
      }
    } else {
      // Extra NPC: just talk (with sub-NPC dialogue)
      const subNodeId = this.spawn.node_id + "_npc" + npc.index;
      await this.openExtraNpcDialogue(subNodeId);
    }

    // Re-show talk prompt if still near an NPC
    if (this.nearNpcIndex >= 0) {
      this.showInteractPrompt();
    }
  }

  // Fetch and display dialogue for a sub-NPC (non-proprietor)
  async openExtraNpcDialogue(subNodeId) {
    try {
      const resp = await getNpcDialogue(this.gameState.id, subNodeId);
      if (resp && resp.lines && resp.lines.length > 0) {
        // Use the dialogue system with a synthetic spawn
        const synthSpawn = { ...this.spawn, node_id: subNodeId };
        await openDialogue(this, synthSpawn);
      } else {
        await openDialogue(this, this.spawn);
      }
    } catch {
      await openDialogue(this, this.spawn);
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
    this.tileGraphics.clear();
    for (let y = 0; y < this.roomH; y++) {
      for (let x = 0; x < this.roomW; x++) {
        const tile = this.tiles[y][x];
        const color = TILE_COLORS[tile] || 0x000000;
        this.tileGraphics.fillStyle(color, 1);
        this.tileGraphics.fillRect(
          this.offsetX + x * RENDERED_TILE,
          this.offsetY + y * RENDERED_TILE,
          RENDERED_TILE,
          RENDERED_TILE,
        );

        // Add grid lines for visual clarity
        this.tileGraphics.lineStyle(1, 0x000000, 0.15);
        this.tileGraphics.strokeRect(
          this.offsetX + x * RENDERED_TILE,
          this.offsetY + y * RENDERED_TILE,
          RENDERED_TILE,
          RENDERED_TILE,
        );
      }
    }
  }
}

// Client-side fallback for building type derivation (when server doesn't provide it)
function buildingTypeFromTags(tags) {
  const tagSet = new Set(tags || []);
  if (tagSet.has("rest")) return "inn";
  if (tagSet.has("shop") || tagSet.has("commerce")) return "shop";
  if (tagSet.has("temple") || tagSet.has("revive")) return "temple";
  return "house";
}

// Simple string hash for seed fallback (unsigned)
function hashCode(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
