import { playSFX, playMusic } from "../systems/audio.js";
import { openDialogue } from "./town_dialogue.js";
import { openShop } from "./world_shop.js";
import { isTouchDevice, initTouchControls } from "../systems/input.js";
import { nextWalkFrame, walkSheetKey, walkFrameIndex } from "./walkFrame.js";
import { walkStepMs } from "../systems/prefs.js";
import { isWorldInputLocked } from "../systems/modalLock.js";

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

const TILE_COLORS = {
  [T_WALL]: 0x5d4037,
  [T_FLOOR]: 0xbcaaa4,
  [T_DOOR]: 0xffc107,
  [T_COUNTER]: 0x8d6e63,
  [T_SHELF]: 0x6d4c41,
  [T_BED]: 0x7986cb,
  [T_ALTAR]: 0xffd54f,
  [T_DESK]: 0x8d6e63,
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
};

// Room dimensions (tiles)
const ROOM_W = 12;
const ROOM_H = 10;

// NPC sprite mapping by building tags
function npcSpriteForTags(tags) {
  const tagSet = new Set(tags || []);
  if (tagSet.has("shop") || tagSet.has("commerce")) return "npc_merchant";
  if (tagSet.has("rest")) return "npc_innkeeper";
  if (tagSet.has("temple") || tagSet.has("revive")) return "npc_priestess";
  return "npc_elder";
}

// Generate interior layout based on building type
function generateInterior(tags) {
  const tiles = [];
  for (let y = 0; y < ROOM_H; y++) {
    tiles[y] = [];
    for (let x = 0; x < ROOM_W; x++) {
      // Walls on border
      if (y === 0 || y === ROOM_H - 1 || x === 0 || x === ROOM_W - 1) {
        tiles[y][x] = T_WALL;
      } else {
        tiles[y][x] = T_FLOOR;
      }
    }
  }

  // Door at bottom center
  const doorX = Math.floor(ROOM_W / 2);
  tiles[ROOM_H - 1][doorX] = T_DOOR;

  const tagSet = new Set(tags || []);

  if (tagSet.has("shop") || tagSet.has("commerce")) {
    // Shop: counter across the middle
    for (let x = 2; x <= ROOM_W - 3; x++) {
      tiles[4][x] = T_COUNTER;
    }
    // Shelves along top wall
    for (let x = 2; x <= ROOM_W - 3; x += 2) {
      tiles[1][x] = T_SHELF;
    }
  } else if (tagSet.has("rest")) {
    // Inn: beds along walls
    for (let y = 2; y <= 5; y += 2) {
      tiles[y][1] = T_BED;
      tiles[y][ROOM_W - 2] = T_BED;
    }
    // Desk/reception near top
    tiles[2][Math.floor(ROOM_W / 2)] = T_DESK;
  } else if (tagSet.has("temple") || tagSet.has("revive")) {
    // Temple: altar at top center
    tiles[2][Math.floor(ROOM_W / 2)] = T_ALTAR;
    tiles[2][Math.floor(ROOM_W / 2) - 1] = T_ALTAR;
    tiles[2][Math.floor(ROOM_W / 2) + 1] = T_ALTAR;
  } else {
    // Generic building: desk and bookshelf
    tiles[2][Math.floor(ROOM_W / 2)] = T_DESK;
    tiles[1][2] = T_SHELF;
    tiles[1][ROOM_W - 3] = T_SHELF;
  }

  return tiles;
}

// NPC position based on building type (just behind furniture)
function npcPosition(tags) {
  const tagSet = new Set(tags || []);
  if (tagSet.has("shop") || tagSet.has("commerce")) {
    return { x: Math.floor(ROOM_W / 2), y: 3 }; // behind counter
  }
  if (tagSet.has("rest")) {
    return { x: Math.floor(ROOM_W / 2), y: 1 }; // behind desk
  }
  if (tagSet.has("temple") || tagSet.has("revive")) {
    return { x: Math.floor(ROOM_W / 2), y: 1 }; // behind altar
  }
  return { x: Math.floor(ROOM_W / 2), y: 1 }; // behind desk
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

    // Pick music
    if (tagSet.has("shop") || tagSet.has("commerce")) {
      playMusic("music_shop");
    } else if (tagSet.has("rest")) {
      playMusic("music_inn", false);
    } else {
      playMusic("music_overworld");
    }

    // Generate interior
    this.tiles = generateInterior(tags);

    // Center the room on screen
    const roomPixelW = ROOM_W * RENDERED_TILE;
    const roomPixelH = ROOM_H * RENDERED_TILE;
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

    // Place NPC
    const npcPos = npcPosition(tags);
    const npcSprite = npcSpriteForTags(tags);
    this.npc = this.add
      .image(
        this.offsetX + npcPos.x * RENDERED_TILE + RENDERED_TILE / 2,
        this.offsetY + npcPos.y * RENDERED_TILE + RENDERED_TILE / 2,
        npcSprite,
      )
      .setScale(SCALE)
      .setDepth(10);
    this.npcTileX = npcPos.x;
    this.npcTileY = npcPos.y;

    // Player starts near door
    const doorX = Math.floor(ROOM_W / 2);
    this.playerX = doorX;
    this.playerY = ROOM_H - 2; // one tile above door
    this.playerDir = "up";
    this.walkFrame = 0;
    this.leaderClass =
      this.gameState?.party?.[0]?.sprite_id ||
      this.gameState?.party?.[0]?.class_id ||
      "warrior";
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

    // Interact with NPC
    this.nearNpc = false;
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
    if (nx < 0 || nx >= ROOM_W || ny < 0 || ny >= ROOM_H) return;

    const tile = this.tiles[ny][nx];

    // Walking into NPC position is blocked
    if (nx === this.npcTileX && ny === this.npcTileY) return;

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

    // Check proximity to NPC
    const distToNpc =
      Math.abs(this.playerX - this.npcTileX) +
      Math.abs(this.playerY - this.npcTileY);
    if (distToNpc <= 2) {
      if (!this.nearNpc) {
        this.nearNpc = true;
        this.showInteractPrompt();
      }
    } else if (this.nearNpc) {
      this.nearNpc = false;
      this.hideInteractPrompt();
    }
  }

  async interact() {
    if (isWorldInputLocked(this)) return;
    if (!this.nearNpc) return;

    this.hideInteractPrompt();

    const tags = this.spawn.tags || [];
    const tagSet = new Set(tags);

    if (tagSet.has("shop") || tagSet.has("commerce")) {
      // Shop NPC opens the shop UI
      openShop(this, this.spawn);
    } else if (tagSet.has("rest")) {
      // Inn NPC restores party HP
      this.gameState.party.forEach((p) => {
        if (p.hp > 0) p.hp = p.max_hp;
      });
      playSFX("sfx_heal");
      await openDialogue(this, this.spawn);
      this.showMessage("HP and spells restored!");
      this.time.delayedCall(1500, () => this.hideMessage());
    } else if (tagSet.has("temple") || tagSet.has("revive")) {
      // Temple NPC heals or revives
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
      // Generic NPC just talks
      await openDialogue(this, this.spawn);
    }

    // Re-show talk prompt if still near NPC
    if (this.nearNpc) {
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
    for (let y = 0; y < ROOM_H; y++) {
      for (let x = 0; x < ROOM_W; x++) {
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
