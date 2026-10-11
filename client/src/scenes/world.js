import { trackedObjective } from "./questJournalModel.js";
import { updateWorldTerrainVisibility } from "./worldTerrainVisibility.js";
import { beginWalkStep } from "./walkPlayback.js";
import {
  drawMeadowDetails,
  meadowGroundPlan,
  updateMeadowDepth,
} from "./meadowPresentation.js";
import { explorationHUD } from "../ui/exploration_hud.js";
import { drawPanel, drawButton } from "../ui/panel.js";
import { gameAction, autosaveGame } from "../api.js";
import { showCampaignEnding, showFinalRecovery } from "./campaignEnding.js";
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
import { showPromotion } from "./promotion.js";
import { toggleMenu } from "./world_menu.js";
import { toggleCodex } from "./world_codex.js";
import { toggleDebugPanel, closeDebugPanel } from "./debug_panel.js";
import {
  interactWithDoor,
  interactWithNaturalNode,
  showWorldMap,
  showInteractPrompt,
  hideInteractPrompt,
  syncWorldArrival,
  updateWorldInteractionTarget,
  checkpointWorldPosition,
} from "./world_interact.js";
import { shouldStartBattle } from "./encounterFlow.js";
import { initTouchControls } from "../systems/input.js";
import {
  walkSheetKey,
  walkFrameIndex,
  nextLeaderIndex,
  walkSpritePosition,
  walkSpriteScale,
  fallbackWalkSpriteScale,
  classPortraitFallbackScale,
  WALK_IDLE_FRAME,
} from "./walkFrame.js";
import { isWorldInputLocked } from "../systems/modalLock.js";
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
import { walkAuditHUDText } from "./walkAuditMode.js";
import { applyGameplayViewport } from "../systems/gameplayViewport.js";
import { updateDungeonEntry } from "./dungeonEntry.js";
import { cancelDungeonRoute } from "./dungeonRoute.js";
import { resolveWorldStartPosition } from "./worldPosition.js";
import {
  rememberWorldCheckpoint,
  rememberWorldPosition,
  rememberWorldTileMap,
  worldDirectionForGame,
  worldPositionForGame,
  worldTileMapForGame,
} from "./worldMapCache.js";
import { renderWorldLandmarks } from "./worldLandmarkRenderer.js";

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

function isStructureTile(tile) {
  return tile === TILE_IDS.building || tile === TILE_IDS.door;
}

let cachedLeaderIndex = 0;
let cachedGameID = null;

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
    if (this.gameState?.id !== data.gameState?.id) this.trackedDungeonID = null;
    cancelDungeonRoute(this);
    this.dungeonRouteToken = null;
    this.settleWorldStep?.(false);
    this.settleWorldStep = null;
    this.worldStepDone = null;
    this.gameState = data.gameState;
    if (cachedGameID !== this.gameState?.id) {
      cachedGameID = this.gameState?.id || null;
      cachedLeaderIndex = 0;
    }
    rememberWorldTileMap(this.gameState);
    rememberWorldCheckpoint(this.gameState);
    console.log(
      "[World] init, phase:",
      this.gameState?.phase,
      "tilemap cached:",
      !!worldTileMapForGame(this.gameState?.id),
    );
  }

  create() {
    this.animating = false;
    this.encounterPending = false;
    this.gameOver = false;
    this.events.once("shutdown", () => {
      cancelDungeonRoute(this);
      this.settleWorldStep?.(false);
      this.settleWorldStep = null;
      this.worldStepDone = null;
      this.encounterPending = false;
    });

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
      showCampaignEnding(this, gs);
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

    const tm = worldTileMapForGame(gs.id);
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
    this.spawns = tm.spawns || [];
    const cachedPosition = worldPositionForGame(gs.id);
    const start = resolveWorldStartPosition({
      tileData: this.tileData,
      width: this.mapW,
      height: this.mapH,
      spawns: this.spawns,
      currentNodeID: gs.current_location?.world_node_id,
      preferredPosition: cachedPosition,
      defaultPosition: { x: tm.player_x, y: tm.player_y },
      canWalk: (tile) => this.canWalkTile(tile),
    });
    this.playerX = start?.x ?? tm.player_x;
    this.playerY = start?.y ?? tm.player_y;
    rememberWorldPosition(gs.id, { x: this.playerX, y: this.playerY });

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
    this.playerDir = worldDirectionForGame(gs.id);
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
    this.fieldShadow = this.add
      .ellipse(playerPos.x, playerPos.y - 2, 23, 7, 0x24382c, 0.3)
      .setDepth(3);
    const groundPlayer = () => updateMeadowDepth(this);
    this.events.on("postupdate", groundPlayer);
    this.events.once("shutdown", () =>
      this.events.off("postupdate", groundPlayer),
    );
    this.vehicleIndicator = null;
    this.updateVehicleIndicator();

    // Camera follows player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    // FOLLOW_UPDATE fires after camera worldView is finalized, before drawing.
    const cullTerrain = (camera) =>
      updateWorldTerrainVisibility(
        this.tileSprites.list,
        camera.worldView,
        RENDERED_TILE,
      );
    const terrainCamera = this.cameras.main;
    terrainCamera.on("followupdate", cullTerrain);
    this.events.once("shutdown", () =>
      terrainCamera.off("followupdate", cullTerrain),
    );

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
    this.currentNaturalSpawn = null;
    this.naturalInteractionActive = false;
    this.interactPrompt = null;
    this.input.keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.on("keydown-ENTER", () => this.handleAction());
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

    this.explorationHUD = explorationHUD(this, {
      menu: () => toggleMenu(this),
      help: () => toggleCodex(this),
      mute: toggleMute,
      isMuted,
      colors: TILE_COLORS,
    });
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
    this.hudText.setVisible(false);
    this.hudFooter.setVisible(false);
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
    this.questText.setVisible(false);
    this.questCard.setVisible(false);
    this.updateQuestDisplay();
    this.updateInteractionTarget();

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

    if (gs.final_encounter?.recovery && gs.message) {
      showFinalRecovery(this, gs);
    }

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
      .setAlpha(0)
      .setVisible(false);

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

  async triggerAutosave(triggerEvent, position = null) {
    if (!getAutosaveEnabled()) return;
    if (!this.gameState?.id) return;
    try {
      const checkpoint = position || (await checkpointWorldPosition(this));
      await autosaveGame(this.gameState.id, triggerEvent, checkpoint);
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
    if (this.dungeonRouteRunning) return;
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

  handleAction() {
    if (isWorldInputLocked(this)) return;
    if (this.currentNaturalSpawn) return interactWithNaturalNode(this);
    return interactWithDoor(this);
  }

  updateInteractionTarget() {
    return updateWorldInteractionTarget(this, this.playerX, this.playerY);
  }

  tryMove(dx, dy, options = {}) {
    // Touch repeat and tap-to-walk callbacks run independently of update().
    // Keep one tile step (including its authoritative arrival sync) in flight
    // at a time so held input cannot skip graph waypoints.
    if (
      this.animating ||
      isWorldInputLocked(this) ||
      (this.dungeonRouteRunning && !options.route)
    )
      return false;
    const origin = {
      x: this.playerX,
      y: this.playerY,
    };
    const nx = origin.x + dx;
    const ny = origin.y + dy;
    if (nx < 0 || nx >= this.mapW || ny < 0 || ny >= this.mapH) return false;

    const tile = this.tileData[ny][nx];
    if (!this.canWalkTile(tile)) return false;

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

    // Cache position for scene transitions
    rememberWorldPosition(
      this.gameState.id,
      { x: this.playerX, y: this.playerY },
      this.playerDir,
    );

    const dest = walkSpritePosition(nx, ny, RENDERED_TILE);
    const stepMs = walkStepMs();
    this.animating = true;
    this.walkFrameAudit = [];
    let finishWorldStep;
    let worldStepSettled = false;
    const worldStepDone = new Promise((resolve) => {
      finishWorldStep = resolve;
    });
    this.worldStepDone = worldStepDone;
    const settleWorldStep = (accepted) => {
      if (worldStepSettled) return;
      worldStepSettled = true;
      if (this.settleWorldStep === settleWorldStep) {
        this.settleWorldStep = null;
      }
      if (this.worldStepDone === worldStepDone) {
        this.worldStepDone = null;
      }
      finishWorldStep(accepted);
    };
    this.settleWorldStep = settleWorldStep;
    const walk = beginWalkStep(this, (frame) =>
      setPlayerWalkFrame(this, frame),
    );
    // Send this single authoritative step while the tile tween is running.
    // Unlock, rollback, and encounters still wait for BOTH completions.
    const arrival = syncWorldArrival(this, {
      step: true,
      debugNoEncounters: randomEncountersDisabledForDebug(),
    }).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    const finishStepAnimation = () => {
      walk.complete();
      let accepted = true;
      let encounterResult = null;
      void arrival
        .then((result) => {
          if (shouldStartBattle(result)) encounterResult = result;
          if (result?.error && this.scene?.isActive()) {
            accepted = false;
            this.restoreRejectedWorldStep(origin, result.error);
          }
        })
        .catch((error) => {
          if (this.scene?.isActive()) {
            accepted = false;
            this.restoreRejectedWorldStep(
              origin,
              error instanceof Error ? error.message : String(error),
            );
          }
        })
        .finally(() => {
          if (this.scene?.isActive()) {
            this.animating = false;
            this.updateHUD();
          }
          settleWorldStep(accepted);
          if (accepted && encounterResult && this.scene?.isActive()) {
            void this.triggerRandomEncounter(tile, encounterResult);
          }
        });
    };
    this.tweens.add({
      targets: this.player,
      x: dest.x,
      y: dest.y,
      duration: stepMs,
      ease: "Linear",
      onUpdate: () => {
        walk.updatePosition();
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

    this.updateInteractionTarget();

    this.updateHUD();
    this.updateMinimap();
    return true;
  }

  restoreRejectedWorldStep(origin, reason) {
    // The rejected movement is finished. Keep the resolved false promise from
    // poisoning later interactions and manual saves while the avatar remains
    // on this restored safe tile.
    this.worldStepDone = null;
    this.playerX = origin.x;
    this.playerY = origin.y;
    rememberWorldPosition(
      this.gameState.id,
      { x: origin.x, y: origin.y },
      this.playerDir,
    );
    const position = walkSpritePosition(origin.x, origin.y, RENDERED_TILE);
    this.player.setPosition(position.x, position.y);
    setPlayerWalkFrame(this, WALK_IDLE_FRAME);
    if (this.vehicleIndicator) {
      this.vehicleIndicator.setPosition(
        origin.x * RENDERED_TILE + RENDERED_TILE / 2,
        origin.y * RENDERED_TILE + RENDERED_TILE / 2,
      );
    }
    this.updateInteractionTarget();
    this.updateHUD();
    this.updateMinimap();
    this.showMessage(
      `Travel paused: ${reason || "the route could not be confirmed"}. Returned to the last safe step; try again.`,
    );
  }

  async triggerRandomEncounter(tile, acceptedResult = null) {
    if (this.encounterPending) return;
    this.encounterPending = true;
    this.animating = true;
    // Save position before transitioning to battle
    rememberWorldPosition(
      this.gameState.id,
      { x: this.playerX, y: this.playerY },
      this.playerDir,
    );
    console.log(
      "[World] random encounter triggered at",
      this.playerX,
      this.playerY,
    );

    try {
      // Commit the world tile even when autosave is disabled, then keep the
      // optional save ordered before the encounter mutation.
      let result = acceptedResult;
      if (!result) {
        // Explicit developer encounters retain the isolated debug flow.
        const checkpoint = await checkpointWorldPosition(this);
        await this.triggerAutosave("pre_combat", checkpoint);
        result = await gameAction(this.gameState.id, {
          type: "encounter",
          tile_type: tile,
        });
      }
      this.gameState = result;
      if (acceptedResult) {
        await this.triggerAutosave("pre_combat", {
          x: this.playerX,
          y: this.playerY,
        });
      }

      // Only play flash/SFX once the server confirms a real fight. Otherwise
      // (phase=world fallback when generation produced no enemies, phase=defeat
      // from overworld poison) the player would see an orphan flash with no
      // battle — issue #114.
      if (shouldStartBattle(result)) {
        playSFX("sfx_encounter");
        this.cameras.main.flash(300, 255, 255, 255);
        this.time.delayedCall(400, () => {
          this.encounterPending = false;
          this.scene.start("Battle", {
            gameState: result,
            encounterTileType: tile,
          });
        });
      } else {
        this.encounterPending = false;
        this.animating = false;
      }
    } catch (e) {
      console.error("[World] encounter failed:", e);
      this.encounterPending = false;
      this.animating = false;
    }
  }

  async triggerQuestAdvance(locationName, nodeId) {
    if (
      this.gameState.final_encounter &&
      !this.gameState.final_encounter.defeated
    ) {
      await this.triggerAutosave("pre_combat");
    }
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
        const spriteKey = ensureTerrainRenderTexture(
          this,
          meadowGroundPlan(
            this,
            buildTerrainRenderPlan(this.tileData, x, y),
            x,
            y,
          ),
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
              .image(
                px,
                py,
                meadowGroundPlan(this, { baseKey: "tile_grass" }, x, y).baseKey,
              )
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
    // The overland uses authored, content-classified destination markers.
    // Legacy building footprints render as walkable grass; spawn data still
    // drives destination interactions.
    renderWorldLandmarks(this, this.spawns, this.gameState);
    drawMeadowDetails(this, RENDERED_TILE);
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
      mmGfx.fillStyle(spawn.kind === "natural" ? 0x9fd27d : 0xffffff, 1);
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
      this.explorationHUD?.objective(title, detail);
      const lines = [title, detail].filter(Boolean);
      this.questText.setText(lines.join("\n"));
      const bounds = this.questText.getBounds();
      const width = Math.max(
        this.gameplayLayout?.portrait ? 320 : 230,
        Math.min(this.gameplayLayout?.portrait ? 560 : 290, bounds.width + 28),
      );
      const height = Math.max(48, bounds.height + 22);
      this.questCard.clear();
      this.questCard.fillStyle(0x06100c, 0.78);
      this.questCard.fillRoundedRect(8, 8, width, height, 6);
      this.questCard.lineStyle(2, 0x14281d, 0.95);
      this.questCard.strokeRoundedRect(8, 8, width, height, 6);
      this.questCard.fillStyle(accent, 1);
      this.questCard.fillRect(12, 14, 4, height - 12);
    };

    const objective = trackedObjective(this);
    drawCard(objective.title, objective.detail);
  }

  showMessage(text) {
    this.messageText.setText(text).setVisible(!this.explorationHUD);
    this.explorationHUD?.message(text);
  }

  hideMessage() {
    this.explorationHUD?.message("");
    if (this.messageText) this.messageText.setVisible(false);
  }

  showPromotionPrompt(gs) {
    return showPromotion(this, gs);
  }

  showEndScreen(title, subtitle, color, gs) {
    drawPanel(this, 400, 300, 776, 576, { depth: 0 });
    drawButton(
      this,
      400,
      550,
      220,
      42,
      "Return to main menu",
      () => this.scene.start("Title"),
      { fontSize: "16px" },
    );
    this.add
      .text(400, 120, title, {
        fontSize: "48px",
        color,
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);
    this.add
      .text(400, 190, subtitle, {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);

    let y = 260;
    this.add
      .text(400, y, "Final Party:", {
        fontSize: "16px",
        color: "#ffff44",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);
    y += 30;
    for (const pm of gs.party) {
      this.add
        .text(
          400,
          y,
          `${pm.name} (${pm.class_name}) Lv.${pm.level}  HP:${pm.max_hp}  STR:${pm.str} AGI:${pm.agi} INT:${pm.int_stat}`,
          {
            fontSize: "13px",
            color: "#ffffff",
            fontFamily: "Arial, sans-serif",
          },
        )
        .setOrigin(0.5);
      y += 22;
    }
    this.add
      .text(400, y + 20, `Gold: ${gs.gold}`, {
        fontSize: "14px",
        color: "#ffcc44",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);
  }
}
