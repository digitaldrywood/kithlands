import {
  buyItem,
  claimChest,
  debugForceEncounter,
  debugForceVictory,
  debugGiveItem,
  debugSetGold,
  debugSetPartyLevels,
  debugSetPartyVitals,
  debugWarpQuest,
  gameAction,
  listSaves as listSavesApi,
  loadSave as loadSaveApi,
  newGame,
  saveGame as saveGameApi,
  updatePartyFormation as updatePartyFormationApi,
} from "./api.js";
import { getCurrentMusicKey, getPlayingSoundKeys } from "./systems/audio.js";
import {
  openCharacterDetail,
  closeCharacterDetail,
} from "./scenes/character_detail.js";
import { showEquipPicker } from "./scenes/world_menu.js";
import {
  walkSheetKey,
  walkFrameIndex,
  WALK_SHEET_CLASS_IDS,
} from "./scenes/walkFrame.js";
import { setLeaderIndex } from "./scenes/world.js";
import { encounterChanceForStep } from "./scenes/worldEncounter.js";

const DIR_DELTAS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

function activeScene(game) {
  const scenes = game.scene.getScenes(true);
  return scenes.length > 0 ? scenes[0] : null;
}

function getScene(game, key) {
  if (!key) return activeScene(game);
  return game.scene.getScene(key);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function defaultGameState() {
  return {
    id: "test-game",
    phase: "world",
    gold: 0,
    potions: 0,
    ethers: 0,
    items: [],
    collected_hidden_items: {},
    equipment: [],
    party: [
      {
        name: "Ayla",
        class_id: "warrior",
        sprite_id: "warrior",
        hp: 1,
        max_hp: 20,
        mp: 0,
        max_mp: 5,
        status: "",
      },
      {
        name: "Bram",
        class_id: "mage",
        sprite_id: "sage",
        hp: 2,
        max_hp: 14,
        mp: 0,
        max_mp: 12,
        status: "",
      },
    ],
  };
}

function waitFor(check, timeoutMs = 5000, intervalMs = 25) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for game state"));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function normalizeKeyEventName(key) {
  if (!key) return "";
  const names = {
    Escape: "ESC",
    Enter: "ENTER",
    " ": "SPACE",
    Space: "SPACE",
    Spacebar: "SPACE",
    Tab: "TAB",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    "`": "BACKTICK",
  };
  return names[key] || String(key).toUpperCase();
}

function clickGameObject(obj) {
  if (!obj || typeof obj.emit !== "function") {
    throw new Error("Interactive game object not found");
  }
  obj.emit("pointerdown");
  obj.emit("pointerup");
}

function applySceneGameState(game, scene, result) {
  if (!scene || !result || result.error) return;
  scene.gameState = result;
  if (typeof scene.updateHUD === "function") scene.updateHUD();

  if (scene.scene?.key === "World" && result.phase === "combat") {
    const encounterTileType =
      scene.tileData?.[scene.playerY]?.[scene.playerX] ?? null;
    scene.scene.start("Battle", { gameState: result, encounterTileType });
    return;
  }
  if (scene.scene?.key === "Battle" && result.phase !== "combat") {
    if (typeof scene.returnFromBattle === "function") {
      scene.returnFromBattle(result);
      return;
    }
    scene.scene.start("World", { gameState: result });
  }
}

function findMenuButtonAt(scene, label, occurrence = 0) {
  if (!scene?.menuGroup) return null;
  let seen = 0;
  for (const entry of scene.menuGroup) {
    if (entry?.label?.text !== label || !entry?.bg) continue;
    if (seen === occurrence) return entry.bg;
    seen += 1;
  }
  return null;
}

function findInteractiveText(scene, text) {
  const matcher = String(text).toLowerCase();
  const children = scene?.children?.list || [];
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i];
    if (
      typeof child?.text === "string" &&
      child.text.toLowerCase().includes(matcher) &&
      child.input?.enabled
    ) {
      return child;
    }
  }
  return findLabeledButton(scene, text);
}

function findLabeledButton(scene, text) {
  const matcher = String(text).toLowerCase();
  const children = scene?.children?.list || [];
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const label = children[i];
    if (typeof label?.text !== "string") continue;
    const labelText = label.text.toLowerCase();
    if (labelText !== matcher && !labelText.includes(matcher)) continue;
    for (let j = children.length - 1; j >= 0; j -= 1) {
      const target = children[j];
      if (
        !target?.input?.enabled ||
        typeof target?.emit !== "function" ||
        typeof target?.x !== "number" ||
        typeof target?.y !== "number"
      ) {
        continue;
      }
      if (
        Math.abs(target.x - label.x) <= 2 &&
        Math.abs(target.y - label.y) <= 2
      ) {
        return target;
      }
    }
  }
  return null;
}

function findFieldMagicRow(scene, text) {
  const matcher = String(text).toLowerCase();
  const rows = scene?.fieldMagicMenuState?.rowObjects || [];
  for (const row of rows) {
    if (typeof row?.row?.label !== "string") continue;
    if (row.row.label.toLowerCase().includes(matcher)) {
      return row.bg;
    }
  }
  return null;
}

function gameObjectCenter(game, obj) {
  if (!obj) {
    return null;
  }
  let x = obj.x;
  let y = obj.y;
  if (typeof obj.getBounds === "function") {
    const bounds = obj.getBounds();
    if (
      bounds &&
      Number.isFinite(bounds.centerX) &&
      Number.isFinite(bounds.centerY)
    ) {
      x = bounds.centerX;
      y = bounds.centerY;
    }
  }
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  const canvas = game?.canvas;
  const rect = canvas?.getBoundingClientRect?.();
  const width = canvas?.width || game?.scale?.width || 0;
  const height = canvas?.height || game?.scale?.height || 0;
  if (!rect || !width || !height) {
    return { x, y };
  }
  return {
    x: rect.left + (x / width) * rect.width,
    y: rect.top + (y / height) * rect.height,
  };
}

function objectBounds(obj) {
  const target = obj?.bg || obj;
  if (!target) return null;
  if (typeof target.getBounds === "function") {
    const bounds = target.getBounds();
    if (
      bounds &&
      Number.isFinite(bounds.left) &&
      Number.isFinite(bounds.right) &&
      Number.isFinite(bounds.top) &&
      Number.isFinite(bounds.bottom)
    ) {
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    }
    if (
      bounds &&
      Number.isFinite(bounds.x) &&
      Number.isFinite(bounds.y) &&
      Number.isFinite(bounds.width) &&
      Number.isFinite(bounds.height)
    ) {
      return {
        left: bounds.x,
        right: bounds.x + bounds.width,
        top: bounds.y,
        bottom: bounds.y + bounds.height,
        width: bounds.width,
        height: bounds.height,
      };
    }
  }

  const width = Number.isFinite(target.width)
    ? target.width
    : Number.isFinite(target.w)
      ? target.w
      : null;
  const height = Number.isFinite(target.height)
    ? target.height
    : Number.isFinite(target.h)
      ? target.h
      : null;
  if (
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  const originX = Number.isFinite(target.originX) ? target.originX : 0.5;
  const originY = Number.isFinite(target.originY) ? target.originY : 0.5;
  return {
    left: target.x - width * originX,
    right: target.x + width * (1 - originX),
    top: target.y - height * originY,
    bottom: target.y + height * (1 - originY),
    width,
    height,
  };
}

function describeObject(entry, index) {
  const target = entry?.bg || entry;
  return {
    index,
    label:
      (typeof entry?.label?.text === "string" && entry.label.text) ||
      (typeof target?.text === "string" && target.text) ||
      target?.name ||
      target?.type ||
      target?.constructor?.name ||
      `entry_${index}`,
    bounds: objectBounds(entry),
    statBarMeta:
      target?.__kithlandsStatBar || entry?.__kithlandsStatBar || null,
    partyMenuMeta:
      target?.__kithlandsPartyMenu || entry?.__kithlandsPartyMenu || null,
    partyMenuActionMeta:
      target?.__kithlandsPartyMenuAction ||
      entry?.__kithlandsPartyMenuAction ||
      null,
    fillColor:
      target?.fillColor ??
      target?.fill ??
      target?.style?.backgroundColor ??
      null,
  };
}

function flattenMenuEntries(menuGroup) {
  const out = [];
  for (const entry of menuGroup || []) {
    if (entry?.bg && entry?.label) {
      out.push(entry.bg, entry.label);
      continue;
    }
    out.push(entry);
  }
  return out;
}

function partyMenuLayoutSnapshot(scene) {
  if (!scene?.menuGroup) return null;
  const flattened = flattenMenuEntries(scene.menuGroup);
  const panel = describeObject(flattened[0], 0);
  const panelBounds = panel.bounds;
  const entries = flattened.map((entry, index) => describeObject(entry, index));
  const statBars = [];

  const outOfBounds = panelBounds
    ? entries.filter((entry) => {
        const bounds = entry.bounds;
        if (!bounds) return false;
        const epsilon = 1;
        return (
          bounds.left < panelBounds.left - epsilon ||
          bounds.right > panelBounds.right + epsilon ||
          bounds.top < panelBounds.top - epsilon ||
          bounds.bottom > panelBounds.bottom + epsilon
        );
      })
    : [];

  const barRects = entries.filter((entry) => {
    const bounds = entry.bounds;
    return (
      bounds &&
      bounds.height >= 6 &&
      bounds.height <= 12 &&
      bounds.width > 0 &&
      Number.isFinite(entry.fillColor)
    );
  });

  const trackEntries = entries.filter(
    (entry) => entry?.statBarMeta?.role === "track" && entry?.bounds,
  );
  for (const track of trackEntries) {
    const prefix = track.statBarMeta.prefix;
    const fill = entries.find(
      (entry) =>
        entry?.statBarMeta?.role === "fill" &&
        entry.statBarMeta.prefix === prefix &&
        entry.bounds &&
        Math.abs(entry.bounds.top - track.bounds.top) <= 6,
    );
    if (!fill?.bounds) continue;
    statBars.push({
      prefix,
      trackWidth: track.bounds.width,
      fillWidth: fill.bounds.width,
      x: track.bounds.left,
      y: track.bounds.top,
    });
  }

  const rowMetrics = entries
    .filter((entry) => entry?.partyMenuMeta?.role === "row")
    .map((row) => {
      const slot = row.partyMenuMeta.slot;
      const classText = entries.find(
        (entry) =>
          entry?.partyMenuMeta?.role === "class_text" &&
          entry.partyMenuMeta.slot === slot,
      );
      const hpTrack = entries.find(
        (entry) =>
          entry?.partyMenuMeta?.role === "stat_bar_track" &&
          entry.partyMenuMeta.slot === slot &&
          entry.partyMenuMeta.prefix === "HP",
      );
      const mpTrack = entries.find(
        (entry) =>
          entry?.partyMenuMeta?.role === "stat_bar_track" &&
          entry.partyMenuMeta.slot === slot &&
          entry.partyMenuMeta.prefix === "MP",
      );
      const xpTrack = entries.find(
        (entry) =>
          entry?.partyMenuMeta?.role === "stat_bar_track" &&
          entry.partyMenuMeta.slot === slot &&
          entry.partyMenuMeta.prefix === "XP",
      );

      return {
        slot,
        classTextBounds: classText?.bounds || null,
        hpTrackBounds: hpTrack?.bounds || null,
        mpTrackBounds: mpTrack?.bounds || null,
        xpTrackBounds: xpTrack?.bounds || null,
        classToHpGap:
          classText?.bounds && hpTrack?.bounds
            ? hpTrack.bounds.top - classText.bounds.bottom
            : null,
        hpToMpGap:
          hpTrack?.bounds && mpTrack?.bounds
            ? mpTrack.bounds.top - hpTrack.bounds.bottom
            : null,
        mpToXpGap:
          mpTrack?.bounds && xpTrack?.bounds
            ? xpTrack.bounds.top - mpTrack.bounds.bottom
            : null,
      };
    });

  return {
    panelBounds,
    entryCount: entries.length,
    outOfBounds,
    barCounts: {
      track: barRects.filter((entry) => entry.fillColor === 0x222244).length,
      hp: barRects.filter((entry) =>
        [0x44ff44, 0xff8800, 0xff0000, 0x333333].includes(entry.fillColor),
      ).length,
      mp: barRects.filter((entry) => entry.fillColor === 0x4488ff).length,
      xp: barRects.filter((entry) => entry.fillColor === 0xffcc44).length,
    },
    labelCounts: {
      hp: entries.filter(
        (entry) =>
          entry?.statBarMeta?.role === "prefix" &&
          entry.statBarMeta.prefix === "HP",
      ).length,
      mp: entries.filter(
        (entry) =>
          entry?.statBarMeta?.role === "prefix" &&
          entry.statBarMeta.prefix === "MP",
      ).length,
      xp: entries.filter(
        (entry) =>
          entry?.statBarMeta?.role === "prefix" &&
          entry.statBarMeta.prefix === "XP",
      ).length,
    },
    statBars,
    rowMetrics,
  };
}

function partyMenuSummary(scene) {
  if (!scene?.menuGroup) return null;
  const flattened = flattenMenuEntries(scene.menuGroup);
  const entries = flattened.map((entry, index) => describeObject(entry, index));

  const rows = entries
    .filter((entry) => entry?.partyMenuMeta?.role === "row")
    .map((entry) => {
      const portrait = entries.find(
        (candidate) =>
          candidate?.partyMenuMeta?.role === "portrait" &&
          candidate.partyMenuMeta.slot === entry.partyMenuMeta.slot,
      );
      return {
        slot: entry.partyMenuMeta.slot,
        fillColor: entry.fillColor,
        bounds: entry.bounds,
        portraitKind: portrait?.partyMenuMeta?.kind || null,
        portraitKey: portrait?.partyMenuMeta?.key || null,
      };
    });

  const actionIcons = entries
    .filter((entry) => entry?.partyMenuActionMeta)
    .map((entry) => ({
      label: entry.partyMenuActionMeta.label,
      kind: entry.partyMenuActionMeta.kind,
      key: entry.partyMenuActionMeta.key || null,
      bounds: entry.bounds,
    }));

  return { rows, actionIcons };
}

function findPartyMenuRow(scene, slot) {
  if (!scene?.menuGroup) return null;
  return flattenMenuEntries(scene.menuGroup).find(
    (entry) =>
      (entry?.bg || entry)?.__kithlandsPartyMenu?.role === "row" &&
      (entry?.bg || entry).__kithlandsPartyMenu.slot === slot,
  );
}

function formationMenuSummary(scene) {
  const state = scene?.formationMenuState;
  if (!state?.rowObjects) return null;
  return {
    rows: state.rowObjects.map((entry) => ({
      slot: entry.slot,
      name: entry.name?.text || null,
      row: state.draftRows?.[entry.slot] || null,
      frontActive: entry.frontBtn?.isActive?.() || false,
      backActive: entry.backBtn?.isActive?.() || false,
    })),
  };
}

function findCharacterDetailSlot(scene, slotLabel) {
  const group = scene?.characterDetailGroup || [];
  const label = group.find((entry) => entry?.text === slotLabel);
  if (!label) return null;
  let best = null;
  for (const entry of group) {
    if (!entry?.input?.enabled) continue;
    if (typeof entry?.x !== "number" || typeof entry?.y !== "number") continue;
    if (Math.abs(entry.x - label.x) > 4) continue;
    if (entry.y <= label.y) continue;
    if (!best || entry.y < best.y) best = entry;
  }
  return best;
}

function canWalk(scene, x, y) {
  const tiles = scene?.tileData || scene?.tiles;
  const width = scene?.mapW ?? scene?.roomW;
  const height = scene?.mapH ?? scene?.roomH;
  if (!tiles || !Number.isFinite(width) || !Number.isFinite(height))
    return false;
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  if (typeof scene.canWalkTile !== "function") return false;
  if (
    Array.isArray(scene?.npcs) &&
    scene.npcs.some((npc) => npc.x === x && npc.y === y)
  ) {
    return false;
  }
  return scene.canWalkTile(tiles[y][x]);
}

function playerPixelPosition(scene, x, y) {
  const offsetX = scene?.offsetX || 0;
  const offsetY = scene?.offsetY || 0;
  return {
    x: offsetX + x * 32 + 16,
    y: offsetY + y * 32 + 16,
  };
}

function sceneObjectsReady(scene, sceneKey, leaderClass = null) {
  if (!scene) return false;
  if (scene.scene?.key !== sceneKey) return false;
  if (scene.sys?.isActive && !scene.sys.isActive()) return false;
  if (!scene.sys?.displayList || !scene.sys?.updateList) return false;
  if (!scene.player || scene.player.active === false) return false;
  if (scene.player.scene !== scene) return false;
  if (!scene.player.texture?.key) return false;
  if (!scene.player.frame) return false;
  if (leaderClass && scene.leaderClass !== leaderClass) return false;
  if (
    scene.hasWalkSheet &&
    !scene.textures.exists(walkSheetKey(scene.leaderClass))
  ) {
    return false;
  }
  if (sceneKey === "World") {
    if (!scene.hudText || scene.hudText.active === false) return false;
    if (scene.hudText.scene !== scene) return false;
    if (!scene.hudFooter || scene.hudFooter.active === false) return false;
    if (scene.hudFooter.scene !== scene) return false;
  }
  return true;
}

function rebuildPlayerSprite(scene) {
  const { x, y } = playerPixelPosition(
    scene,
    scene.playerX || 0,
    scene.playerY || 0,
  );
  scene.player?.destroy?.();
  if (scene.hasWalkSheet) {
    scene.player = scene.add
      .sprite(
        x,
        y,
        walkSheetKey(scene.leaderClass),
        walkFrameIndex(scene.playerDir, scene.walkFrame || 0),
      )
      .setDepth(10)
      .setScale(0.5);
  } else {
    scene.player = scene.add
      .image(x, y, `player_${scene.playerDir}`)
      .setDepth(10);
  }
  if (scene?.scene?.key === "World") {
    scene.cameras?.main?.startFollow?.(scene.player, true, 0.1, 0.1);
  }
}

function setPlayerSprite(scene) {
  if (!scene?.player) return;
  scene.hasWalkSheet = scene.textures.exists(walkSheetKey(scene.leaderClass));
  if (scene.player.scene !== scene) {
    rebuildPlayerSprite(scene);
    return;
  }
  if (scene.hasWalkSheet) {
    scene.player.setTexture(
      walkSheetKey(scene.leaderClass),
      walkFrameIndex(scene.playerDir, scene.walkFrame || 0),
    );
  } else {
    scene.player.setTexture(`player_${scene.playerDir}`);
  }
}

function stopPlayerTweens(scene) {
  scene?.tweens?.killTweensOf(scene.player);
  if (scene?.vehicleIndicator)
    scene.tweens.killTweensOf(scene.vehicleIndicator);
}

function setPlayerTile(scene, x, y) {
  stopPlayerTweens(scene);
  scene.playerX = x;
  scene.playerY = y;
  if (scene.player) {
    const pos = playerPixelPosition(scene, x, y);
    scene.player.x = pos.x;
    scene.player.y = pos.y;
  }
}

function frameHash(scene) {
  const textureKey = scene?.player?.texture?.key;
  const frame = scene?.player?.frame;
  if (!textureKey || !frame) return null;
  const image = frame.source?.image;
  if (!image) return `${textureKey}:${frame.name}`;

  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 16);
  ctx.drawImage(
    image,
    frame.cutX,
    frame.cutY,
    frame.cutWidth,
    frame.cutHeight,
    0,
    0,
    16,
    16,
  );
  const pixels = ctx.getImageData(0, 0, 16, 16).data;
  let hash = 2166136261;
  for (let i = 0; i < pixels.length; i++) {
    hash ^= pixels[i];
    hash = Math.imul(hash, 16777619);
  }
  return `${textureKey}:${hash >>> 0}`;
}

function exportPlayerFrame(scene) {
  const player = scene?.player;
  const frame = player?.frame;
  if (!player || !frame) throw new Error("Scene has no player frame");
  const textureFrame = scene?.textures?.getFrame(
    player.texture.key,
    frame.name,
  );
  const sourceImage = frame?.source?.image || textureFrame?.source?.image;
  if (!sourceImage) throw new Error("Player frame source image unavailable");

  const canvas = document.createElement("canvas");
  canvas.width = frame.cutWidth;
  canvas.height = frame.cutHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    sourceImage,
    frame.cutX,
    frame.cutY,
    frame.cutWidth,
    frame.cutHeight,
    0,
    0,
    frame.cutWidth,
    frame.cutHeight,
  );
  return {
    textureKey: player.texture.key,
    frameName: String(frame.name),
    frameIndex: frame.index ?? Number(frame.name),
    dataUrl: canvas.toDataURL("image/png"),
  };
}

function playerSnapshot(scene, moved) {
  const frame = scene?.player?.frame;
  const rawFrameIndex =
    frame && frame.name !== undefined ? Number(frame.name) : frame?.index;
  const camera = scene?.cameras?.main;
  const screenX =
    typeof scene?.player?.x === "number" && camera
      ? scene.player.x - camera.worldView.x
      : null;
  const screenY =
    typeof scene?.player?.y === "number" && camera
      ? scene.player.y - camera.worldView.y
      : null;
  return {
    moved,
    playerDir: scene?.playerDir || null,
    textureKey: scene?.player?.texture?.key || null,
    frameIndex: Number.isFinite(rawFrameIndex) ? rawFrameIndex : null,
    walkFrame: scene?.walkFrame ?? null,
    hasWalkSheet: !!scene?.hasWalkSheet,
    leaderClass: scene?.leaderClass || null,
    frameHash: frameHash(scene),
    x: scene?.playerX ?? null,
    y: scene?.playerY ?? null,
    screenX,
    screenY,
  };
}

function visibleBattleFxSnapshot(scene) {
  const children = scene?.children?.list || [];
  const taggedCount = (tag) =>
    children.filter(
      (child) =>
        child?._combatFxTag === tag &&
        child.active !== false &&
        child.visible !== false &&
        (child.alpha ?? 1) > 0.01,
    ).length;
  const partyMembers = Object.values(scene?.partySprites || {})
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
    .map((entry) => ({
      name: entry?.name || null,
      slot: entry?.slot ?? null,
      row: entry?.row || null,
      x: entry?.x ?? null,
      y: entry?.y ?? null,
      spriteBounds: objectBounds(entry?.sprite),
      hpBarBounds: objectBounds(entry?.hpBar?.bg),
    }));
  const enemyMembers = Object.values(scene?.enemySprites || {})
    .filter((entry) => entry && !entry.dead && !entry.dying)
    .map((entry) => ({
      id: entry?.id ?? null,
      name: entry?.name || null,
      x: entry?.x ?? null,
      y: entry?.y ?? null,
      spriteBounds: objectBounds(entry?.sprite),
      hpBarBounds: objectBounds(entry?.hpBar?.bg),
    }));

  return {
    actorCursors: taggedCount("actor-cursor"),
    reticles: taggedCount("reticle"),
    tracers: taggedCount("tracer"),
    bursts: taggedCount("burst"),
    cursors: taggedCount("target-cursor"),
    titleCards: taggedCount("title-card"),
    vignetteAlpha: scene?.lowHpVignette?.alpha ?? 0,
    messageWindow: {
      visible: scene?.messageWindow?.container?.visible !== false,
      text: scene?.messageWindow?.getText?.() ?? "",
      ...(scene?.messageWindow?.getLayoutMetrics?.() ?? {}),
    },
    encounterTileType: scene?.encounterTileType ?? null,
    backdropCount: taggedCount("battle-backdrop"),
    groundPlaneCount: taggedCount("ground-plane"),
    shadowCount: taggedCount("combat-shadow"),
    actionPanelCount: taggedCount("action-panel"),
    partyMembers,
    enemyMembers,
    floatingTexts: (scene?.floatingText?.active || [])
      .filter(
        (text) =>
          text?.active !== false &&
          text?.visible !== false &&
          (text?.alpha ?? 1) > 0.01,
      )
      .map((text) => ({
        text: text.text,
        x: text.x ?? null,
        y: text.y ?? null,
        targetKey: text._targetKey || null,
        color: text.style?.color || text.color || null,
        fontSize: text.style?.fontSize || text.fontSize || null,
      })),
  };
}

function findDirectionAuditAnchor(scene) {
  const width = scene?.mapW ?? scene?.roomW;
  const height = scene?.mapH ?? scene?.roomH;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (
        canWalk(scene, x, y) &&
        canWalk(scene, x, y - 1) &&
        canWalk(scene, x, y + 1) &&
        canWalk(scene, x - 1, y) &&
        canWalk(scene, x + 1, y)
      ) {
        return { x, y };
      }
    }
  }
  return null;
}

function findWorldTile(scene, tileID) {
  const tiles = scene?.tileData || [];
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] === tileID) {
        return { x, y, tile: tileID };
      }
    }
  }
  return null;
}

function findCharacterDetailButton(scene, label) {
  const group = scene?.characterDetailGroup || [];
  for (const entry of group) {
    if (entry?.label?.text === label && entry?.bg) return entry.bg;
  }
  return null;
}

function findStraightAuditAnchor(scene, dir, steps) {
  const [dx, dy] = DIR_DELTAS[dir] || [0, 0];
  const width = scene?.mapW ?? scene?.roomW;
  const height = scene?.mapH ?? scene?.roomH;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!canWalk(scene, x, y)) continue;
      let ok = true;
      for (let i = 1; i <= steps; i++) {
        if (!canWalk(scene, x + dx * i, y + dy * i)) {
          ok = false;
          break;
        }
      }
      if (ok) return { x, y };
    }
  }
  return null;
}

function setSceneLeaderClass(scene, classId, sceneKey) {
  if (!WALK_SHEET_CLASS_IDS.includes(classId)) {
    throw new Error(`Unknown walk-sheet class: ${classId}`);
  }
  if (!scene?.gameState) throw new Error("Scene has no game state");

  if (
    !Array.isArray(scene.gameState.party) ||
    scene.gameState.party.length === 0
  ) {
    scene.gameState.party = clone(defaultGameState().party);
  }

  const current = scene.gameState.party[0] || {};
  scene.gameState.party[0] = {
    ...current,
    name: current.name || "Audit",
    class_id: classId,
    sprite_id: classId,
    hp: Math.max(current.hp || 1, 1),
    max_hp: Math.max(current.max_hp || 20, 1),
    status: "",
  };

  if (sceneKey === "World") {
    setLeaderIndex(0);
  }

  scene.leaderClass = classId;
  scene.walkFrame = 0;
  scene.hasWalkSheet = scene.textures.exists(walkSheetKey(classId));
  setPlayerSprite(scene);
  return playerSnapshot(scene, false);
}

function auditGameState(baseState, classId) {
  if (!WALK_SHEET_CLASS_IDS.includes(classId)) {
    throw new Error(`Unknown walk-sheet class: ${classId}`);
  }
  const state = clone(baseState) || defaultGameState();
  if (!Array.isArray(state.party) || state.party.length === 0) {
    state.party = clone(defaultGameState().party);
  }
  const current = state.party[0] || {};
  state.party[0] = {
    ...current,
    name: current.name || "Audit",
    class_id: classId,
    sprite_id: classId,
    hp: Math.max(current.hp || 1, 1),
    max_hp: Math.max(current.max_hp || 20, 1),
    status: "",
  };
  return state;
}

export function installDevTestBridge(game) {
  globalThis.__kithlandsTest = {
    activeSceneKey() {
      return activeScene(game)?.scene?.key || null;
    },

    sceneIsActive(sceneKey) {
      return game.scene.isActive(sceneKey);
    },

    sceneFlags(sceneKey) {
      const scene = getScene(game, sceneKey);
      return {
        menuOpen: !!scene?.menuOpen,
        characterDetailOpen: !!scene?.characterDetailGroup,
        debugPanelOpen: !!scene?.debugPanelOpen,
        fieldMagicOpen: !!scene?.fieldMagicMenuState,
      };
    },

    sceneAuditInfo(sceneKey) {
      const scene = getScene(game, sceneKey);
      return {
        key: scene?.scene?.key || null,
        active: game.scene.isActive(sceneKey),
        hasPlayer: !!scene?.player,
        playerAttached: scene?.player?.scene === scene,
        playerActive: scene?.player?.active ?? null,
        playerTextureKey: scene?.player?.texture?.key || null,
        hasTileData: !!scene?.tileData,
        hasTiles: !!scene?.tiles,
        mapW: scene?.mapW ?? null,
        mapH: scene?.mapH ?? null,
        roomW: scene?.roomW ?? null,
        roomH: scene?.roomH ?? null,
        hasCanWalkTile: typeof scene?.canWalkTile === "function",
        leaderClass: scene?.leaderClass || null,
        hudAttached: scene?.hudText?.scene === scene,
        hudFooterAttached: scene?.hudFooter?.scene === scene,
      };
    },

    gameState(sceneKey) {
      return clone(getScene(game, sceneKey)?.gameState || null);
    },

    audioState(sceneKey) {
      const scene = getScene(game, sceneKey) || activeScene(game);
      return {
        currentMusicKey: getCurrentMusicKey(),
        playingKeys: getPlayingSoundKeys(scene),
      };
    },

    worldEncounterAudit(stepCount = 7, sceneKey = "World") {
      const scene = getScene(game, sceneKey);
      if (!scene?.tileData) throw new Error("World scene is not ready");

      const transportMult =
        scene.gameState?.transport?.encounter_rate_mult ?? 1;
      const path = findWorldTile(scene, 1);
      const grass = findWorldTile(scene, 0);
      const darkGrass = findWorldTile(scene, 9);

      return {
        transportMult,
        stepCount,
        path,
        grass,
        darkGrass,
        chances: {
          path: encounterChanceForStep({ tile: 1, stepCount, transportMult }),
          grass: encounterChanceForStep({ tile: 0, stepCount, transportMult }),
          darkGrass: encounterChanceForStep({
            tile: 9,
            stepCount,
            transportMult,
          }),
        },
      };
    },

    visibleTexts(sceneKey) {
      const scene = getScene(game, sceneKey);
      return (scene?.children?.list || [])
        .filter((child) => typeof child?.text === "string")
        .map((child) => ({
          text: child.text,
          interactive: !!child?.input?.enabled,
        }));
    },

    async startQuickGame(email = `playwright_${Date.now()}@kithlands.dev`) {
      const title = getScene(game, "Title");
      if (!title || typeof title.startGame !== "function") {
        throw new Error("Title scene is not ready");
      }
      await waitFor(() => !!title.statusText);
      await title.startGame({ value: email }, true);
      await this.waitForSceneReady("World");
      return this.gameState("World");
    },

    async startWizardFromTitle(
      email = `playwright_${Date.now()}@kithlands.dev`,
    ) {
      const title = getScene(game, "Title");
      if (!title || typeof title.startGame !== "function") {
        throw new Error("Title scene is not ready");
      }
      await waitFor(() => !!title.statusText);
      await title.startGame({ value: email }, false);
      await waitFor(() => game.scene.isActive("Wizard"));
      await nextFrame();
      await nextFrame();
      return this.sceneAuditInfo("Wizard");
    },

    async startCustomGame(gameData) {
      const result = await newGame(gameData);
      if (result?.error) {
        throw new Error(result.error);
      }
      game.scene.start("World", { gameState: result });
      await this.waitForSceneReady("World");
      return this.gameState("World");
    },

    async waitForSceneReady(sceneKey, leaderClass = null) {
      await waitFor(() => {
        const scene = getScene(game, sceneKey);
        if (!game.scene.isActive(sceneKey)) return false;
        return sceneObjectsReady(scene, sceneKey, leaderClass);
      });
      await nextFrame();
      await nextFrame();
      await nextFrame();
      await waitFor(() => {
        const scene = getScene(game, sceneKey);
        return sceneObjectsReady(scene, sceneKey, leaderClass);
      });
      return this.sceneAuditInfo(sceneKey);
    },

    walkSheetClassIds() {
      return [...WALK_SHEET_CLASS_IDS];
    },

    async debugGiveItem(itemId, qty = 1, sceneKey) {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      const result = await debugGiveItem(gameId, itemId, qty);
      if (!result?.error) {
        applySceneGameState(game, scene, result);
      }
      return clone(result);
    },

    async setGold(gold, sceneKey) {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      const result = await debugSetGold(gameId, gold);
      if (!result?.error) {
        applySceneGameState(game, scene, result);
      }
      return clone(result);
    },

    async setPartyLevels(updates, sceneKey) {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      const result = await debugSetPartyLevels(gameId, updates);
      if (!result?.error) {
        applySceneGameState(game, scene, result);
      }
      return clone(result);
    },

    async buyItem(itemId, itemType, sceneKey) {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      const result = await buyItem(gameId, itemId, itemType);
      if (!result?.error) {
        applySceneGameState(game, scene, result);
      }
      return clone(result);
    },

    async forceEncounter(monsterIds, level = 1, sceneKey = "World") {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      const result = await debugForceEncounter(gameId, monsterIds, level);
      if (!result?.error) {
        applySceneGameState(game, scene, result);
        if (result.phase === "combat") {
          await waitFor(() => game.scene.isActive("Battle"));
          await nextFrame();
        }
      }
      return clone(result);
    },

    async forceVictory(sceneKey = "Battle") {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      const result = await debugForceVictory(gameId);
      let finalResult = result;
      let returnScene = scene?.returnScene || null;
      if (
        !result?.error &&
        scene?.scene?.key === "Battle" &&
        returnScene?.sceneKey === "Town" &&
        result.phase !== "combat" &&
        result.pending_chest_claim
      ) {
        const pending = result.pending_chest_claim;
        const claimed = await claimChest(
          result.id,
          pending.node_id,
          pending.chest_id,
        );
        if (!claimed?.error) {
          finalResult = claimed;
          if (claimed.message) {
            returnScene = { ...returnScene, entryMessage: claimed.message };
          }
        }
      }
      if (!finalResult?.error) {
        if (scene?.scene?.key === "Battle") {
          game.scene.start("Battle", {
            gameState: finalResult,
            returnScene,
          });
          await waitFor(() => game.scene.isActive("Battle"));
          await nextFrame();
          await nextFrame();
        } else {
          applySceneGameState(game, scene, finalResult);
        }
      }
      return clone(finalResult);
    },

    async submitAction(action, sceneKey) {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      const result = await gameAction(gameId, action);
      if (!result?.error) {
        applySceneGameState(game, scene, result);
        if (scene?.scene?.key === "Battle" && result.phase !== "combat") {
          const destination =
            scene.returnScene?.sceneKey === "Town" ? "Town" : "World";
          await this.waitForSceneReady(destination);
        }
      }
      return clone(result);
    },

    async saveGame(name, sceneKey = "World") {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      return clone(await saveGameApi(gameId, name));
    },

    async listSaves() {
      return clone(await listSavesApi());
    },

    async loadSave(saveId) {
      const result = await loadSaveApi(saveId);
      if (!result?.error) {
        game.scene.start("World", { gameState: result });
        await this.waitForSceneReady("World");
      }
      return clone(result);
    },

    async warpQuest(questIdx, sceneKey = "World") {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      const result = await debugWarpQuest(gameId, questIdx);
      if (!result?.error) {
        applySceneGameState(game, scene, result);
      }
      return clone(result);
    },

    battleVisibilitySnapshot(sceneKey = "Battle") {
      const scene = getScene(game, sceneKey);
      if (!scene || scene.scene?.key !== "Battle") {
        throw new Error("Battle scene is not active");
      }
      return visibleBattleFxSnapshot(scene);
    },

    async playBattleVisibilityDemo(kind = "tracer", sceneKey = "Battle") {
      const scene = getScene(game, sceneKey);
      if (!scene || scene.scene?.key !== "Battle") {
        throw new Error("Battle scene is not active");
      }

      const partyEntries = Object.values(scene.partySprites || {}).sort(
        (a, b) => (a.slot ?? 0) - (b.slot ?? 0),
      );
      const enemyEntries = Object.values(scene.enemySprites || {}).filter(
        (entry) => entry && !entry.dead && !entry.dying,
      );
      const partyTarget = partyEntries[0] || null;
      const partyActor =
        partyEntries[Math.min(1, Math.max(0, partyEntries.length - 1))] ||
        partyTarget;
      const enemyActor = enemyEntries[0] || null;
      const enemyTarget =
        enemyEntries[Math.min(1, Math.max(0, enemyEntries.length - 1))] ||
        enemyActor;
      const stamp = Date.now();

      if (kind === "tracer") {
        scene.showActionFocus(enemyActor, partyTarget, {
          tracerColor: 0xff8800,
          targetColor: 0xff6666,
        });
      } else if (kind === "party_hit") {
        scene.showActionFocus(enemyActor, partyTarget, {
          tracerColor: 0xff8800,
          targetColor: 0xff6666,
        });
        scene.hitFx(partyTarget.x, partyTarget.y, 27, true, false, "physical", {
          targetKey: `proof_party_hit_${stamp}`,
          entry: partyTarget,
        });
        scene.playPartyHitReaction(partyTarget, {
          newHP: Math.max(
            1,
            Math.floor((partyTarget.hpBar?.maxHP ?? 100) * 0.2),
          ),
          maxHP: partyTarget.hpBar?.maxHP ?? 100,
        });
      } else if (kind === "floating_text") {
        scene.hitFx(partyTarget.x, partyTarget.y, 34, true, false, "physical", {
          targetKey: `proof_party_number_${stamp}`,
          entry: partyTarget,
        });
        scene.showActionFocus(partyActor, enemyTarget, {
          tracerColor: 0xbb88ff,
          targetColor: 0xbb88ff,
        });
        scene.hitFx(enemyTarget.x, enemyTarget.y, 19, false, false, "magical", {
          targetKey: `proof_magic_number_${stamp}`,
          element: "dark",
          entry: enemyTarget,
        });
      } else if (kind === "message_window") {
        scene.revealLine("Bruno attacks Goblin!", "#ff8844");
      } else if (kind === "wrapped_prompt") {
        scene.promptText
          .setText(
            "Hero's turn -- choose an action, cast a very long spell name, or select a target now!",
          )
          .setColor("#ffff44");
      } else if (kind === "target_cursor") {
        scene.enterTargetingMode();
      } else if (kind === "cinematic_frame") {
        await scene.runCinematicProofFrame();
      } else if (kind === "cinematic") {
        return await scene.runCinematicProofDemo();
      } else {
        throw new Error(`Unknown battle visibility demo: ${kind}`);
      }

      await nextFrame();
      await nextFrame();
      return visibleBattleFxSnapshot(scene);
    },

    async showPartyDamageNumber(damage, sceneKey = "Battle") {
      const scene = getScene(game, sceneKey);
      if (!scene || scene.scene?.key !== "Battle") {
        throw new Error("Battle scene is not active");
      }
      const partyEntries = Object.values(scene.partySprites || {}).sort(
        (a, b) => (a.slot ?? 0) - (b.slot ?? 0),
      );
      const enemyEntries = Object.values(scene.enemySprites || {}).filter(
        (entry) => entry && !entry.dead && !entry.dying,
      );
      const partyTarget = partyEntries[0] || null;
      const enemyActor = enemyEntries[0] || null;
      if (!partyTarget || !enemyActor) {
        throw new Error("Battle scene has no proof targets");
      }
      scene.showActionFocus(enemyActor, partyTarget, {
        tracerColor: 0xff8800,
        targetColor: 0xff6666,
      });
      scene.hitFx(
        partyTarget.x,
        partyTarget.y,
        damage,
        true,
        false,
        "physical",
        {
          targetKey: `proof_party_damage_${Date.now()}`,
          entry: partyTarget,
        },
      );
      await nextFrame();
      await nextFrame();
      return visibleBattleFxSnapshot(scene);
    },

    clickMenuButton(label, sceneKey, occurrence = 0) {
      const scene = getScene(game, sceneKey);
      const button = findMenuButtonAt(scene, label, occurrence);
      if (!button) throw new Error(`Menu button not found: ${label}`);
      clickGameObject(button);
    },

    menuButtonPosition(label, sceneKey, occurrence = 0) {
      const scene = getScene(game, sceneKey);
      return gameObjectCenter(game, findMenuButtonAt(scene, label, occurrence));
    },

    menuButtonEnabled(label, sceneKey) {
      const scene = getScene(game, sceneKey);
      const button = scene?.menuGroup?.find(
        (entry) => entry?.label?.text === label,
      );
      if (!button) return null;
      return typeof button.isEnabled === "function"
        ? button.isEnabled()
        : !!button?.bg?.input?.enabled;
    },

    clickInteractiveText(text, sceneKey) {
      const scene = getScene(game, sceneKey);
      const target = findInteractiveText(scene, text);
      if (!target) throw new Error(`Interactive text not found: ${text}`);
      clickGameObject(target);
    },

    interactiveTextPosition(text, sceneKey) {
      const scene = getScene(game, sceneKey);
      return gameObjectCenter(game, findInteractiveText(scene, text));
    },

    fieldMagicRowPosition(text, sceneKey) {
      const scene = getScene(game, sceneKey);
      return gameObjectCenter(game, findFieldMagicRow(scene, text));
    },

    clickCharacterDetailSlot(slotLabel, sceneKey) {
      const scene = getScene(game, sceneKey);
      const target = findCharacterDetailSlot(scene, slotLabel);
      if (!target) {
        throw new Error(`Character detail slot not found: ${slotLabel}`);
      }
      clickGameObject(target);
    },

    clickCharacterDetailButton(label, sceneKey) {
      const scene = getScene(game, sceneKey);
      const target = findCharacterDetailButton(scene, label);
      if (!target) {
        throw new Error(`Character detail button not found: ${label}`);
      }
      clickGameObject(target);
    },

    openEquipPickerFromCharacterDetail(index, type, sceneKey) {
      const scene = getScene(game, sceneKey);
      closeCharacterDetail(scene);
      showEquipPicker(scene, index, type, {
        returnTo: { type: "character", index },
      });
    },

    openCharacterDetail(index = 0, sceneKey) {
      const scene = getScene(game, sceneKey);
      openCharacterDetail(scene, index);
      return this.sceneFlags(sceneKey);
    },

    partyMenuLayout(sceneKey) {
      const scene = getScene(game, sceneKey);
      return clone(partyMenuLayoutSnapshot(scene));
    },

    partyMenuSummary(sceneKey) {
      const scene = getScene(game, sceneKey);
      return clone(partyMenuSummary(scene));
    },

    formationMenuSummary(sceneKey) {
      const scene = getScene(game, sceneKey);
      return clone(formationMenuSummary(scene));
    },

    clickFormationToggle(slot, row, sceneKey) {
      const scene = getScene(game, sceneKey);
      const entry = scene?.formationMenuState?.rowObjects?.[slot];
      if (!entry) throw new Error(`Formation row not found: ${slot}`);
      const button = row === "back" ? entry.backBtn?.bg : entry.frontBtn?.bg;
      clickGameObject(button);
      return clone(formationMenuSummary(scene));
    },

    saveFormation(sceneKey) {
      const scene = getScene(game, sceneKey);
      const button = scene?.formationMenuState?.saveBtn?.bg;
      if (!button) throw new Error("Formation save button not found");
      clickGameObject(button);
      return true;
    },

    updateFormation(gameId, updates) {
      return updatePartyFormationApi(gameId, updates).then(clone);
    },

    partyMenuRowPosition(slot, sceneKey) {
      const scene = getScene(game, sceneKey);
      return gameObjectCenter(game, findPartyMenuRow(scene, slot));
    },

    messageState(sceneKey) {
      const scene = getScene(game, sceneKey);
      return {
        visible: !!scene?.messageText?.visible,
        text: scene?.messageText?.text || "",
      };
    },

    findDirectionAuditAnchor(sceneKey) {
      const scene = getScene(game, sceneKey);
      return findDirectionAuditAnchor(scene);
    },

    findStraightAuditAnchor(dir, steps = 1, sceneKey) {
      const scene = getScene(game, sceneKey);
      return findStraightAuditAnchor(scene, dir, steps);
    },

    setPlayerFacing(dir, sceneKey) {
      const scene = getScene(game, sceneKey);
      if (!scene?.player) throw new Error("Scene has no player");
      scene.playerDir = dir;
      scene.walkFrame = 0;
      setPlayerSprite(scene);
      return playerSnapshot(scene, false);
    },

    setPlayerTile(x, y, sceneKey) {
      const scene = getScene(game, sceneKey);
      if (!scene?.player) throw new Error("Scene has no player");
      setPlayerTile(scene, x, y);
      return playerSnapshot(scene, false);
    },

    setLeaderClass(classId, sceneKey = "World") {
      const scene = getScene(game, sceneKey);
      if (!scene?.player) throw new Error("Scene has no player");
      return setSceneLeaderClass(scene, classId, sceneKey);
    },

    restartSceneWithLeaderClass(classId, sceneKey = "World") {
      const targetScene = getScene(game, sceneKey);
      const currentScene = targetScene?.gameState
        ? targetScene
        : activeScene(game);
      const gameState = auditGameState(currentScene?.gameState, classId);
      if (sceneKey === "World") {
        setLeaderIndex(0);
        game.scene.start("World", { gameState });
        return clone(gameState);
      }
      const spawn = clone(currentScene?.spawn) || {
        node_id: "walk_audit_house",
        name: "Walk Audit House",
        tags: ["house"],
      };
      game.scene.start("Town", { gameState, spawn });
      return { gameState: clone(gameState), spawn };
    },

    movePlayer(dir, sceneKey) {
      const scene = getScene(game, sceneKey);
      if (!scene?.player || typeof scene.tryMove !== "function") {
        throw new Error("Scene cannot move player");
      }
      const beforeX = scene.playerX;
      const beforeY = scene.playerY;
      const [dx, dy] = DIR_DELTAS[dir] || [0, 0];
      scene.tryMove(dx, dy);
      return playerSnapshot(
        scene,
        beforeX !== scene.playerX || beforeY !== scene.playerY,
      );
    },

    exportPlayerFrame(sceneKey = "World") {
      const scene = getScene(game, sceneKey);
      return exportPlayerFrame(scene);
    },

    setPartyVitals(updates, sceneKey) {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      return debugSetPartyVitals(gameId, updates).then((result) => {
        if (!result?.error) {
          applySceneGameState(game, scene, result);
        }
        return clone(result);
      });
    },

    setPartyVitalsLocal(updates, sceneKey) {
      const scene = getScene(game, sceneKey);
      if (!scene?.gameState?.party) throw new Error("Scene has no party state");
      for (const update of updates || []) {
        const member = scene.gameState.party?.[update.slot];
        if (!member) continue;
        if (Object.hasOwn(update, "hp")) member.hp = update.hp;
        if (Object.hasOwn(update, "mp")) member.mp = update.mp;
        if (Object.hasOwn(update, "status")) member.status = update.status;
      }
      if (typeof scene.updateHUD === "function") scene.updateHUD();
      return this.gameState(sceneKey);
    },

    setPartyStateLocal(party, sceneKey) {
      const scene = getScene(game, sceneKey);
      if (!scene?.gameState) throw new Error("Scene has no game state");
      scene.gameState.party = clone(party || []);
      if (typeof scene.updateHUD === "function") scene.updateHUD();
      return this.gameState(sceneKey);
    },

    startTownScene(spawn, fromSceneKey = "World", sceneData = {}) {
      const scene = getScene(game, fromSceneKey) || activeScene(game);
      const sourceGameState = clone(scene?.gameState) || defaultGameState();
      game.scene.start("Town", {
        ...clone(sceneData),
        gameState: sourceGameState,
        spawn: {
          node_id: "test_house",
          name: "Home",
          tags: ["house"],
          ...spawn,
        },
      });
      return true;
    },

    exitTown(sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene || typeof scene.exitToWorld !== "function") {
        throw new Error("Town scene cannot exit");
      }
      scene.exitToWorld();
      return true;
    },

    startScene(sceneKey, data = {}) {
      if (!sceneKey) throw new Error("sceneKey is required");
      game.scene.start(sceneKey, clone(data));
      return true;
    },

    townNpcPositions(sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene) throw new Error("Town scene is not active");
      return (scene.npcs || []).map((npc) => ({ x: npc.x, y: npc.y }));
    },

    townSnapshot(sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene) throw new Error("Town scene is not active");
      return {
        buildingType: scene.buildingType ?? null,
        templateId: scene.interiorTemplate?.id ?? null,
        floorIndex: scene.floorIndex ?? 0,
        floorCount: scene.interiorTemplate?.floors?.length ?? 0,
        offsetX: scene.offsetX ?? null,
        offsetY: scene.offsetY ?? null,
        roomW: scene.roomW ?? null,
        roomH: scene.roomH ?? null,
        playerX: scene.playerX ?? null,
        playerY: scene.playerY ?? null,
        npcKeys: (scene.npcs || []).map(
          (npc) => npc.image?.texture?.key || null,
        ),
        npcScales: (scene.npcs || []).map((npc) => npc.image?.scaleX ?? null),
        npcDisplayHeights: (scene.npcs || []).map(
          (npc) => npc.image?.displayHeight ?? null,
        ),
        npcPositions: (scene.npcs || []).map((npc) => ({ x: npc.x, y: npc.y })),
        chests: (scene.chests || []).map((chest) => ({
          id: chest.id,
          x: chest.x,
          y: chest.y,
          opened: !!chest.opened,
        })),
        chestAnchors: clone(scene.templateChestAnchors || []),
        stairs: Array.from(scene.stairsByPosition?.values?.() || []).map(
          (stair) => clone(stair),
        ),
        secretWallCount: (scene.tiles || [])
          .flat()
          .filter((tile) => tile === 19).length,
        playerScale: scene.player?.scaleX ?? null,
      };
    },

    teleportTownPlayer(x, y, sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene) throw new Error("Town scene is not active");
      scene.playerX = x;
      scene.playerY = y;
      if (scene.player) {
        scene.player.x = scene.offsetX + x * 32 + 16;
        scene.player.y = scene.offsetY + y * 32 + 16;
      }
      if (typeof scene.updateInteractionTargets === "function") {
        scene.updateInteractionTargets();
      }
      return {
        x: scene.playerX,
        y: scene.playerY,
        nearNpcIndex: scene.nearNpcIndex,
        nearChestId: scene.nearChest?.id || null,
        npcPositions: (scene.npcs || []).map((npc) => ({ x: npc.x, y: npc.y })),
      };
    },

    async interact(sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene || typeof scene.interact !== "function") {
        throw new Error("Scene cannot interact");
      }
      scene.nearHiddenItem = null;
      if (typeof scene.hideSearchPrompt === "function") {
        scene.hideSearchPrompt();
      }
      const pending = scene.interact();
      let settled = false;
      const interval = setInterval(() => {
        if (settled) return;
        scene.input.keyboard.emit("keydown-ENTER");
      }, 200);
      try {
        await pending;
      } finally {
        settled = true;
        clearInterval(interval);
      }
      return this.gameState(sceneKey);
    },

    pressKey(key, sceneKey) {
      const scene = getScene(game, sceneKey) || activeScene(game);
      if (!scene?.input?.keyboard) {
        throw new Error("Scene keyboard is not ready");
      }
      const event = { key };
      scene.input.keyboard.emit("keydown", event);
      const normalized = normalizeKeyEventName(key);
      if (normalized) {
        scene.input.keyboard.emit(`keydown-${normalized}`, event);
      }
      return true;
    },

    beginInteract(sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene || typeof scene.interact !== "function") {
        throw new Error("Scene cannot interact");
      }
      scene.nearHiddenItem = null;
      if (typeof scene.hideSearchPrompt === "function") {
        scene.hideSearchPrompt();
      }
      scene.interact();
      return true;
    },
  };
}
