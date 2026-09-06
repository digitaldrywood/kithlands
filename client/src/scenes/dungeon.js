import { beginWalkStep } from "./walkPlayback.js";
import { dungeonAction, saveGame } from "../api.js";
import { initAudio, playMusic, playSFX } from "../systems/audio.js";
import { applyGameplayViewport } from "../systems/gameplayViewport.js";
import {
  isWorldInputLocked,
  pauseWorldFor,
  resumeWorldFor,
} from "../systems/modalLock.js";
import { walkStepMs } from "../systems/prefs.js";
import { drawButton, drawPanel } from "../ui/panel.js";
import { getLeaderIndex } from "./world.js";
import {
  rememberWorldCheckpoint,
  rememberWorldTileMap,
} from "./worldMapCache.js";
import { toggleMenu } from "./world_menu.js";
import {
  dungeonLayout,
  dungeonMapOffset,
  dungeonModel,
  dungeonPath,
  distanceToAction,
} from "./dungeonView.js";
import {
  walkSheetKey,
  walkFrameIndex,
  walkSpritePosition,
  walkSpriteScale,
  WALK_IDLE_FRAME,
} from "./walkFrame.js";

const HUD_DEPTH = 20;
const BODY_FONT = "Trebuchet MS, Arial, sans-serif";

export class DungeonScene extends Phaser.Scene {
  constructor() {
    super("Dungeon");
  }

  init(data) {
    this.gameState = data.gameState;
    // A full save load may enter Dungeon before World. Retain its generated
    // map for the later retreat response, whose compact action state omits it.
    rememberWorldTileMap(this.gameState);
    rememberWorldCheckpoint(this.gameState);
    this.entryMessage = data.entryMessage ?? data.gameState?.message ?? "";
    this.playerDir = data.playerDir || "up";
    this.animating = false;
    this.menuOpen = false;
    this.gameOver = false;
    this._modalLocks = new Set();
    this.path = [];
    this.pendingAction = null;
    this.actionPage = 0;
    this.journalGroup = null;
    this.hudGroup = [];
    this.markers = [];
  }

  create() {
    const viewport = applyGameplayViewport(this);
    initAudio(this);
    playMusic("music_overworld");
    this.cameras.main.setBackgroundColor("#0c181c");
    this.events.once("shutdown", () => {
      this.path = [];
      this.pendingAction = null;
      this.input.keyboard.removeAllListeners();
    });
    if (this.gameState.phase === "combat") {
      this.startBattle(this.gameState);
      return;
    }
    if (this.gameState.current_location?.kind !== "dungeon") {
      this.leaveScene(this.gameState);
      return;
    }
    try {
      this.model = dungeonModel(this.gameState.dungeon);
      this.layout = dungeonLayout(
        viewport,
        this.model,
        this.gameState.dungeon.position,
      );
    } catch (error) {
      console.error("[Dungeon]", error);
      this.loadFailed();
      return;
    }
    this.tileData = this.model.tileData;
    this.mapW = this.model.width;
    this.mapH = this.model.height;
    this.offsetX = this.layout.offsetX;
    this.offsetY = this.layout.offsetY;
    this.backgroundKey = `dungeon:${this.model.background}`;
    this.foregroundKey = this.model.foreground
      ? `dungeon:${this.model.foreground}`
      : "";
    let pending = false;
    for (const [key, path] of [
      [this.backgroundKey, this.model.background],
      [this.foregroundKey, this.model.foreground],
    ]) {
      if (path && !this.textures.exists(key)) {
        this.load.image(key, path);
        pending = true;
      }
    }
    if (!pending) {
      this.buildScene();
      return;
    }
    this.animating = true;
    const loading = this.text(
      viewport.centerX,
      viewport.centerY,
      "Following the trail…",
      viewport.portrait ? 30 : 18,
    ).setOrigin(0.5);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      loading.destroy();
      if (
        !this.textures.exists(this.backgroundKey) ||
        (this.foregroundKey && !this.textures.exists(this.foregroundKey))
      ) {
        this.loadFailed();
      } else this.buildScene();
    });
    this.load.start();
  }

  text(
    x,
    y,
    value,
    size = this.layout?.bodySize || 16,
    color = "#e2e8db",
    depth = HUD_DEPTH + 1,
  ) {
    return this.add
      .text(x, y, value || "", {
        fontFamily: BODY_FONT,
        fontSize: `${size}px`,
        color,
      })
      .setDepth(depth)
      .setScrollFactor(0);
  }

  button(x, y, width, label, onClick, depth = HUD_DEPTH + 2) {
    const button = drawButton(
      this,
      x,
      y,
      width,
      this.layout?.buttonHeight || 44,
      label,
      onClick,
      {
        depth,
        fontSize: this.layout?.portrait ? "28px" : "14px",
        fontFamily: BODY_FONT,
        fill: 0x1c3537,
        fillHover: 0x315153,
        fillPress: 0x142d30,
        fillDisabled: 0x122225,
        stroke: 0x8c9b75,
        textColor: "#f7e6b1",
        textColorDisabled: "#87938d",
        strokeWidth: 1,
      },
    );
    button.label.setWordWrapWidth(width - 16).setAlign("center");
    return button;
  }

  loadFailed() {
    this.animating = false;
    const { width, height, portrait } = this.gameplayLayout;
    this.text(
      width / 2,
      height / 2 - 45,
      "The trail could not be loaded.\nYour progress is still safe.",
      portrait ? 30 : 18,
    )
      .setAlign("center")
      .setOrigin(0.5);
    this.button(width / 2, height / 2 + 45, 280, "Return to town", () =>
      this.sendAction({ type: "retreat" }),
    );
  }

  buildScene() {
    const { offsetX, offsetY, mapWidth, mapHeight, tile } = this.layout;
    this.mapRoot = this.add.container(offsetX, offsetY);
    const maskArt = this.make.graphics({ x: 0, y: 0, add: false });
    maskArt
      .fillStyle(0xffffff)
      .fillRect(
        16,
        this.layout.top,
        this.layout.width - 32,
        this.layout.bottom - this.layout.top,
      );
    const mapMask = maskArt.createGeometryMask();
    this.mapRoot.setMask(mapMask);
    this.events.once("shutdown", () => {
      mapMask.destroy();
      maskArt.destroy();
    });
    this.mapRoot.add(
      this.add
        .image(0, 0, this.backgroundKey)
        .setOrigin(0)
        .setDisplaySize(mapWidth, mapHeight)
        .setDepth(0),
    );
    if (this.foregroundKey)
      this.mapRoot.add(
        this.add
          .image(0, 0, this.foregroundKey)
          .setOrigin(0)
          .setDisplaySize(mapWidth, mapHeight)
          .setDepth(12),
      );
    const position = this.gameState.dungeon.position;
    this.playerX = position.x;
    this.playerY = position.y;
    const leader =
      this.gameState.party?.[getLeaderIndex()] || this.gameState.party?.[0];
    this.leaderClass = leader?.sprite_id || leader?.class_id || "warrior";
    const point = walkSpritePosition(this.playerX, this.playerY, tile);
    this.shadow = this.add
      .ellipse(
        point.x,
        point.y - tile * 0.1,
        tile * 0.7,
        tile * 0.28,
        0x001011,
        0.35,
      )
      .setDepth(8);
    this.player = this.add
      .sprite(
        point.x,
        point.y,
        walkSheetKey(this.leaderClass),
        walkFrameIndex(this.playerDir, WALK_IDLE_FRAME, this.leaderClass),
      )
      .setOrigin(0.5, 1)
      .setScale(walkSpriteScale(tile, this.leaderClass))
      .setDepth(10);
    this.mapRoot.add([this.shadow, this.player]);
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");
    this.input.keyboard.on("keydown-ENTER", () => this.handleAction());
    this.input.keyboard.on("keydown-SPACE", (event) => {
      event.preventDefault();
      this.handleAction();
    });
    this.input.keyboard.on("keydown-ESC", () => {
      if (this.journalGroup) this.closeJournal();
      else if (!this.animating) this.openParty();
    });
    this.input.keyboard.on("keydown-J", () => this.openJournal());
    this.input.on("pointerdown", (pointer, objects) => {
      if (objects.length || isWorldInputLocked(this)) return;
      if (
        pointer.x < 16 ||
        pointer.x > this.layout.width - 16 ||
        pointer.y < this.layout.top ||
        pointer.y > this.layout.bottom
      )
        return;
      const x = Math.floor((pointer.x - this.offsetX) / tile);
      const y = Math.floor((pointer.y - this.offsetY) / tile);
      const action = this.gameState.dungeon.actions?.find(
        (candidate) => candidate.x === x && candidate.y === y,
      );
      if (action) this.selectAction(action);
      else this.walkTo({ x, y });
    });
    this.animating = false;
    this.updateHUD();
    if (this.entryMessage) this.showMessage(this.entryMessage);
  }

  update() {
    if (isWorldInputLocked(this) || !this.player) return;
    let direction = null;
    if (this.cursors.left.isDown || this.wasd.A.isDown) direction = [-1, 0];
    else if (this.cursors.right.isDown || this.wasd.D.isDown)
      direction = [1, 0];
    else if (this.cursors.up.isDown || this.wasd.W.isDown) direction = [0, -1];
    else if (this.cursors.down.isDown || this.wasd.S.isDown) direction = [0, 1];
    if (direction) {
      this.path = [];
      this.pendingAction = null;
      this.tryMove(...direction);
    } else if (this.path.length) {
      const next = this.path.shift();
      this.tryMove(next.x - this.playerX, next.y - this.playerY);
    } else if (this.pendingAction) {
      const action = this.pendingAction;
      this.pendingAction = null;
      this.selectAction(action);
    }
  }

  walkTo(target, action = null) {
    if (isWorldInputLocked(this)) return;
    const path = dungeonPath(
      this.tileData,
      { x: this.playerX, y: this.playerY },
      target,
      !!action,
    );
    if (!path) {
      this.showMessage("There is no clear path from here.");
      return;
    }
    this.path = path;
    this.pendingAction = action;
  }

  tryMove(dx, dy) {
    if (isWorldInputLocked(this) || Math.abs(dx) + Math.abs(dy) !== 1) return;
    this.playerDir =
      dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
    this.player.setFrame(
      walkFrameIndex(this.playerDir, WALK_IDLE_FRAME, this.leaderClass),
    );
    if (this.tileData[this.playerY + dy]?.[this.playerX + dx] !== 0) {
      this.path = [];
      this.pendingAction = null;
      return;
    }
    return this.sendAction({ type: "move", dx, dy });
  }

  handleAction() {
    if (isWorldInputLocked(this)) return;
    const action = (this.gameState.dungeon.actions || []).find(
      (candidate) =>
        (!candidate.completed || candidate.available) &&
        distanceToAction(this.gameState.dungeon.position, candidate) <= 1,
    );
    if (action) this.selectAction(action);
    else this.showMessage("Walk to a marked landmark, then choose its action.");
  }

  selectAction(action) {
    if (isWorldInputLocked(this)) return;
    action = this.gameState.dungeon.actions?.find(
      (current) => current.id === action.id,
    );
    if (!action) return;
    this.path = [];
    this.pendingAction = null;
    if (distanceToAction(this.gameState.dungeon.position, action) > 1) {
      this.walkTo(action, action);
      return;
    }
    if (action.available === false) {
      this.showMessage(
        action.reason ||
          (action.completed
            ? "Already explored."
            : "This way is not open yet."),
      );
      return;
    }
    return this.sendAction({ type: "interact", action_id: action.id });
  }

  async sendAction(action) {
    if (isWorldInputLocked(this)) return;
    this.animating = true;
    this.hideMessage();
    try {
      const result = await dungeonAction(this.gameState.id, action);
      if (!this.scene.isActive()) return;
      if (result?.error || !result?.id) {
        this.path = [];
        this.pendingAction = null;
        this.animating = false;
        this.showMessage(
          result?.error || "The trail could not be updated. Please try again.",
        );
        return;
      }
      const previous = this.gameState.dungeon;
      this.gameState = result;
      if (result.phase === "combat") {
        this.startBattle(result);
        return;
      }
      if (result.current_location?.kind !== "dungeon") {
        this.leaveScene(result);
        return;
      }
      if (
        !this.player ||
        previous?.room_id !== result.dungeon.room_id ||
        action.type !== "move"
      ) {
        this.scene.restart({
          gameState: result,
          playerDir: this.playerDir,
          entryMessage: result.message || "",
        });
        return;
      }
      const position = result.dungeon.position;
      const moved = position.x !== this.playerX || position.y !== this.playerY;
      this.playerX = position.x;
      this.playerY = position.y;
      if (moved) {
        const point = walkSpritePosition(
          position.x,
          position.y,
          this.layout.tile,
        );
        const walk = beginWalkStep(
          this,
          (frame) =>
            this.player.setFrame(
              walkFrameIndex(this.playerDir, frame, this.leaderClass),
            ),
          this.layout.tile,
        );
        this.tweens.add({
          targets: this.player,
          x: point.x,
          y: point.y,
          duration: walkStepMs(),
          ease: "Linear",
          onUpdate: () => {
            walk.updatePosition();
            this.shadow.setPosition(
              this.player.x,
              this.player.y - this.layout.tile * 0.1,
            );
            this.updateMapFrame();
          },
          onComplete: () => {
            walk.complete();
            this.animating = false;
          },
        });
      } else this.animating = false;
      this.updateHUD();
      if (result.message) this.showMessage(result.message);
    } catch (error) {
      console.error("[Dungeon]", error);
      this.path = [];
      this.pendingAction = null;
      this.animating = false;
      this.showMessage("Connection interrupted. Please try again.");
    }
  }

  startBattle(gameState) {
    this.path = [];
    this.scene.start("Battle", {
      gameState,
      returnScene: { sceneKey: "Dungeon" },
    });
  }

  updateMapFrame() {
    const offset = dungeonMapOffset(this.layout, {
      x: this.player.x / this.layout.tile - 0.5,
      y: this.player.y / this.layout.tile - 1,
    });
    this.offsetX = offset.offsetX;
    this.offsetY = offset.offsetY;
    this.mapRoot.setPosition(this.offsetX, this.offsetY);
  }

  leaveScene(gameState) {
    const kind = gameState.current_location?.kind;
    if (kind === "settlement") this.scene.start("Settlement", { gameState });
    else this.scene.start("World", { gameState });
  }

  updateHUD() {
    if (!this.layout || !this.gameState.dungeon) return;
    for (const element of [...this.hudGroup, ...this.markers])
      element.destroy();
    this.hudGroup = [];
    this.markers = [];
    const d = this.gameState.dungeon;
    const {
      width,
      height,
      portrait,
      bodySize,
      actionY,
      buttonHeight,
      tile,
      offsetX,
      offsetY,
    } = this.layout;
    const add = (object) => {
      this.hudGroup.push(object);
      return object;
    };
    add(
      this.add
        .rectangle(
          width / 2,
          portrait ? 100 : 43,
          width,
          portrait ? 200 : 86,
          0x102326,
        )
        .setDepth(HUD_DEPTH),
    );
    add(
      this.text(24, portrait ? 20 : 10, d.title, portrait ? 24 : 13, "#bccea9"),
    );
    const roomTitle = add(
      this.text(
        24,
        portrait ? 56 : 30,
        d.room_name,
        portrait ? 37 : 24,
        "#fff1c8",
      ).setOrigin(0, 0),
    );
    const titleWidth = width - 48;
    if (roomTitle.width > titleWidth) {
      const preferredSize = portrait ? 37 : 24;
      const minimumSize = portrait ? 25 : 17;
      roomTitle.setFontSize(
        Math.max(
          minimumSize,
          Math.floor((preferredSize * titleWidth) / roomTitle.width),
        ),
      );
    }
    add(
      this.text(24, portrait ? 110 : 61, d.description, portrait ? 28 : 14)
        .setOrigin(0, 0)
        .setWordWrapWidth(width - 48),
    );
    const footerTop = portrait ? height - 542 : height - 133;
    add(
      this.add
        .rectangle(
          width / 2,
          (footerTop + height) / 2,
          width,
          height - footerTop,
          0x102326,
        )
        .setDepth(HUD_DEPTH),
    );
    const actions = d.actions || [];
    const pageSize = actions.length > 4 ? 3 : 4;
    const pages = Math.max(1, Math.ceil(actions.length / pageSize));
    this.actionPage %= pages;
    const visible = actions.slice(
      this.actionPage * pageSize,
      this.actionPage * pageSize + pageSize,
    );
    visible.forEach((action, index) => {
      const columns = portrait ? 2 : 4;
      const buttonWidth = (width - 48 - (columns - 1) * 12) / columns;
      const x = 24 + buttonWidth / 2 + (index % columns) * (buttonWidth + 12);
      const y = actionY + Math.floor(index / columns) * (buttonHeight + 12);
      const near = distanceToAction(d.position, action) <= 1;
      const label = `${action.completed ? "✓ " : ""}${action.label}`;
      const button = add(
        this.button(x, y, buttonWidth, label, () => this.selectAction(action)),
      );
      if (near && action.available !== false && !action.completed)
        button.bg.setStrokeStyle(2, 0xf4d881);
    });
    for (const action of actions) {
      const x = (action.x + 0.5) * tile;
      const y = (action.y + 0.5) * tile;
      const marker = this.add
        .circle(
          x,
          y,
          Math.max(10, tile * 0.4),
          action.completed
            ? 0x315951
            : action.available === false
              ? 0x364345
              : 0x173b3a,
          0.94,
        )
        .setStrokeStyle(2, action.completed ? 0x80b09a : 0xe4c981)
        .setDepth(13)
        .setInteractive({ useHandCursor: true });
      marker.on("pointerdown", (pointer) => {
        if (
          pointer.x >= 16 &&
          pointer.x <= width - 16 &&
          pointer.y >= this.layout.top &&
          pointer.y <= this.layout.bottom
        )
          this.selectAction(action);
      });
      const glyph = action.completed
        ? "✓"
        : ["exit", "transition", "door"].includes(action.kind)
          ? "›"
          : "!";
      this.markers.push(
        marker,
        this.text(
          x,
          y,
          glyph,
          Math.max(14, tile * 0.7),
          "#fff0bc",
          14,
        ).setOrigin(0.5),
      );
    }
    this.mapRoot.add(this.markers);
    this.mapRoot.sort("depth");
    const objectiveY = portrait ? height - 300 : height - 69;
    add(
      this.text(
        24,
        objectiveY,
        d.objective,
        bodySize,
        "#d5dfbd",
      ).setWordWrapWidth(width - 48),
    );
    const navY = portrait ? height - 60 : height - 22;
    const nav = [
      ["Party", () => this.openParty()],
      ["Journal", () => this.openJournal()],
      ["Save", () => this.saveProgress()],
      ["Retreat", () => this.sendAction({ type: "retreat" })],
    ];
    nav.forEach(([label, callback], index) =>
      add(this.button(104 + index * 197, navY, 176, label, callback)),
    );
    if (portrait) {
      [
        ["←", -1, 0],
        ["↑", 0, -1],
        ["↓", 0, 1],
        ["→", 1, 0],
      ].forEach(([label, dx, dy], index) => {
        add(
          this.button(250 + index * 100, height - 166, 90, label, () => {
            this.path = [];
            this.pendingAction = null;
            this.tryMove(dx, dy);
          }),
        );
      });
    }
    if (pages > 1)
      add(
        this.button(
          portrait ? 591 : 686.5,
          portrait ? actionY + buttonHeight + 12 : actionY,
          portrait ? 370 : 179,
          `More routes ${this.actionPage + 1}/${pages}`,
          () => {
            if (isWorldInputLocked(this)) return;
            this.actionPage = (this.actionPage + 1) % pages;
            this.updateHUD();
          },
        ),
      );
    this.statusText = add(
      this.text(
        width / 2,
        this.layout.bottom - (portrait ? 34 : 18),
        "",
        portrait ? 26 : 15,
        "#fff1c8",
        HUD_DEPTH + 3,
      )
        .setOrigin(0.5)
        .setAlign("center")
        .setWordWrapWidth(width - 72)
        .setPadding(10, 7)
        .setBackgroundColor("#102326ee"),
    );
    this.statusText.setVisible(false);
  }

  openParty() {
    if (
      this.animating ||
      this.journalGroup ||
      (!this.menuOpen && isWorldInputLocked(this))
    )
      return;
    this.path = [];
    this.pendingAction = null;
    toggleMenu(this);
  }

  async saveProgress() {
    if (isWorldInputLocked(this)) return;
    this.path = [];
    this.pendingAction = null;
    this.animating = true;
    try {
      const result = await saveGame(
        this.gameState.id,
        `${this.gameState.dungeon.title} — ${this.gameState.dungeon.room_name}`,
      );
      if (this.scene.isActive())
        this.showMessage(
          result?.error || "Adventure saved. You can continue from this room.",
        );
      if (!result?.error) playSFX("sfx_save");
    } catch {
      this.showMessage("Could not save. Please try again.");
    } finally {
      this.animating = false;
    }
  }

  openJournal(page = 0) {
    if (isWorldInputLocked(this)) return;
    this.path = [];
    this.pendingAction = null;
    pauseWorldFor(this, "dungeon_journal");
    const { width, height, portrait, bodySize } = this.layout;
    const d = this.gameState.dungeon;
    const group = [];
    this.journalGroup = group;
    group.push(
      drawPanel(
        this,
        width / 2,
        height / 2,
        width - 48,
        portrait ? Math.min(height - 140, 1280) : height - 50,
        { depth: 60, fill: 0x102326, stroke: 0xc9bd85 },
      ).bg,
    );
    const top = portrait ? Math.max(90, height / 2 - 560) : 52;
    group.push(
      this.text(52, top, "Trail journal", portrait ? 38 : 27, "#fff1c8", 61),
    );
    group.push(
      this.text(
        52,
        top + (portrait ? 62 : 44),
        d.objective,
        bodySize,
        "#d5dfbd",
        61,
      ).setWordWrapWidth(width - 104),
    );
    const bottom = portrait
      ? Math.min(height - 100, height / 2 + 560)
      : height - 66;
    const journalY = top + (portrait ? 180 : 116);
    const journalText = this.text(52, journalY, "M", bodySize, "#e2e8db", 61)
      .setWordWrapWidth(width - 104)
      .setLineSpacing(portrait ? 5 : 3);
    // Page by rendered lines, so authored notes stay readable at either size
    // and even a single long note cannot cover the journal controls.
    const lineHeight = journalText.height + (portrait ? 5 : 3);
    const linesPerPage = Math.max(
      1,
      Math.floor((bottom - (portrait ? 126 : 86) - journalY) / lineHeight),
    );
    const lines = [...(d.journal || [])]
      .reverse()
      .flatMap((entry) => [...journalText.getWrappedText(`• ${entry}`), ""]);
    const pages = Math.max(1, Math.ceil(lines.length / linesPerPage));
    page = Math.min(page, pages - 1);
    journalText.setText(
      lines.slice(page * linesPerPage, (page + 1) * linesPerPage).join("\n"),
    );
    group.push(journalText);
    group.push(
      this.text(
        52,
        bottom - (portrait ? 94 : 60),
        `${d.visited?.length || 0} places explored · Page ${page + 1} of ${pages}`,
        bodySize,
        "#a6baad",
        61,
      ),
    );
    if (pages > 1)
      group.push(
        this.button(
          185,
          bottom,
          248,
          "Earlier notes",
          () => {
            this.closeJournal();
            this.openJournal((page + 1) % pages);
          },
          62,
        ),
      );
    group.push(
      this.button(
        width - 175,
        bottom,
        248,
        "Return to trail",
        () => this.closeJournal(),
        62,
      ),
    );
  }

  closeJournal() {
    this.journalGroup?.forEach((object) => object.destroy());
    this.journalGroup = null;
    resumeWorldFor(this, "dungeon_journal");
  }

  showMessage(message) {
    this.statusText?.setText(message).setVisible(true);
  }

  hideMessage() {
    this.statusText?.setVisible(false);
  }

  flashSaveIcon() {
    this.showMessage("Adventure saved.");
  }
}
