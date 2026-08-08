import { playMusic, playSFX } from "../systems/audio.js";
import { initTouchControls, isTouchDevice } from "../systems/input.js";
import { getLeaderIndex } from "./world.js";
import {
  walkFrameIndex,
  walkFrameForProgress,
  walkFrameSequence,
  walkSheetKey,
  walkSpritePosition,
  walkSpriteScale,
  fallbackWalkSpriteScale,
  classPortraitFallbackScale,
  WALK_IDLE_FRAME,
} from "./walkFrame.js";
import { walkStepMs } from "../systems/prefs.js";

const TILE_SIZE = 16;
const SCALE = 2;
const RENDERED_TILE = TILE_SIZE * SCALE;
const DEPTH_GROUND = 0;
const DEPTH_PROP = 5;
const DEPTH_ACTOR = 20;
const DEPTH_UI = 100;

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
    scene.player.setFrame(
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

function hashCode(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function buildingSprite(seed, role, x, y) {
  const type =
    role === "hall"
      ? "hall"
      : role === "temple"
        ? "temple"
        : role === "shop"
          ? "shop"
          : role === "inn"
            ? "inn"
            : "house";
  return {
    x,
    y,
    w: type === "hall" ? 4 : type === "temple" ? 4 : 3,
    h: type === "hall" ? 3 : 2,
    type,
    seed: hashCode(`${seed}:${role}:${x}:${y}`),
  };
}

function buildingInteriorSpawn(settlementSpawn, building) {
  const baseName = settlementSpawn?.name || "Settlement";
  const roleNames = {
    hall: "Town Hall",
    inn: "Inn",
    shop: "Shop",
    temple: "Temple",
    house: "House",
  };
  const tags = {
    hall: ["civic"],
    inn: ["rest"],
    shop: ["shop", "commerce"],
    temple: ["temple", "revive"],
    house: ["house"],
  };
  const roleName = roleNames[building.type] || "House";
  const baseLower = baseName.toLowerCase();
  const name =
    building.type === "hall"
      ? baseLower.includes("hall")
        ? baseName
        : `${baseName} Hall`
      : roleName;
  return {
    ...settlementSpawn,
    node_id: `${settlementSpawn?.node_id || "settlement"}:${building.type}:${building.x}:${building.y}`,
    name,
    kind: "building",
    building_type:
      building.type === "hall"
        ? "house"
        : building.type === "temple"
          ? "temple"
          : building.type === "shop"
            ? "shop"
            : building.type === "inn"
              ? "inn"
              : "house",
    tags: tags[building.type] || ["house"],
  };
}

function settlementLayoutKind(spawn) {
  const kind = (spawn?.kind || "").toLowerCase();
  const type = (spawn?.building_type || "").toLowerCase();
  if (kind === "landmark" || type === "castle") return "castle";
  if (type === "temple" || (spawn?.tags || []).includes("temple")) {
    return "temple";
  }
  return "town";
}

function layoutForSettlement(spawn) {
  const seed = hashCode(`${spawn?.node_id || spawn?.name || "settlement"}`);
  const kind = settlementLayoutKind(spawn);
  if (kind === "castle") {
    return {
      kind,
      seed,
      start: { x: 12, y: 16 },
      roads: [
        { x: 11, y: 4, w: 3, h: 13, color: 0xb8b2a0, highlight: 0xd8d0ba },
        { x: 5, y: 10, w: 15, h: 2, color: 0xb8b2a0, highlight: 0xd8d0ba },
        { x: 7, y: 6, w: 11, h: 2, color: 0xa8a292, highlight: 0xc8c1ad },
      ],
      buildings: [
        buildingSprite(seed, "hall", 10, 3),
        buildingSprite(seed, "inn", 4, 9),
        buildingSprite(seed, "shop", 18, 9),
        buildingSprite(seed, "house", 6, 13),
        buildingSprite(seed, "temple", 15, 13),
      ],
    };
  }
  if (kind === "temple") {
    return {
      kind,
      seed,
      start: { x: 12, y: 16 },
      roads: [
        { x: 11, y: 5, w: 3, h: 12, color: 0xbfb98f, highlight: 0xe0d79b },
        { x: 6, y: 11, w: 13, h: 2, color: 0xbfb98f, highlight: 0xe0d79b },
      ],
      buildings: [
        buildingSprite(seed, "temple", 10, 4),
        buildingSprite(seed, "house", 5, 10),
        buildingSprite(seed, "inn", 17, 10),
        buildingSprite(seed, "shop", 7, 14),
        buildingSprite(seed, "house", 16, 14),
      ],
    };
  }
  return {
    kind,
    seed,
    start: { x: 12, y: 16 },
    roads: [
      { x: 11, y: 4, w: 3, h: 13, color: 0xcaa05e, highlight: 0xe2bf79 },
      { x: 4, y: 10, w: 17, h: 2, color: 0xcaa05e, highlight: 0xe2bf79 },
    ],
    buildings: [
      buildingSprite(seed, "hall", 11, 4),
      buildingSprite(seed, "inn", 4 + (seed % 2), 8),
      buildingSprite(seed, "shop", 17, 8 + (seed % 2)),
      buildingSprite(seed, "house", 7, 13),
      buildingSprite(seed, "temple", 15, 13),
      ...(seed % 3 === 0 ? [buildingSprite(seed, "house", 3, 14)] : []),
    ],
  };
}

function drawPixelHouse(graphics, px, py, w, h, type, seed) {
  const palettes = {
    hall: { roof: 0xe8ece4, wall: 0xf2f0df, trim: 0xb6b4a5, accent: 0x6c8fb0 },
    temple: {
      roof: 0xd8d8cf,
      wall: 0xf5f4e8,
      trim: 0xb7b8ac,
      accent: 0xd5c581,
    },
    shop: { roof: 0xd6b45c, wall: 0xf0ead6, trim: 0xb48b45, accent: 0x6ca7c8 },
    inn: { roof: 0xc76f58, wall: 0xf0e5d2, trim: 0x9b6b4f, accent: 0xe2d18a },
    house: { roof: 0x79a7cf, wall: 0xefe9d7, trim: 0x9aa7ad, accent: 0xb9d7ef },
  };
  const palette = palettes[type] || palettes.house;
  const roof =
    type === "temple"
      ? palette.roof
      : type === "shop"
        ? palette.roof
        : type === "inn"
          ? palette.roof
          : palette.roof;
  const wall = palette.wall;
  const shadow = 0x10160e;
  const width = w * RENDERED_TILE;
  const height = h * RENDERED_TILE;
  const roofH = type === "hall" || type === "temple" ? 30 : 24;
  const bodyY = py + roofH - 4;

  graphics.fillStyle(shadow, 0.85);
  graphics.fillRect(px - 5, bodyY + 5, width + 10, height - 6);
  graphics.fillStyle(0x071007, 0.28);
  graphics.fillEllipse(px + width / 2, py + height + 20, width + 20, 18);

  graphics.fillStyle(0x1b2118, 1);
  graphics.fillTriangle(
    px - 8,
    bodyY + 4,
    px + width / 2,
    py - 2,
    px + width + 8,
    bodyY + 4,
  );
  graphics.fillStyle(roof, 1);
  graphics.fillTriangle(
    px - 4,
    bodyY,
    px + width / 2,
    py + 2,
    px + width + 4,
    bodyY,
  );
  graphics.fillRect(px + 4, bodyY - 3, width - 8, 6);
  graphics.lineStyle(1, 0x7b5b35, 0.45);
  for (let sx = px + 8; sx < px + width - 8; sx += 12) {
    graphics.lineBetween(sx, bodyY - 2, sx + 8, bodyY - 18);
  }
  for (let sy = bodyY - 12; sy < bodyY + 1; sy += 7) {
    graphics.lineBetween(px + 8, sy, px + width - 8, sy);
  }

  if (type === "hall" || type === "temple") {
    graphics.fillStyle(roof, 1);
    graphics.fillRect(px + width / 2 - 7, py - 18, 14, 24);
    graphics.fillStyle(0x1b2118, 1);
    graphics.fillRect(px + width / 2 - 5, py - 22, 10, 5);
  }

  graphics.fillStyle(wall, 1);
  graphics.fillRect(px + 3, bodyY + 5, width - 6, height - 10);
  graphics.fillStyle(0xffffff, 0.24);
  graphics.fillRect(px + 7, bodyY + 8, width - 14, 5);
  graphics.fillStyle(palette.trim, 1);
  graphics.fillRect(px + 6, py + height - 8, width - 12, 5);
  graphics.fillRect(px + 8, bodyY + 36, width - 16, 4);
  graphics.fillStyle(0x1d1b15, 1);
  graphics.fillRect(px + width / 2 - 5, py + height - 24, 10, 24);
  graphics.fillStyle(0x4c3522, 1);
  graphics.fillRect(px + width / 2 - 3, py + height - 21, 6, 21);
  graphics.fillStyle(0xf5d36d, 1);
  graphics.fillRect(px + width / 2 + 2, py + height - 12, 2, 2);

  const windowY = bodyY + 18;
  for (let i = 0; i < Math.max(2, w - 1); i++) {
    const wx = px + 11 + i * 24 + ((seed + i) % 2) * 2;
    if (Math.abs(wx - (px + width / 2)) < 14) continue;
    graphics.fillStyle(0x1d1b15, 1);
    graphics.fillRect(wx - 1, windowY - 1, 8, 8);
    graphics.fillStyle(palette.accent, 1);
    graphics.fillRect(wx, windowY, 6, 6);
    graphics.fillStyle(0xf5fbff, 0.7);
    graphics.fillRect(wx + 1, windowY + 1, 2, 2);
  }

  if (type === "shop" || type === "inn") {
    graphics.fillStyle(type === "shop" ? 0x2b5c8c : 0x7e3e3e, 1);
    graphics.fillRect(px + width / 2 - 24, bodyY + 7, 48, 10);
    graphics.fillStyle(0xf6e7aa, 1);
    graphics.fillRect(px + width / 2 - 18, bodyY + 10, 36, 2);
  }
}

function drawBarrelCluster(graphics, x, y, seed) {
  const count = 2 + (seed % 2);
  for (let i = 0; i < count; i++) {
    graphics.fillStyle(0x5f3d20, 1);
    graphics.fillEllipse(x + i * 12, y, 10, 14);
    graphics.lineStyle(1, 0xc59a52, 0.8);
    graphics.strokeEllipse(x + i * 12, y, 10, 14);
  }
}

function drawFlowerPatch(graphics, x, y, seed) {
  const colors = [0xffd1e6, 0xf5e36a, 0xd8f0ff, 0xe1c4ff];
  for (let i = 0; i < 7; i++) {
    graphics.fillStyle(colors[(seed + i) % colors.length], 1);
    graphics.fillCircle(
      x + ((seed + i * 11) % 34),
      y + ((seed + i * 7) % 18),
      2,
    );
  }
}

function drawTownProps(graphics, layout) {
  const seed = layout.seed;
  for (const building of layout.buildings) {
    const px = building.x * RENDERED_TILE;
    const py = building.y * RENDERED_TILE;
    if (building.type === "shop") {
      drawBarrelCluster(
        graphics,
        px + building.w * RENDERED_TILE + 14,
        py + 50,
        seed,
      );
      drawBarrelCluster(graphics, px - 12, py + 58, seed + 3);
    } else if (building.type === "inn") {
      graphics.fillStyle(0x6f3e22, 1);
      graphics.fillRect(px - 18, py + 36, 18, 18);
      graphics.fillStyle(0xd3b46b, 1);
      graphics.fillRect(px - 15, py + 39, 12, 12);
    } else if (building.type === "temple") {
      drawFlowerPatch(graphics, px - 22, py + 70, seed);
      drawFlowerPatch(
        graphics,
        px + building.w * RENDERED_TILE + 8,
        py + 66,
        seed + 7,
      );
    }
  }

  graphics.fillStyle(0x7c6040, 1);
  for (let i = 0; i < 14; i++) {
    const x = 2 * RENDERED_TILE + ((seed + i * 53) % (21 * RENDERED_TILE));
    const y = 3 * RENDERED_TILE + ((seed + i * 29) % (12 * RENDERED_TILE));
    graphics.fillRect(x, y, 3, 3);
  }
}

function drawTreeBorder(graphics, mapW, seed) {
  graphics.fillStyle(0x0b4c17, 1);
  for (let x = 0; x < mapW; x++) {
    graphics.fillRect(x * RENDERED_TILE, 0, RENDERED_TILE, 18);
    if ((x + seed) % 3 !== 0) {
      graphics.fillRect(x * RENDERED_TILE + 4, 22, 18, 10);
    }
  }
}

function drawCastleWalls(graphics) {
  graphics.fillStyle(0x77786f, 1);
  graphics.fillRect(
    3 * RENDERED_TILE,
    2 * RENDERED_TILE,
    19 * RENDERED_TILE,
    16,
  );
  graphics.fillRect(
    3 * RENDERED_TILE,
    2 * RENDERED_TILE,
    16,
    12 * RENDERED_TILE,
  );
  graphics.fillRect(
    21 * RENDERED_TILE,
    2 * RENDERED_TILE,
    16,
    12 * RENDERED_TILE,
  );
  graphics.fillStyle(0xbdbdaf, 1);
  for (let x = 3; x <= 21; x += 2) {
    graphics.fillRect(x * RENDERED_TILE, 2 * RENDERED_TILE - 8, 14, 8);
  }
  graphics.fillRect(
    11 * RENDERED_TILE,
    14 * RENDERED_TILE,
    3 * RENDERED_TILE,
    10,
  );
}

function drawTempleGarden(graphics, seed) {
  graphics.fillStyle(0x0f6c25, 1);
  graphics.fillEllipse(12 * RENDERED_TILE + 16, 8 * RENDERED_TILE, 430, 250);
  graphics.fillStyle(0x57b64a, 1);
  for (let i = 0; i < 22; i++) {
    const x = ((seed + i * 37) % 21) + 2;
    const y = ((seed + i * 19) % 11) + 3;
    graphics.fillCircle(x * RENDERED_TILE + 12, y * RENDERED_TILE + 12, 6);
  }
  graphics.fillStyle(0x5db9d8, 1);
  graphics.fillRect(
    2 * RENDERED_TILE,
    4 * RENDERED_TILE,
    3 * RENDERED_TILE,
    RENDERED_TILE,
  );
  graphics.fillRect(
    20 * RENDERED_TILE,
    5 * RENDERED_TILE,
    3 * RENDERED_TILE,
    RENDERED_TILE,
  );
}

export class SettlementScene extends Phaser.Scene {
  constructor() {
    super("Settlement");
  }

  init(data) {
    this.gameState = data.gameState;
    this.settlementSpawn = data.spawn || data.settlementSpawn;
    this.playerStart = data.playerStart || null;
  }

  create() {
    this.animating = false;
    this.mapW = 25;
    this.mapH = 18;
    this.cameras.main.setBackgroundColor("#000000");
    playMusic("music_overworld");

    const layout = layoutForSettlement(this.settlementSpawn);
    this.layout = layout;
    this.buildings = layout.buildings;
    this.drawTown(layout);

    const start = this.playerStart || layout.start || { x: 12, y: 16 };
    this.playerX = start.x;
    this.playerY = start.y;
    this.playerDir = "up";
    this.nearBuilding = null;
    this.interactPrompt = null;

    const leaderIdx = getLeaderIndex();
    const leader =
      this.gameState?.party?.[leaderIdx] || this.gameState?.party?.[0];
    this.leaderClass = leader?.sprite_id || leader?.class_id || "warrior";
    this.hasWalkSheet = this.textures.exists(walkSheetKey(this.leaderClass));
    this.playerFallbackTexture = this.textures.exists(this.leaderClass)
      ? this.leaderClass
      : "player_up";
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
          walkFrameIndex("up", 0, this.leaderClass),
        )
        .setOrigin(0.5, 1)
        .setScale(walkSpriteScale(RENDERED_TILE, this.leaderClass))
        .setDepth(DEPTH_ACTOR);
    } else {
      this.player = this.add
        .image(playerPos.x, playerPos.y, this.playerFallbackTexture)
        .setOrigin(0.5, 1)
        .setScale(
          this.playerFallbackTexture === this.leaderClass
            ? classPortraitFallbackScale(RENDERED_TILE)
            : fallbackWalkSpriteScale(RENDERED_TILE),
        )
        .setDepth(DEPTH_ACTOR);
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");
    this.input.keyboard.on("keydown-ENTER", () => this.enterBuilding());
    this.input.keyboard.on("keydown-SPACE", () => this.enterBuilding());
    this.input.keyboard.on("keydown-ESC", () => this.exitToWorld());
    initTouchControls(this);

    this.footer = this.add
      .text(
        400,
        582,
        "MOVE  Arrow Keys / WASD     ENTER  Enter building     ESC  World map",
        {
          fontSize: "10px",
          color: "#d7d7cf",
          fontFamily: "monospace",
          backgroundColor: "#101820dd",
          padding: { x: 10, y: 4 },
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_UI);
    this.updateInteractionTargets();
  }

  drawTown(layout) {
    const seed = layout.seed;
    this.ground = this.add.graphics().setDepth(DEPTH_GROUND);
    this.props = this.add.graphics().setDepth(DEPTH_PROP);

    this.ground.fillStyle(layout.kind === "castle" ? 0x3d9340 : 0x19a522, 1);
    this.ground.fillRect(0, 0, 800, 600);
    this.ground.fillStyle(0x0d7a18, 1);
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        if ((x * 17 + y * 13 + seed) % 6 === 0) {
          this.ground.fillRect(
            x * RENDERED_TILE + 7,
            y * RENDERED_TILE + 8,
            3,
            2,
          );
        }
      }
    }

    if (layout.kind === "castle") {
      drawCastleWalls(this.ground);
    } else if (layout.kind === "temple") {
      drawTempleGarden(this.ground, seed);
    }

    for (const road of layout.roads) {
      this.ground.fillStyle(road.color, 1);
      this.ground.fillRect(
        road.x * RENDERED_TILE,
        road.y * RENDERED_TILE,
        road.w * RENDERED_TILE,
        road.h * RENDERED_TILE,
      );
      this.ground.fillStyle(road.highlight, 1);
      this.ground.fillRect(
        road.x * RENDERED_TILE + 2,
        road.y * RENDERED_TILE + 3,
        Math.max(4, road.w * RENDERED_TILE - 4),
        3,
      );
      this.ground.fillStyle(0x75684e, 0.35);
      for (let i = 0; i < road.w * road.h * 2; i++) {
        const rx =
          road.x * RENDERED_TILE + ((seed + i * 17) % (road.w * RENDERED_TILE));
        const ry =
          road.y * RENDERED_TILE + ((seed + i * 31) % (road.h * RENDERED_TILE));
        this.ground.fillRect(rx, ry, 3, 2);
      }
    }

    drawTreeBorder(this.ground, this.mapW, seed);

    for (const building of this.buildings) {
      drawPixelHouse(
        this.props,
        building.x * RENDERED_TILE,
        building.y * RENDERED_TILE,
        building.w,
        building.h,
        building.type,
        building.seed,
      );
      this.add
        .zone(
          building.x * RENDERED_TILE + (building.w * RENDERED_TILE) / 2,
          building.y * RENDERED_TILE + (building.h * RENDERED_TILE) / 2,
          building.w * RENDERED_TILE,
          building.h * RENDERED_TILE,
        )
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          if (this.animating) return;
          this.nearBuilding = building;
          this.enterBuilding();
        });
    }
    drawTownProps(this.props, layout);
  }

  buildingAt(x, y) {
    return this.buildings.find(
      (building) =>
        x >= building.x &&
        x < building.x + building.w &&
        y >= building.y + building.h - 1 &&
        y <= building.y + building.h,
    );
  }

  canWalkTile(x, y) {
    if (x < 0 || y < 0 || x >= this.mapW || y >= this.mapH) return false;
    return !this.buildings.some(
      (building) =>
        x >= building.x &&
        x < building.x + building.w &&
        y >= building.y &&
        y < building.y + building.h,
    );
  }

  update(time) {
    if (this.animating) return;
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;
    if (!left && !right && !up && !down) return;
    if (time - (this.lastMoveTime || 0) < 145) return;
    this.lastMoveTime = time;
    if (left) this.move(-1, 0, "left");
    else if (right) this.move(1, 0, "right");
    else if (up) this.move(0, -1, "up");
    else if (down) this.move(0, 1, "down");
  }

  move(dx, dy, dir) {
    const nx = this.playerX + dx;
    const ny = this.playerY + dy;
    this.playerDir = dir;
    setPlayerWalkFrame(this, WALK_IDLE_FRAME);
    if (!this.canWalkTile(nx, ny)) {
      this.updateInteractionTargets(nx, ny);
      return;
    }
    this.playerX = nx;
    this.playerY = ny;
    const playerPos = walkSpritePosition(nx, ny, RENDERED_TILE);
    const stepMs = walkStepMs();
    this.animating = true;
    this.walkFrameAudit = [];
    const finishStepAnimation = playStepAnimation(this, stepMs, () => {
      this.animating = false;
    });
    this.tweens.add({
      targets: this.player,
      x: playerPos.x,
      y: playerPos.y,
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
    this.updateInteractionTargets();
  }

  updateInteractionTargets(testX = this.playerX, testY = this.playerY) {
    const candidates = [
      [testX, testY - 1],
      [testX, testY],
      [testX - 1, testY],
      [testX + 1, testY],
    ];
    this.nearBuilding = null;
    for (const [x, y] of candidates) {
      const building = this.buildingAt(x, y);
      if (building) {
        this.nearBuilding = building;
        break;
      }
    }
    if (this.nearBuilding) this.showInteractPrompt();
    else this.hideInteractPrompt();
  }

  showInteractPrompt() {
    this.hideInteractPrompt();
    const label = isTouchDevice()
      ? "[ TAP A ] Enter"
      : "[ ENTER / SPACE ] Enter";
    this.interactPrompt = this.add
      .text(this.player.x, this.player.y - 26, label, {
        fontSize: "10px",
        color: "#ffff44",
        fontFamily: "monospace",
        backgroundColor: "#000000cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 1);
  }

  hideInteractPrompt() {
    if (this.interactPrompt) {
      this.interactPrompt.destroy();
      this.interactPrompt = null;
    }
  }

  enterBuilding() {
    if (!this.nearBuilding || this.animating) return;
    this.animating = true;
    playSFX("sfx_door");
    const spawn = buildingInteriorSpawn(
      this.settlementSpawn,
      this.nearBuilding,
    );
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("Town", {
        gameState: this.gameState,
        spawn,
        returnScene: {
          sceneKey: "Settlement",
          settlementSpawn: this.settlementSpawn,
          playerStart: { x: this.playerX, y: this.playerY },
        },
      });
    });
  }

  exitToWorld() {
    if (this.animating) return;
    this.animating = true;
    playSFX("sfx_door");
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("World", { gameState: this.gameState });
    });
  }
}
