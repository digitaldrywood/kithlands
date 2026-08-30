import { transitionLocation } from "../api.js";
import { playMusic, playSFX } from "../systems/audio.js";
import { initTouchControls, isTouchDevice } from "../systems/input.js";
import { walkStepMs } from "../systems/prefs.js";
import { getLeaderIndex } from "./world.js";
import {
  classPortraitFallbackScale,
  fallbackWalkSpriteScale,
  WALK_IDLE_FRAME,
  walkFrameForProgress,
  walkFrameIndex,
  walkFrameSequence,
  walkSheetKey,
  walkSpritePosition,
  walkSpriteScale,
} from "./walkFrame.js";
import {
  buildSettlementModel,
  interactionAt,
  objectProperty,
} from "./settlementMap.js";
import {
  applyGameplayViewport,
  centeredPlayfieldOffset,
} from "../systems/gameplayViewport.js";

const RENDERED_TILE = 32;
const DEPTH_BACKGROUND = 0;
const DEPTH_ACTOR_BASE = 100;
const DEPTH_UI = 1000;

function actorDepth(tileY) {
  return DEPTH_ACTOR_BASE + tileY;
}

function setPlayerWalkFrame(scene, frame) {
  if (!scene.player) return;
  scene.walkFrameAudit?.push({
    dir: scene.playerDir,
    frame,
    frameIndex: scene.hasWalkSheet
      ? walkFrameIndex(scene.playerDir, frame, scene.leaderClass)
      : null,
    time: scene.time?.now ?? 0,
  });
  if (scene.hasWalkSheet) {
    scene.walkFrame = frame;
    scene.player.setFrame(
      walkFrameIndex(scene.playerDir, frame, scene.leaderClass),
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
  }
  return () => {
    clearWalkFrameTimers(scene);
    setPlayerWalkFrame(scene, WALK_IDLE_FRAME);
    onComplete?.();
  };
}

export class SettlementScene extends Phaser.Scene {
  constructor() {
    super("Settlement");
  }

  init(data) {
    this.gameState = data.gameState;
  }

  create() {
    const layout = applyGameplayViewport(this);
    this.animating = true;
    this.menuOpen = false;
    this.gameOver = false;
    this.cameras.main.setBackgroundColor("#101719");
    playMusic("music_overworld");

    try {
      const map = this.gameState?.settlement_map;
      const anchor = this.gameState?.current_location?.anchor;
      this.model = buildSettlementModel(map, anchor);
      this.mapW = this.model.width;
      this.mapH = this.model.height;
      this.tileData = this.model.tileData;
      const offset = centeredPlayfieldOffset(
        layout,
        this.model.width * this.model.tileWidth,
        this.model.height * this.model.tileHeight,
      );
      this.offsetX = offset.x;
      this.offsetY = offset.y;
    } catch (error) {
      this.showLoadFailure(error);
      return;
    }

    this.backgroundTexture = `settlement:${this.model.id}`;
    if (this.textures.exists(this.backgroundTexture)) {
      this.buildScene();
      return;
    }

    const loading = this.add
      .text(layout.centerX, layout.messageY, "Entering town…", {
        fontSize: layout.portrait ? "24px" : "14px",
        color: "#f2dfaa",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    this.load.image(this.backgroundTexture, this.model.background);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      loading.destroy();
      this.buildScene();
    });
    this.load.once(Phaser.Loader.Events.LOAD_ERROR, (file) => {
      loading.destroy();
      this.showLoadFailure(
        new Error(`Could not load settlement art: ${file?.src || "unknown"}`),
      );
    });
    this.load.start();
  }

  buildScene() {
    this.add
      .image(this.offsetX, this.offsetY, this.backgroundTexture)
      .setOrigin(0)
      .setDisplaySize(
        this.model.width * this.model.tileWidth,
        this.model.height * this.model.tileHeight,
      )
      .setDepth(DEPTH_BACKGROUND);

    this.npcs = this.model.npcs.map((npc) => {
      const x = Math.floor(npc.x / this.model.tileWidth);
      const y = Math.floor(npc.y / this.model.tileHeight);
      const texture = objectProperty(npc, "sprite");
      const image = this.add
        .image(
          this.offsetX + x * RENDERED_TILE + RENDERED_TILE / 2,
          this.offsetY + (y + 1) * RENDERED_TILE,
          texture,
        )
        .setOrigin(0.5, 1)
        .setDepth(actorDepth(y));
      image.setScale(
        (RENDERED_TILE * 1.5) / Math.max(image.width || 1, image.height || 1),
      );
      return {
        name: npc.name,
        role: objectProperty(npc, "role"),
        x,
        y,
        image,
      };
    });

    this.playerX = this.model.spawn.x;
    this.playerY = this.model.spawn.y;
    this.playerDir = this.model.spawn.direction;
    this.currentInteraction = null;
    this.interactPrompt = null;
    this.messageText = null;

    const leaderIndex = getLeaderIndex();
    const leader =
      this.gameState?.party?.[leaderIndex] || this.gameState?.party?.[0];
    this.leaderClass = leader?.sprite_id || leader?.class_id || "warrior";
    this.hasWalkSheet = this.textures.exists(walkSheetKey(this.leaderClass));
    this.playerFallbackTexture = this.textures.exists(this.leaderClass)
      ? this.leaderClass
      : `player_${this.playerDir}`;

    const playerPosition = walkSpritePosition(
      this.playerX,
      this.playerY,
      RENDERED_TILE,
      this.offsetX,
      this.offsetY,
    );
    if (this.hasWalkSheet) {
      this.player = this.add
        .sprite(
          playerPosition.x,
          playerPosition.y,
          walkSheetKey(this.leaderClass),
          walkFrameIndex(this.playerDir, WALK_IDLE_FRAME, this.leaderClass),
        )
        .setOrigin(0.5, 1)
        .setScale(walkSpriteScale(RENDERED_TILE, this.leaderClass));
    } else {
      this.player = this.add
        .image(playerPosition.x, playerPosition.y, this.playerFallbackTexture)
        .setOrigin(0.5, 1)
        .setScale(
          this.playerFallbackTexture === this.leaderClass
            ? classPortraitFallbackScale(RENDERED_TILE)
            : fallbackWalkSpriteScale(RENDERED_TILE),
        );
    }
    this.player.setDepth(actorDepth(this.playerY));

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");
    this.input.keyboard.on("keydown-ENTER", () => this.handleAction());
    this.input.keyboard.on("keydown-SPACE", (event) => {
      event?.preventDefault?.();
      this.handleAction();
    });
    initTouchControls(this);

    this.add
      .rectangle(
        this.gameplayLayout.centerX,
        this.gameplayLayout.footerY,
        this.gameplayLayout.width,
        this.gameplayLayout.portrait ? 44 : 24,
        0x101820,
        0.9,
      )
      .setScrollFactor(0)
      .setDepth(DEPTH_UI);
    this.footer = this.add
      .text(
        this.gameplayLayout.centerX,
        this.gameplayLayout.footerY,
        this.gameplayLayout.portrait || isTouchDevice()
          ? "D-PAD / ARROWS  Move     A / ENTER  Enter / leave"
          : "MOVE  Arrow Keys / WASD     ENTER  Enter / leave",
        {
          fontSize: this.gameplayLayout.portrait ? "22px" : "10px",
          color: "#f2e4c4",
          fontFamily: "monospace",
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_UI + 1);

    this.animating = false;
    this.updateInteractionTargets();
  }

  showLoadFailure(error) {
    console.error("[Settlement]", error);
    this.add
      .text(
        this.gameplayLayout?.centerX || 400,
        this.gameplayLayout?.messageY || 300,
        "This town could not be loaded.\nReturn to the overworld.",
        {
          fontSize: this.gameplayLayout?.portrait ? "24px" : "14px",
          color: "#ffffff",
          fontFamily: "monospace",
          align: "center",
          backgroundColor: "#000000dd",
          padding: { x: 18, y: 12 },
        },
      )
      .setOrigin(0.5);
  }

  update(time) {
    if (this.animating || !this.player) return;
    if (time - (this.lastMoveTime || 0) < 145) return;

    let dx = 0;
    let dy = 0;
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
    return tile === 0;
  }

  tryMove(dx, dy) {
    if (this.animating) return;
    const nextX = this.playerX + dx;
    const nextY = this.playerY + dy;
    if (nextX < 0 || nextY < 0 || nextX >= this.mapW || nextY >= this.mapH) {
      return;
    }

    if (dx < 0) this.playerDir = "left";
    else if (dx > 0) this.playerDir = "right";
    else if (dy < 0) this.playerDir = "up";
    else if (dy > 0) this.playerDir = "down";
    setPlayerWalkFrame(this, WALK_IDLE_FRAME);

    if (!this.canWalkTile(this.tileData[nextY][nextX])) {
      this.updateInteractionTargets();
      return;
    }

    this.playerX = nextX;
    this.playerY = nextY;
    this.player.setDepth(actorDepth(nextY));
    const destination = walkSpritePosition(
      nextX,
      nextY,
      RENDERED_TILE,
      this.offsetX,
      this.offsetY,
    );
    const stepMs = walkStepMs();
    this.animating = true;
    this.walkFrameAudit = [];
    const finishAnimation = playStepAnimation(this, stepMs, () => {
      this.animating = false;
    });
    this.tweens.add({
      targets: this.player,
      x: destination.x,
      y: destination.y,
      duration: stepMs,
      ease: "Linear",
      onUpdate: (tween) => {
        setPlayerWalkFrame(
          this,
          walkFrameForProgress(tween.progress, this.leaderClass),
        );
      },
      onComplete: finishAnimation,
    });
    this.updateInteractionTargets();
  }

  updateInteractionTargets() {
    this.currentInteraction = interactionAt(
      this.model,
      this.playerX,
      this.playerY,
      this.playerDir,
    );
    if (this.currentInteraction) this.showInteractPrompt();
    else this.hideInteractPrompt();
  }

  showInteractPrompt() {
    this.hideInteractPrompt();
    const destination = objectProperty(this.currentInteraction, "display_name");
    const action = this.currentInteraction.type === "exit" ? "Leave" : "Enter";
    const controls = isTouchDevice() ? "[ TAP A ]" : "[ ENTER / SPACE ]";
    this.interactPrompt = this.add
      .text(
        this.player.x,
        this.player.y - 32,
        `${controls} ${action} ${destination}`,
        {
          fontSize: "10px",
          color: "#fff0a8",
          fontFamily: "monospace",
          backgroundColor: "#101820e8",
          padding: { x: 6, y: 3 },
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 2);
  }

  hideInteractPrompt() {
    this.interactPrompt?.destroy();
    this.interactPrompt = null;
  }

  async handleAction() {
    if (!this.currentInteraction || this.animating) return;
    this.animating = true;
    this.hideInteractPrompt();
    const result = await transitionLocation(
      this.gameState.id,
      this.currentInteraction.name,
    );
    if (result?.error) {
      this.animating = false;
      this.showMessage(result.error);
      this.updateInteractionTargets();
      return;
    }

    this.gameState = result;
    playSFX("sfx_door");
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      if (result.current_location?.kind === "interior") {
        this.scene.start("Town", {
          gameState: result,
          spawn: result.current_location.interior,
        });
        return;
      }
      if (result.current_location?.kind === "world") {
        this.scene.start("World", { gameState: result });
      }
    });
  }

  showMessage(text) {
    this.messageText?.destroy();
    this.messageText = this.add
      .text(
        this.gameplayLayout?.centerX || 400,
        this.gameplayLayout?.messageY || 300,
        text,
        {
          fontSize: this.gameplayLayout?.portrait ? "22px" : "12px",
          color: "#ffffff",
          fontFamily: "monospace",
          backgroundColor: "#000000e8",
          padding: { x: 12, y: 8 },
          wordWrap: { width: 480 },
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 4);
    this.time.delayedCall(2200, () => {
      this.messageText?.destroy();
      this.messageText = null;
    });
  }

  updateHUD() {}

  flashSaveIcon() {}
}
