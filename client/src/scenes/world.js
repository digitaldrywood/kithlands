import { gameAction, autosaveGame, promoteParty } from "../api.js";
import {
  initAudio,
  playMusic,
  playSFX,
  toggleMute,
  isMuted,
} from "../systems/audio.js";
import {
  getAutosaveEnabled,
  getAutosaveInterval,
  walkStepMs,
} from "../systems/prefs.js";
import { toggleMenu } from "./world_menu.js";
import { toggleCodex } from "./world_codex.js";
import { toggleDebugPanel, closeDebugPanel } from "./debug_panel.js";
import {
  interactWithDoor,
  showWorldMap,
  showInteractPrompt,
  hideInteractPrompt,
} from "./world_interact.js";
import { shouldStartBattle } from "./encounterFlow.js";
import { initTouchControls } from "../systems/input.js";
import {
  nextWalkFrame,
  walkSheetKey,
  walkFrameIndex,
  nextLeaderIndex,
} from "./walkFrame.js";
import { isWorldInputLocked } from "../systems/modalLock.js";
import { encounterChanceForStep } from "./worldEncounter.js";

const ENEMY_SPRITES = {
  Slime: "monster_slime",
  Goblin: "monster_goblin",
  Wolf: "monster_wolf",
  Skeleton: "monster_skeleton",
  "Dark Knight": "monster_dark_knight",
};

// Tile colors for programmatic rendering
const TILE_COLORS = {
  0: 0x4caf50, // grass
  1: 0xd2b48c, // path
  2: 0x2196f3, // water
  3: 0x2e7d32, // tree
  4: 0x795548, // building
  5: 0xffc107, // door
  6: 0xbcaaa4, // floor
  7: 0x9e9e9e, // rock
  8: 0x66bb6a, // bush
  9: 0x388e3c, // dark grass
  10: 0x1b5e20, // forest (darker)
  11: 0x8d6e63, // hill
  12: 0xffe082, // sand
};

// Sprite keys for overworld tile types. Ids 4/5/6 (building/door/floor) intentionally
// omitted — they still render via TILE_COLORS fillRect in drawMap(). See issue #73.
const TILE_SPRITE_KEYS = {
  0: "tile_grass",
  1: "tile_path",
  2: "tile_water",
  3: "tile_tree",
  7: "tile_rock",
  8: "tile_bush",
  9: "tile_dark_grass",
  10: "tile_forest",
  11: "tile_hill",
  12: "tile_sand",
};

const TILE_WALKABLE = {
  0: true, // grass
  1: true, // path
  2: false, // water
  3: false, // tree
  4: false, // building
  5: true, // door
  6: true, // floor
  7: false, // rock
  8: false, // bush
  9: true, // dark grass
  10: false, // forest
  11: false, // hill
  12: true, // sand
};

// Tiles unlocked by water transport (T3+)
const WATER_TILES = { 2: true };
// Tiles unlocked by flying transport (T5)
const FLY_TILES = { 2: true, 3: true, 7: true, 8: true, 10: true, 11: true };

// Vehicle indicator colors by tier
const VEHICLE_COLORS = {
  T1: null, // no indicator for walking
  T2: 0x8b4513, // brown (horse)
  T3: 0x1e90ff, // blue (sailing ship)
  T4: 0x191970, // dark blue (war galleon)
  T5: 0xf0f0ff, // white (airship)
};

const TILE_SIZE = 16;
const SCALE = 2;
const RENDERED_TILE = TILE_SIZE * SCALE;

// Cache tilemap and player position across scene restarts
let cachedTileMap = null;
let cachedPlayerX = null;
let cachedPlayerY = null;
let cachedPlayerDir = "down";
let cachedLeaderIndex = 0;

export function getLeaderIndex() {
  return cachedLeaderIndex;
}
export function setLeaderIndex(i) {
  cachedLeaderIndex = i;
}

export class WorldScene extends Phaser.Scene {
  constructor() {
    super("World");
  }

  init(data) {
    this.gameState = data.gameState;
    // Cache tilemap from initial game creation
    if (this.gameState.tilemap) {
      cachedTileMap = this.gameState.tilemap;
    }
    console.log(
      "[World] init, phase:",
      this.gameState?.phase,
      "tilemap cached:",
      !!cachedTileMap,
    );
  }

  create() {
    this.stepCount = 0;
    this.animating = false;
    this.gameOver = false;

    initAudio(this);
    playMusic("music_overworld");

    const gs = this.gameState;

    // Handle non-world phases
    if (gs.phase === "victory") {
      this.gameOver = true;
      this.showEndScreen("VICTORY!", `${gs.location} is saved!`, "#ffff44", gs);
      return;
    }
    if (gs.phase === "defeat") {
      this.gameOver = true;
      this.showEndScreen("DEFEAT", "Your party has fallen.", "#ff4444", gs);
      return;
    }
    if (gs.phase === "combat") {
      console.log("[World] redirecting to Battle");
      this.scene.start("Battle", { gameState: gs });
      return;
    }
    if (gs.phase === "promotion") {
      // Draw a minimal map backdrop so the modal has context, then show the
      // promotion prompt. The player must accept or skip before gameplay
      // resumes.
      this.showPromotionPrompt(gs);
      return;
    }

    const tm = cachedTileMap;
    if (!tm) {
      console.error("[World] no tilemap available");
      this.add
        .text(400, 300, "Error: no tilemap. Try restarting the game.", {
          fontSize: "14px",
          color: "#ff4444",
          fontFamily: "monospace",
        })
        .setOrigin(0.5);
      return;
    }

    this.tileData = tm.tiles;
    this.mapW = tm.width;
    this.mapH = tm.height;
    // Restore cached position or use tilemap default
    this.playerX = cachedPlayerX !== null ? cachedPlayerX : tm.player_x;
    this.playerY = cachedPlayerY !== null ? cachedPlayerY : tm.player_y;
    this.spawns = tm.spawns || [];

    // World bounds
    const worldW = this.mapW * RENDERED_TILE;
    const worldH = this.mapH * RENDERED_TILE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Draw tilemap
    this.tileGraphics = this.add.graphics();
    this.drawMap();

    // Location labels
    this.drawLabels();

    // Player sprite (directional, restore cached direction). When the party
    // leader's class has a walk sprite sheet loaded (#127) we use it for the
    // per-step 4-frame cycle, otherwise fall back to the static player_{dir}
    // image.
    this.playerDir = cachedPlayerDir;
    this.walkFrame = 0;
    // Validate cached leader index: clamp to party size and skip dead members
    if (cachedLeaderIndex >= (gs?.party?.length || 1)) cachedLeaderIndex = 0;
    if (gs?.party?.[cachedLeaderIndex]?.hp <= 0) {
      cachedLeaderIndex = nextLeaderIndex(
        gs.party,
        cachedLeaderIndex - 1 < 0 ? gs.party.length - 1 : cachedLeaderIndex - 1,
      );
    }
    const leader = gs?.party?.[cachedLeaderIndex] || gs?.party?.[0];
    this.leaderClass = leader?.sprite_id || leader?.class_id || "warrior";
    this.hasWalkSheet = this.textures.exists(walkSheetKey(this.leaderClass));

    const playerCx = this.playerX * RENDERED_TILE + RENDERED_TILE / 2;
    const playerCy = this.playerY * RENDERED_TILE + RENDERED_TILE / 2;
    if (this.hasWalkSheet) {
      this.player = this.add
        .sprite(
          playerCx,
          playerCy,
          walkSheetKey(this.leaderClass),
          walkFrameIndex(this.playerDir, 0),
        )
        .setDepth(10)
        .setScale((RENDERED_TILE / 128) * SCALE);
    } else {
      this.player = this.add
        .image(playerCx, playerCy, `player_${this.playerDir}`)
        .setDepth(10)
        .setScale(
          (RENDERED_TILE /
            Math.max(
              this.textures.get(`player_${this.playerDir}`).getSourceImage()
                .width,
              1,
            )) *
            SCALE,
        );
    }

    // Vehicle indicator circle behind player (T2+)
    this.vehicleIndicator = null;
    this.updateVehicleIndicator();

    // Camera follows player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");
    this.menuOpen = false;
    this.menuGroup = null;
    // Fresh modal lock set per scene instance — survives Battle -> World
    // restarts cleanly because Phaser rebuilds the scene on scene.start().
    this._modalLocks = new Set();

    // M key opens menu, H opens codex
    this.input.keyboard.on("keydown-M", () => toggleMenu(this));
    this.input.keyboard.on("keydown-H", () => toggleCodex(this));
    this.input.keyboard.on("keydown-ESC", () => {
      if (this.debugPanelOpen) closeDebugPanel(this);
      else if (this.codexOpen) toggleCodex(this);
      else if (this.menuOpen) toggleMenu(this);
    });

    // Dev-only debug panel (#145). Vite tree-shakes the branch out of
    // production builds because import.meta.env.DEV is a compile-time
    // constant there.
    if (import.meta.env && import.meta.env.DEV) {
      this.input.keyboard.on("keydown-BACKTICK", () => toggleDebugPanel(this));
    }
    this.codexOpen = false;
    this.codexGroup = null;

    // Enter to interact with doors, Space to interact OR cycle leader
    this.currentDoorSpawn = null;
    this.interactPrompt = null;
    this.input.keyboard.on("keydown-ENTER", () => interactWithDoor(this));
    this.input.keyboard.on("keydown-SPACE", () => {
      if (this.currentDoorSpawn) {
        interactWithDoor(this);
        return;
      }
      if (this.animating || this.menuOpen || this.gameOver) return;
      const party = this.gameState?.party;
      if (!party || party.length <= 1) return;
      const next = nextLeaderIndex(party, cachedLeaderIndex);
      if (next === cachedLeaderIndex) return;
      cachedLeaderIndex = next;
      const member = party[cachedLeaderIndex];
      this.leaderClass = member.sprite_id || member.class_id || "warrior";
      this.hasWalkSheet = this.textures.exists(walkSheetKey(this.leaderClass));
      if (this.hasWalkSheet) {
        this.walkFrame = 0;
        this.player.setTexture(
          walkSheetKey(this.leaderClass),
          walkFrameIndex(this.playerDir, 0),
        );
      } else {
        this.player.setTexture(`player_${this.playerDir}`);
      }
      playSFX("sfx_cursor");
      this.updateHUD();
    });

    // TAB for world map
    this.input.keyboard.on("keydown-TAB", (e) => {
      e.preventDefault();
      showWorldMap(this);
    });

    // Touch controls (D-pad, tap-to-move with pathfinding, pinch-to-zoom, swipe gestures)
    initTouchControls(this);

    // HUD — two-line footer: party on top, resources/transport below.
    // Single-line layout overflowed viewport with 4-member parties (#issue screenshot).
    this.add
      .rectangle(400, 580, 800, 40, 0x000000, 0.8)
      .setScrollFactor(0)
      .setDepth(20);
    this.hudText = this.add
      .text(10, 564, "", {
        fontSize: "12px",
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(21);
    this.hudFooter = this.add
      .text(10, 582, "", {
        fontSize: "12px",
        color: "#ffcc66",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(21);
    this.updateHUD();

    // Quest indicator
    this.questText = this.add
      .text(10, 5, "", {
        fontSize: "11px",
        color: "#ffff44",
        fontFamily: "monospace",
        backgroundColor: "#00000099",
        padding: { x: 4, y: 2 },
      })
      .setScrollFactor(0)
      .setDepth(21);
    this.updateQuestDisplay();

    // Message overlay
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
      .setScrollFactor(0)
      .setDepth(30)
      .setVisible(false);

    // Show any pending message from last action (quest complete, level up, etc.)
    if (gs.message) {
      this.showMessage(gs.message);
      this.time.delayedCall(3000, () => this.hideMessage());
    }
    if (gs.combat_log) {
      for (const line of gs.combat_log) {
        if (
          line.includes("leveled up") ||
          line.includes("Victory") ||
          line.includes("Quest complete")
        ) {
          this.showMessage(line);
          this.time.delayedCall(3000, () => this.hideMessage());
        }
      }
    }

    // Minimap
    this.drawMinimap();

    // HUD buttons
    const muteBtn = this.add
      .text(620, 575, isMuted() ? "[unmute]" : "[mute]", {
        fontSize: "12px",
        color: "#666666",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    muteBtn.on("pointerdown", () => {
      const m = toggleMute();
      muteBtn.setText(m ? "[unmute]" : "[mute]");
    });

    const codexBtn = this.add
      .text(690, 575, "[H]elp", {
        fontSize: "12px",
        color: "#8888ff",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    codexBtn.on("pointerdown", () => toggleCodex(this));

    const menuBtn = this.add
      .text(760, 575, "[M]enu", {
        fontSize: "12px",
        color: "#ffcc44",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => toggleMenu(this));

    this.lastMoveTime = 0;
    this.moveCooldown = 150;

    // Autosave timer
    this.autosaveTimer = null;
    this.startAutosaveTimer();

    // Autosave icon (hidden by default)
    this.saveIcon = this.add
      .text(620, 10, "", {
        fontSize: "10px",
        color: "#44ccff",
        fontFamily: "monospace",
        backgroundColor: "#00000099",
        padding: { x: 4, y: 2 },
      })
      .setScrollFactor(0)
      .setDepth(21)
      .setAlpha(0);

    console.log("[World] created, player at", this.playerX, this.playerY);
  }

  startAutosaveTimer() {
    this.stopAutosaveTimer();
    if (!getAutosaveEnabled()) return;
    const interval = getAutosaveInterval();
    this.autosaveTimer = this.time.addEvent({
      delay: interval,
      loop: true,
      callback: () => this.triggerAutosave("timed"),
    });
  }

  stopAutosaveTimer() {
    if (this.autosaveTimer) {
      this.autosaveTimer.remove(false);
      this.autosaveTimer = null;
    }
  }

  async triggerAutosave(triggerEvent) {
    if (!getAutosaveEnabled()) return;
    if (!this.gameState?.id) return;
    try {
      await autosaveGame(this.gameState.id, triggerEvent);
      this.flashSaveIcon();
    } catch (e) {
      console.error("[World] autosave failed:", e);
    }
  }

  flashSaveIcon() {
    if (!this.saveIcon) return;
    this.saveIcon.setText("[SAVED]").setAlpha(1);
    this.tweens.add({
      targets: this.saveIcon,
      alpha: 0,
      duration: 1500,
      delay: 500,
      ease: "Power2",
    });
  }

  update(time) {
    if (isWorldInputLocked(this)) return;
    if (!this.hudText || !this.player) return; // scene destroyed
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
    if (nx < 0 || nx >= this.mapW || ny < 0 || ny >= this.mapH) return;

    const tile = this.tileData[ny][nx];
    if (!this.canWalkTile(tile)) return;

    this.playerX = nx;
    this.playerY = ny;

    // Update facing direction. Direction changes immediately reset to
    // frame 0 of the new direction (#127 acceptance criterion 3).
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

    // Cache position for scene transitions
    cachedPlayerX = this.playerX;
    cachedPlayerY = this.playerY;
    cachedPlayerDir = this.playerDir;

    const destX = nx * RENDERED_TILE + RENDERED_TILE / 2;
    const destY = ny * RENDERED_TILE + RENDERED_TILE / 2;
    const stepMs = walkStepMs();
    this.tweens.add({
      targets: this.player,
      x: destX,
      y: destY,
      duration: stepMs,
      ease: "Linear",
    });
    if (this.vehicleIndicator) {
      this.tweens.add({
        targets: this.vehicleIndicator,
        x: destX,
        y: destY,
        duration: stepMs,
        ease: "Linear",
      });
    }

    this.stepCount++;

    // Door tile -- show prompt to enter
    if (tile === 5) {
      const spawn = this.spawns.find(
        (s) => Math.abs(s.x - nx) <= 1 && Math.abs(s.y - ny) <= 2,
      );
      if (spawn) {
        this.currentDoorSpawn = spawn;
        showInteractPrompt(this, spawn);
      }
    } else if (this.currentDoorSpawn) {
      this.currentDoorSpawn = null;
      hideInteractPrompt(this);
    }

    // Random encounter chance varies by terrain tile and transport tier.
    const encounterMult = this.gameState.transport?.encounter_rate_mult ?? 1.0;
    const chance = encounterChanceForStep({
      tile,
      stepCount: this.stepCount,
      transportMult: encounterMult,
    });
    if (chance > 0 && Phaser.Math.Between(1, 100) <= chance) {
      this.stepCount = 0;
      this.triggerRandomEncounter(tile);
    }

    this.updateHUD();
    this.updateMinimap();
  }

  async triggerRandomEncounter(tile) {
    this.animating = true;
    // Save position before transitioning to battle
    cachedPlayerX = this.playerX;
    cachedPlayerY = this.playerY;
    cachedPlayerDir = this.playerDir;
    console.log(
      "[World] random encounter triggered at",
      this.playerX,
      this.playerY,
    );

    try {
      // Autosave before combat starts (await to avoid racing the encounter mutation)
      await this.triggerAutosave("pre_combat");

      const result = await gameAction(this.gameState.id, {
        type: "encounter",
        tile_type: tile,
      });
      this.gameState = result;

      // Only play flash/SFX once the server confirms a real fight. Otherwise
      // (phase=world fallback when generation produced no enemies, phase=defeat
      // from overworld poison) the player would see an orphan flash with no
      // battle — issue #114.
      if (shouldStartBattle(result)) {
        playSFX("sfx_encounter");
        this.cameras.main.flash(300, 255, 255, 255);
        this.time.delayedCall(400, () => {
          this.scene.start("Battle", { gameState: result });
        });
      } else {
        this.animating = false;
      }
    } catch (e) {
      console.error("[World] encounter failed:", e);
      this.animating = false;
    }
  }

  async triggerQuestAdvance(locationName, nodeId) {
    console.log("[World] quest advance at:", locationName, nodeId);
    try {
      const result = await gameAction(this.gameState.id, {
        type: "quest_advance",
        node_id: nodeId,
      });
      this.gameState = result;
      this.updateHUD();
      this.updateQuestDisplay();
      this.updateVehicleIndicator();

      if (result.message) {
        this.showMessage(result.message);
        this.time.delayedCall(3000, () => this.hideMessage());
      }
      if (result.phase === "victory") {
        this.triggerAutosave("victory");
      } else if (result.phase === "quest_complete") {
        this.triggerAutosave("quest_complete");
      }
      if (result.phase === "victory") {
        this.time.delayedCall(3000, () => {
          this.showEndScreen(
            "VICTORY!",
            `${result.location} is saved!`,
            "#ffff44",
            result,
          );
        });
      }
    } catch (e) {
      console.error("[World] quest advance failed:", e);
    }
  }

  drawMap() {
    this.tileGraphics.clear();

    // Destroy any prior sprite container so re-draws are clean.
    if (this.tileSprites) {
      this.tileSprites.destroy(true);
    }
    this.tileSprites = this.add.container(0, 0);
    this.tileSprites.setDepth(0);

    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const tile = this.tileData[y][x];
        const px = x * RENDERED_TILE;
        const py = y * RENDERED_TILE;
        const spriteKey = TILE_SPRITE_KEYS[tile];

        if (spriteKey) {
          const img = this.add
            .image(px, py, spriteKey)
            .setOrigin(0, 0)
            .setDisplaySize(RENDERED_TILE, RENDERED_TILE);
          this.tileSprites.add(img);
        } else {
          // building (4), door (5), floor (6) — keep the existing color fallback
          const color = TILE_COLORS[tile] || 0x000000;
          this.tileGraphics.fillStyle(color, 1);
          this.tileGraphics.fillRect(px, py, RENDERED_TILE, RENDERED_TILE);
        }
      }
    }
  }

  drawMinimap() {
    const mmW = 120,
      mmH = 90;
    const mmX = 670,
      mmY = 10;
    const scaleX = mmW / this.mapW;
    const scaleY = mmH / this.mapH;

    // Background
    this.add
      .rectangle(mmX + mmW / 2, mmY + mmH / 2, mmW + 4, mmH + 4, 0x000000, 0.7)
      .setScrollFactor(0)
      .setDepth(18);

    // Draw tiles at mini scale
    const mmGfx = this.add.graphics().setScrollFactor(0).setDepth(19);
    for (let y = 0; y < this.mapH; y += 2) {
      for (let x = 0; x < this.mapW; x += 2) {
        const tile = this.tileData[y][x];
        const color = TILE_COLORS[tile] || 0x000000;
        mmGfx.fillStyle(color, 0.8);
        mmGfx.fillRect(
          mmX + x * scaleX,
          mmY + y * scaleY,
          Math.max(1, scaleX * 2),
          Math.max(1, scaleY * 2),
        );
      }
    }

    // Location markers
    for (const spawn of this.spawns) {
      if (spawn.kind === "natural") continue;
      mmGfx.fillStyle(0xffffff, 1);
      mmGfx.fillRect(
        mmX + spawn.x * scaleX - 1,
        mmY + spawn.y * scaleY - 1,
        3,
        3,
      );
    }

    // Player dot (updated each frame)
    this.minimapDot = this.add
      .circle(
        mmX + this.playerX * scaleX,
        mmY + this.playerY * scaleY,
        2,
        0xff4444,
      )
      .setScrollFactor(0)
      .setDepth(20);

    this.mmX = mmX;
    this.mmY = mmY;
    this.mmScaleX = scaleX;
    this.mmScaleY = scaleY;
  }

  updateMinimap() {
    if (this.minimapDot && this.mmX != null) {
      this.minimapDot.setPosition(
        this.mmX + this.playerX * this.mmScaleX,
        this.mmY + this.playerY * this.mmScaleY,
      );
    }
  }

  drawLabels() {
    for (const spawn of this.spawns) {
      this.add
        .text(
          spawn.x * RENDERED_TILE + RENDERED_TILE / 2,
          spawn.y * RENDERED_TILE - 10,
          spawn.name,
          {
            fontSize: "9px",
            color: "#ffffff",
            fontFamily: "monospace",
            backgroundColor: "#00000099",
            padding: { x: 3, y: 1 },
          },
        )
        .setOrigin(0.5, 1)
        .setDepth(5);
    }
  }

  updateHUD() {
    if (!this.hudText) return;
    const gs = this.gameState;
    const parts = gs.party.map((p) => {
      const base = `${p.name} Lv${p.level} ${p.hp}/${p.max_hp}`;
      return p.max_mp > 0 ? `${base} MP:${p.mp}/${p.max_mp}` : base;
    });
    const tierName = gs.transport?.tier_name || "Foot";
    this.hudText.setText(parts.join(" | "));
    if (this.hudFooter) {
      const etherTotal =
        (gs.ethers || 0) + (gs.hi_ethers || 0) + (gs.x_ethers || 0);
      this.hudFooter.setText(
        `[${tierName}]   Gold: ${gs.gold}   Potions: ${gs.potions}   Ether: ${etherTotal}`,
      );
    }
  }

  canWalkTile(tile) {
    if (TILE_WALKABLE[tile]) return true;
    const tr = this.gameState.transport;
    if (!tr) return false;
    if (tr.flies && FLY_TILES[tile]) return true;
    if (tr.crosses_water && WATER_TILES[tile]) return true;
    return false;
  }

  updateVehicleIndicator() {
    const tr = this.gameState.transport;
    const tier = tr?.current_tier || "T1";
    const spriteKey = tr?.sprite;

    if (this.vehicleIndicator) {
      this.vehicleIndicator.destroy();
      this.vehicleIndicator = null;
    }

    // Prefer a real vehicle sprite when the asset exists (e.g. horse, ship,
    // galleon, airship). Fall back to a colored ring so the player still gets
    // visual feedback even without art assets loaded.
    if (spriteKey && this.textures.exists(`vehicle_${spriteKey}`)) {
      this.vehicleIndicator = this.add
        .image(this.player.x, this.player.y, `vehicle_${spriteKey}`)
        .setDepth(9)
        .setScale(SCALE);
      return;
    }

    const color = VEHICLE_COLORS[tier];
    if (color == null) return; // T1 has no indicator

    this.vehicleIndicator = this.add
      .circle(this.player.x, this.player.y, 14, color, 0.6)
      .setDepth(9); // behind player sprite (depth 10)
  }

  updateQuestDisplay() {
    const gs = this.gameState;
    if (gs.current_quest < gs.quests.length) {
      const q = gs.quests[gs.current_quest];
      const lines = [`Quest: ${q.name}`];
      if (q.target_name) {
        lines.push(`Go to: ${q.target_name}`);
      }
      this.questText.setText(lines.join("\n"));
    } else {
      this.questText.setText("All quests complete!");
    }
  }

  showMessage(text) {
    this.messageText.setText(text).setVisible(true);
  }

  hideMessage() {
    if (this.messageText) this.messageText.setVisible(false);
  }

  showPromotionPrompt(gs) {
    // Full-screen backdrop
    this.add.rectangle(400, 300, 800, 600, 0x0a0018);
    this.add
      .text(400, 80, "CLASS PROMOTION", {
        fontSize: "32px",
        color: "#ff88ff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    this.add
      .text(
        400,
        130,
        gs.message || "A surge of power courses through the party...",
        {
          fontSize: "13px",
          color: "#ffffff",
          fontFamily: "monospace",
          wordWrap: { width: 700 },
          align: "center",
        },
      )
      .setOrigin(0.5);

    // Preview the promoted classes each party member will become.
    const PROMOTION = {
      warrior: "Knight",
      brawler: "Champion",
      rogue: "Shadow",
      mender: "Sage",
      cinder: "Pyromancer",
      wayfarer: "Wanderer",
    };
    let y = 200;
    for (const pm of gs.party) {
      const promoted = PROMOTION[pm.class_id] || "???";
      this.add
        .text(
          400,
          y,
          `${pm.name} (${pm.class_name} Lv${pm.level})  ->  ${promoted}`,
          { fontSize: "14px", color: "#ffccff", fontFamily: "monospace" },
        )
        .setOrigin(0.5);
      y += 28;
    }

    const acceptBtn = this.add
      .text(280, 460, "[ CLAIM PROMOTION ]", {
        fontSize: "16px",
        color: "#88ff88",
        fontFamily: "monospace",
        backgroundColor: "#113311",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const skipBtn = this.add
      .text(520, 460, "[ SKIP ]", {
        fontSize: "16px",
        color: "#ffaaaa",
        fontFamily: "monospace",
        backgroundColor: "#331111",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const finish = async (accept) => {
      acceptBtn.disableInteractive();
      skipBtn.disableInteractive();
      try {
        const result = await promoteParty(gs.id, accept);
        if (result && !result.error) {
          this.scene.start("World", { gameState: result });
        } else {
          this.add
            .text(400, 510, `Error: ${result?.error || "unknown"}`, {
              fontSize: "12px",
              color: "#ff4444",
              fontFamily: "monospace",
            })
            .setOrigin(0.5);
        }
      } catch (err) {
        console.error("[promote]", err);
      }
    };
    acceptBtn.on("pointerdown", () => finish(true));
    skipBtn.on("pointerdown", () => finish(false));

    this.add
      .text(
        400,
        540,
        "Promoted classes gain new spells, a new name, and a new look.",
        {
          fontSize: "10px",
          color: "#888888",
          fontFamily: "monospace",
        },
      )
      .setOrigin(0.5);
  }

  showEndScreen(title, subtitle, color, gs) {
    this.add.rectangle(400, 300, 800, 600, 0x111111);
    this.add
      .text(400, 120, title, {
        fontSize: "48px",
        color,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    this.add
      .text(400, 190, subtitle, {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    let y = 260;
    this.add
      .text(400, y, "Final Party:", {
        fontSize: "16px",
        color: "#ffff44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    y += 30;
    for (const pm of gs.party) {
      this.add
        .text(
          400,
          y,
          `${pm.name} (${pm.class_name}) Lv.${pm.level}  HP:${pm.max_hp}  STR:${pm.str} AGI:${pm.agi} INT:${pm.int_stat}`,
          { fontSize: "13px", color: "#ffffff", fontFamily: "monospace" },
        )
        .setOrigin(0.5);
      y += 22;
    }
    this.add
      .text(400, y + 20, `Gold: ${gs.gold}`, {
        fontSize: "14px",
        color: "#ffcc44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
  }
}
