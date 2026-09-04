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
  walkSheetKey,
  walkFrameIndex,
  walkFrameForProgress,
  walkFrameSequence,
  nextLeaderIndex,
  walkSpritePosition,
  walkSpriteScale,
  fallbackWalkSpriteScale,
  classPortraitFallbackScale,
  WALK_IDLE_FRAME,
} from "./walkFrame.js";
import { isWorldInputLocked } from "../systems/modalLock.js";
import { encounterChanceForStep } from "./worldEncounter.js";
import {
  FLY_TILES,
  TILE_COLORS,
  TILE_IDS,
  TILE_WALKABLE,
  WATER_TILES,
} from "./tileConstants.js";
import {
  buildTerrainRenderPlan,
  ensureTerrainRenderTexture,
} from "./terrainAutotile.js";
import { questObjectiveText, questKindLabel } from "./quest_text.js";
import { walkAuditHUDText } from "./walkAuditMode.js";
import { applyGameplayViewport } from "../systems/gameplayViewport.js";
import { updateDungeonEntry } from "./dungeonEntry.js";

const ENEMY_SPRITES = {
  Slime: "monster_slime",
  Goblin: "monster_goblin",
  Wolf: "monster_wolf",
  Skeleton: "monster_skeleton",
  "Dark Knight": "monster_dark_knight",
};

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

function randomEncountersDisabledForDebug() {
  if (!import.meta.env?.DEV) return false;
  if (globalThis.__kithlandsNoEncounters === true) return true;
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    return (
      params.has("noEncounters") ||
      params.has("no-encounters") ||
      params.get("encounters") === "0"
    );
  } catch {
    return false;
  }
}

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

function clearWalkFrameTimers(scene) {
  scene.walkFrameTimers?.forEach((timer) => timer?.remove?.(false));
  scene.walkFrameTimers = [];
}

function playStepAnimation(scene, stepMs, onComplete) {
  clearWalkFrameTimers(scene);
  if (scene.hasWalkSheet) {
    const sequence = walkFrameSequence(scene.leaderClass);
    sequence.forEach((frame, index) => {
      scene.walkFrameTimers.push(
        scene.time.delayedCall(
          Math.round((stepMs * index) / sequence.length),
          () => setPlayerWalkFrame(scene, frame),
        ),
      );
    });
  } else {
    setPlayerWalkFrame(scene, WALK_IDLE_FRAME);
  }
  return () => {
    clearWalkFrameTimers(scene);
    if (scene.hasWalkSheet) {
      setPlayerWalkFrame(scene, walkFrameSequence(scene.leaderClass).at(-1));
    }
    setPlayerWalkFrame(scene, WALK_IDLE_FRAME);
    onComplete?.();
  };
}

function isStructureTile(tile) {
  return tile === TILE_IDS.building || tile === TILE_IDS.door;
}

function hashCode(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function isSettlementSpawn(spawn) {
  const kind = (spawn?.kind || "").toLowerCase();
  const type = (spawn?.building_type || "").toLowerCase();
  return (
    kind === "place" ||
    kind === "business" ||
    kind === "landmark" ||
    type === "inn" ||
    type === "shop" ||
    type === "temple"
  );
}

function drawIconHouse(graphics, x, y, size, roofColor, tall = false) {
  const w = size;
  const h = tall ? Math.round(size * 1.08) : Math.round(size * 0.78);
  const roofH = Math.round(size * 0.36);
  const bodyY = y + roofH;

  graphics.fillStyle(0x10200f, 1);
  graphics.fillTriangle(
    x - 2,
    bodyY + 2,
    x + w / 2,
    y - 2,
    x + w + 2,
    bodyY + 2,
  );
  graphics.fillRect(x - 1, bodyY, w + 2, h + 2);
  graphics.fillStyle(roofColor, 1);
  graphics.fillTriangle(x, bodyY, x + w / 2, y, x + w, bodyY);
  graphics.fillRect(x + 2, bodyY - 2, w - 4, 4);
  graphics.fillStyle(0xf1f1e7, 1);
  graphics.fillRect(x + 2, bodyY + 2, w - 4, h - 2);
  graphics.fillStyle(0xb9b9ad, 1);
  graphics.fillRect(x + 3, bodyY + h - 5, w - 6, 3);
  graphics.fillStyle(0x252018, 1);
  graphics.fillRect(x + Math.floor(w / 2) - 2, bodyY + h - 9, 4, 9);
  graphics.fillRect(x + 4, bodyY + 5, 3, 4);
  if (w > 18) graphics.fillRect(x + w - 7, bodyY + 5, 3, 4);
}

function drawIconKeep(graphics, x, y, w, h) {
  graphics.fillStyle(0x10200f, 1);
  graphics.fillRect(x - 2, y + 8, w + 4, h + 2);
  graphics.fillStyle(0xf0f0e8, 1);
  graphics.fillRect(x, y + 8, w, h);
  graphics.fillStyle(0xb9b9ad, 1);
  graphics.fillRect(x + 3, y + h, w - 6, 5);
  graphics.fillStyle(0x10200f, 1);
  graphics.fillRect(x + Math.floor(w / 2) - 3, y + h - 8, 6, 13);
  graphics.fillStyle(0xf0f0e8, 1);
  graphics.fillRect(x, y + 4, 5, 6);
  graphics.fillRect(x + w / 2 - 3, y, 6, 10);
  graphics.fillRect(x + w - 5, y + 4, 5, 6);
}

function drawOverworldCastleIcon(graphics, cx, cy, seed) {
  const baseW = 72 + (seed % 2) * 8;
  const baseH = 54;
  const left = cx - baseW / 2;
  const top = cy - baseH / 2 - 6;

  graphics.fillStyle(0x0d570d, 1);
  graphics.fillRect(left - 7, top + 18, baseW + 14, baseH - 10);
  graphics.fillStyle(0x101510, 1);
  graphics.fillRect(left + 10, top + 38, baseW - 20, 5);
  drawIconHouse(graphics, left + 2, top + 32, 19, 0xc9c9c0);
  drawIconHouse(graphics, left + baseW - 21, top + 32, 19, 0xc9c9c0);
  drawIconKeep(graphics, cx - 16, top + 4, 32, 42);
  if (seed % 3 === 0) {
    drawIconKeep(graphics, left + 16, top + 18, 18, 30);
    drawIconKeep(graphics, left + baseW - 34, top + 18, 18, 30);
  }
}

function drawOverworldTownIcon(graphics, cx, cy, seed) {
  const variant = seed % 4;
  const roofA = variant === 1 ? 0xd6d6cd : 0xf0f0e6;
  const roofB = variant === 2 ? 0xbdbdb4 : 0xe4e4da;
  const left = cx - 39;
  const top = cy - 35;

  graphics.fillStyle(0x0d610e, 1);
  if (variant === 0) graphics.fillRect(left + 8, top + 11, 62, 50);
  else if (variant === 1) graphics.fillRect(left + 2, top + 24, 74, 31);
  else graphics.fillEllipse(cx, cy - 1, 76, 48);

  const positions =
    variant === 1
      ? [
          [left + 7, top + 23, 19, roofB, false],
          [left + 29, top + 14, 22, roofA, true],
          [left + 53, top + 23, 19, roofB, false],
        ]
      : [
          [left + 30, top + 5, 22, roofA, true],
          [left + 8, top + 28, 19, roofB, false],
          [left + 52, top + 28, 19, roofB, false],
          [left + 28, top + 43, 18, roofA, false],
        ];

  for (const [x, y, size, roof, tall] of positions) {
    drawIconHouse(graphics, x, y, size, roof, tall);
  }
}

function drawOverworldTempleIcon(graphics, cx, cy, seed) {
  const left = cx - 34;
  const top = cy - 40;
  graphics.fillStyle(0x0d560d, 1);
  graphics.fillEllipse(cx, cy, 80, 54);
  graphics.fillStyle(0x111611, 1);
  graphics.fillTriangle(cx - 25, top + 32, cx, top + 2, cx + 25, top + 32);
  graphics.fillRect(cx - 24, top + 31, 48, 31);
  graphics.fillStyle(seed % 2 === 0 ? 0xe9e9dd : 0xd2d2c8, 1);
  graphics.fillTriangle(cx - 22, top + 31, cx, top + 5, cx + 22, top + 31);
  graphics.fillStyle(0xf3f3eb, 1);
  graphics.fillRect(cx - 20, top + 31, 40, 28);
  graphics.fillStyle(0xb8b8ae, 1);
  graphics.fillRect(cx - 24, top + 58, 48, 5);
  graphics.fillStyle(0x202018, 1);
  graphics.fillRect(cx - 4, top + 44, 8, 19);
  if (seed % 3 === 0) {
    drawIconHouse(graphics, left + 2, top + 38, 16, 0xe4e4d8);
    drawIconHouse(graphics, left + 50, top + 38, 16, 0xe4e4d8);
  }
}

function drawOverworldPointIcon(graphics, cx, cy, seed) {
  const isCave = seed % 3 === 0;
  graphics.fillStyle(0x0b4c0d, 1);
  graphics.fillEllipse(cx, cy + 6, 54, 36);
  if (isCave) {
    graphics.fillStyle(0x8f8f85, 1);
    graphics.fillTriangle(cx - 24, cy + 15, cx, cy - 25, cx + 24, cy + 15);
    graphics.fillStyle(0x222018, 1);
    graphics.fillEllipse(cx, cy + 7, 20, 21);
    return;
  }
  drawIconHouse(graphics, cx - 15, cy - 25, 30, 0xe8e8df, true);
}

function drawWorldLocationMarker(graphics, spawn) {
  if (!spawn || spawn.kind === "natural") return;
  const seed = hashCode(
    `${spawn.node_id || spawn.name || ""}:${spawn.x}:${spawn.y}`,
  );
  const cx = (spawn.x ?? 0) * RENDERED_TILE + RENDERED_TILE / 2;
  const cy = (spawn.y ?? 0) * RENDERED_TILE + RENDERED_TILE / 2;
  const type = (spawn.building_type || "").toLowerCase();
  const kind = (spawn.kind || "").toLowerCase();

  graphics.fillStyle(0x071007, 0.32);
  graphics.fillEllipse(cx, cy + 17, 76, 20);

  if (kind === "landmark" || type === "castle") {
    drawOverworldCastleIcon(graphics, cx, cy, seed);
  } else if (type === "temple") {
    drawOverworldTempleIcon(graphics, cx, cy, seed);
  } else if (isSettlementSpawn(spawn)) {
    drawOverworldTownIcon(graphics, cx, cy, seed);
  } else {
    drawOverworldPointIcon(graphics, cx, cy, seed);
  }
}

function drawWorldLocationMarkers(graphics, spawns = []) {
  for (const spawn of spawns) {
    drawWorldLocationMarker(graphics, spawn);
  }
}

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

function cycleWorldLeader(scene) {
  const now = scene.time?.now ?? Date.now();
  if (now - (scene.lastLeaderCycleAt ?? -Infinity) < 120) return false;
  if (scene.animating || scene.menuOpen || scene.gameOver) return false;
  const party = scene.gameState?.party;
  if (!party || party.length <= 1) return false;
  const next = nextLeaderIndex(party, cachedLeaderIndex);
  if (next === cachedLeaderIndex) return false;
  scene.lastLeaderCycleAt = now;
  cachedLeaderIndex = next;
  const member = party[cachedLeaderIndex];
  scene.leaderClass = member.sprite_id || member.class_id || "warrior";
  scene.hasWalkSheet = scene.textures.exists(walkSheetKey(scene.leaderClass));
  scene.playerFallbackTexture = scene.textures.exists(scene.leaderClass)
    ? scene.leaderClass
    : `player_${scene.playerDir}`;
  if (scene.hasWalkSheet) {
    scene.walkFrame = 0;
    scene.player.setTexture(
      walkSheetKey(scene.leaderClass),
      walkFrameIndex(scene.playerDir, 0, scene.leaderClass),
    );
    scene.player.setScale(walkSpriteScale(RENDERED_TILE, scene.leaderClass));
  } else {
    scene.player.setTexture(scene.playerFallbackTexture);
    scene.player.setScale(
      scene.playerFallbackTexture === scene.leaderClass
        ? classPortraitFallbackScale(RENDERED_TILE)
        : fallbackWalkSpriteScale(RENDERED_TILE),
    );
  }
  playSFX("sfx_cursor");
  scene.updateHUD();
  return true;
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

    if (
      gs.current_location?.kind === "dungeon" &&
      !["defeat", "victory", "promotion"].includes(gs.phase)
    ) {
      this.scene.start("Dungeon", { gameState: gs });
      return;
    }

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

    const layout = applyGameplayViewport(this);

    const tm = cachedTileMap;
    if (!tm) {
      console.error("[World] no tilemap available");
      this.add
        .text(
          layout.centerX,
          layout.messageY,
          "Error: no tilemap. Try restarting the game.",
          {
            fontSize: "14px",
            color: "#ff4444",
            fontFamily: "monospace",
          },
        )
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

    // Player sprite (directional, restore cached direction). Accepted walk
    // sheets animate; quarantined classes use their class portrait as a
    // temporary idle fallback instead of the old generic player art.
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
    this.playerFallbackTexture = this.textures.exists(this.leaderClass)
      ? this.leaderClass
      : `player_${this.playerDir}`;

    const playerPos = walkSpritePosition(
      this.playerX,
      this.playerY,
      RENDERED_TILE,
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
        .setDepth(10)
        .setScale(walkSpriteScale(RENDERED_TILE, this.leaderClass));
    } else {
      this.player = this.add
        .image(playerPos.x, playerPos.y, this.playerFallbackTexture)
        .setOrigin(0.5, 1)
        .setDepth(10)
        .setScale(
          this.playerFallbackTexture === this.leaderClass
            ? classPortraitFallbackScale(RENDERED_TILE)
            : fallbackWalkSpriteScale(RENDERED_TILE),
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

    // Enter interacts with nearby locations. Space cycles the party leader.
    this.currentDoorSpawn = null;
    this.interactPrompt = null;
    this.input.keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.on("keydown-ENTER", () => interactWithDoor(this));
    this.input.keyboard.on("keydown-SPACE", (event) => {
      event?.preventDefault?.();
      cycleWorldLeader(this);
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
      .rectangle(
        layout.centerX,
        layout.worldHud.centerY,
        layout.width,
        layout.worldHud.height,
        0x000000,
        0.8,
      )
      .setScrollFactor(0)
      .setDepth(20);
    this.add
      .rectangle(
        layout.centerX,
        layout.worldHud.dividerY,
        layout.width,
        2,
        0xd7b45c,
        0.65,
      )
      .setScrollFactor(0)
      .setDepth(21);
    this.hudText = this.add
      .text(10, layout.worldHud.partyY, "", {
        fontSize: layout.portrait ? "20px" : "12px",
        color: "#ffffff",
        fontFamily: "monospace",
        lineSpacing: layout.portrait ? 5 : 0,
      })
      .setScrollFactor(0)
      .setDepth(21);
    this.hudFooter = this.add
      .text(10, layout.worldHud.footerY, "", {
        fontSize: layout.portrait ? "20px" : "12px",
        color: "#ffcc66",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(21);
    this.updateHUD();

    // Objective card. The old two-line debug label exposed quest template
    // names more than player intent; this keeps the next action readable.
    this.questCard = this.add.graphics().setScrollFactor(0).setDepth(21);
    this.questText = this.add
      .text(18, 14, "", {
        fontSize: layout.portrait ? "22px" : "11px",
        color: "#f5efe0",
        fontFamily: "monospace",
        lineSpacing: 3,
        wordWrap: { width: layout.portrait ? 500 : 250 },
      })
      .setScrollFactor(0)
      .setDepth(22);
    this.updateQuestDisplay();

    // Message overlay
    this.messageText = this.add
      .text(layout.centerX, layout.messageY, "", {
        fontSize: layout.portrait ? "24px" : "14px",
        color: "#ffffff",
        fontFamily: "monospace",
        backgroundColor: "#000000dd",
        padding: { x: 16, y: 12 },
        wordWrap: { width: layout.portrait ? 680 : 500 },
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
      .text(606, 575, isMuted() ? "Unmute" : "Mute", {
        fontSize: "11px",
        color: "#9aa4b5",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    muteBtn.setVisible(!layout.portrait);
    muteBtn.on("pointerdown", () => {
      const m = toggleMute();
      muteBtn.setText(m ? "Unmute" : "Mute");
    });

    const codexBtn = this.add
      .text(680, 575, "Help  H", {
        fontSize: "11px",
        color: "#d8e6ff",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    codexBtn.setVisible(!layout.portrait);
    codexBtn.on("pointerdown", () => toggleCodex(this));

    const menuBtn = this.add
      .text(752, 575, "Menu  M", {
        fontSize: "11px",
        color: "#f0d77a",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    menuBtn.setVisible(!layout.portrait);
    menuBtn.on("pointerdown", () => toggleMenu(this));

    this.lastMoveTime = 0;
    this.moveCooldown = 150;

    // Autosave timer
    this.autosaveTimer = null;
    this.startAutosaveTimer();

    // Autosave icon (hidden by default)
    this.saveIcon = this.add
      .text(layout.width - 180, 10, "", {
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
    if (this.animating) return;
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
    this.playerDir = dir;

    setPlayerWalkFrame(this, WALK_IDLE_FRAME);

    // Cache position for scene transitions
    cachedPlayerX = this.playerX;
    cachedPlayerY = this.playerY;
    cachedPlayerDir = this.playerDir;

    const dest = walkSpritePosition(nx, ny, RENDERED_TILE);
    const stepMs = walkStepMs();
    this.animating = true;
    this.walkFrameAudit = [];
    const finishStepAnimation = playStepAnimation(this, stepMs, () => {
      this.animating = false;
    });
    this.tweens.add({
      targets: this.player,
      x: dest.x,
      y: dest.y,
      duration: stepMs,
      ease: "Linear",
      onUpdate: (tween) => {
        setPlayerWalkFrame(
          this,
          walkFrameForProgress(tween.progress, this.leaderClass),
        );
      },
      onComplete: finishStepAnimation,
    });
    if (this.vehicleIndicator) {
      this.tweens.add({
        targets: this.vehicleIndicator,
        x: nx * RENDERED_TILE + RENDERED_TILE / 2,
        y: ny * RENDERED_TILE + RENDERED_TILE / 2,
        duration: stepMs,
        ease: "Linear",
      });
    }

    this.stepCount++;

    const nearbySpawn = this.spawns.find(
      (s) =>
        s.kind !== "natural" &&
        Math.abs(s.x - nx) <= 1 &&
        Math.abs(s.y - ny) <= 2,
    );
    if (tile === 5 || nearbySpawn) {
      if (nearbySpawn) {
        this.currentDoorSpawn = nearbySpawn;
        showInteractPrompt(this, nearbySpawn);
      }
    } else if (this.currentDoorSpawn) {
      this.currentDoorSpawn = null;
      hideInteractPrompt(this);
    }

    if (!randomEncountersDisabledForDebug()) {
      // Random encounter chance varies by terrain tile and transport tier.
      const encounterMult =
        this.gameState.transport?.encounter_rate_mult ?? 1.0;
      const chance = encounterChanceForStep({
        tile,
        stepCount: this.stepCount,
        transportMult: encounterMult,
      });
      if (chance > 0 && Phaser.Math.Between(1, 100) <= chance) {
        this.stepCount = 0;
        this.triggerRandomEncounter(tile);
      }
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
          this.scene.start("Battle", {
            gameState: result,
            encounterTileType: tile,
          });
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
    if (this.locationGraphics) {
      this.locationGraphics.destroy();
    }
    this.tileSprites = this.add.container(0, 0);
    this.tileSprites.setDepth(0);
    this.locationGraphics = this.add.graphics();
    this.locationGraphics.setDepth(2);

    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const tile = this.tileData[y][x];
        const px = x * RENDERED_TILE;
        const py = y * RENDERED_TILE;
        const spriteKey = ensureTerrainRenderTexture(
          this,
          buildTerrainRenderPlan(this.tileData, x, y),
        );

        if (spriteKey) {
          const img = this.add
            .image(px, py, spriteKey)
            .setOrigin(0, 0)
            .setDisplaySize(RENDERED_TILE, RENDERED_TILE);
          this.tileSprites.add(img);
        } else if (isStructureTile(tile)) {
          if (this.textures.exists("tile_grass")) {
            const img = this.add
              .image(px, py, "tile_grass")
              .setOrigin(0, 0)
              .setDisplaySize(RENDERED_TILE, RENDERED_TILE);
            this.tileSprites.add(img);
          } else {
            this.tileGraphics.fillStyle(TILE_COLORS[TILE_IDS.grass], 1);
            this.tileGraphics.fillRect(px, py, RENDERED_TILE, RENDERED_TILE);
          }
        } else {
          // floor (6) and any future non-terrain IDs keep the color fallback.
          const color = TILE_COLORS[tile] || 0x000000;
          this.tileGraphics.fillStyle(color, 1);
          this.tileGraphics.fillRect(px, py, RENDERED_TILE, RENDERED_TILE);
        }
      }
    }
    // On the overland map, settlements and points of interest are destination
    // markers. The full cluster of custom buildings belongs inside Town.
    drawWorldLocationMarkers(this.locationGraphics, this.spawns);
  }

  drawMinimap() {
    const mmW = 120,
      mmH = 90;
    const mmX = (this.gameplayLayout?.width || 800) - 130,
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

  updateHUD() {
    updateDungeonEntry(this);
    if (!this.hudText) return;
    const gs = this.gameState;
    if (import.meta.env?.DEV && gs.walk_audit) {
      this.hudText.setText(walkAuditHUDText(gs.party, cachedLeaderIndex));
      if (this.hudFooter) {
        this.hudFooter.setText(
          "Arrows/WASD: walk   Space: next class   Encounters: off",
        );
      }
      return;
    }
    const parts = gs.party.map((p) => {
      const base = `${p.name} Lv${p.level} ${p.hp}/${p.max_hp}`;
      return p.max_mp > 0 ? `${base} MP:${p.mp}/${p.max_mp}` : base;
    });
    const tierName = gs.transport?.tier_name || "Foot";
    this.hudText.setText(
      parts.join(this.gameplayLayout?.portrait ? "\n" : " | "),
    );
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
    const drawCard = (title, detail, accent = 0xd7b45c) => {
      const lines = [title, detail].filter(Boolean);
      this.questText.setText(lines.join("\n"));
      const bounds = this.questText.getBounds();
      const width = Math.max(230, Math.min(290, bounds.width + 28));
      const height = Math.max(48, bounds.height + 22);
      this.questCard.clear();
      this.questCard.fillStyle(0x06100c, 0.78);
      this.questCard.fillRoundedRect(8, 8, width, height, 6);
      this.questCard.lineStyle(2, 0x14281d, 0.95);
      this.questCard.strokeRoundedRect(8, 8, width, height, 6);
      this.questCard.fillStyle(accent, 1);
      this.questCard.fillRect(12, 14, 4, height - 12);
    };

    if (gs.current_quest < gs.quests.length) {
      const q = gs.quests[gs.current_quest];
      const title = `${questKindLabel(q)}: ${q.name}`;
      const detail = questObjectiveText(q);
      drawCard(title, detail);
    } else {
      drawCard("Campaign Complete", "All quests complete.", 0x88d47a);
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
      .text(280, 460, "Claim Promotion", {
        fontSize: "16px",
        color: "#88ff88",
        fontFamily: "monospace",
        backgroundColor: "#113311",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const skipBtn = this.add
      .text(520, 460, "Skip", {
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
