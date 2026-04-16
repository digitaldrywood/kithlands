import {
  buyItem,
  debugForceEncounter,
  debugGiveItem,
  debugSetPartyVitals,
  gameAction,
  newGame,
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
    scene.scene.start("Battle", { gameState: result });
    return;
  }
  if (scene.scene?.key === "Battle" && result.phase !== "combat") {
    scene.scene.start("World", { gameState: result });
  }
}

function findMenuButton(scene, label) {
  if (!scene?.menuGroup) return null;
  for (const entry of scene.menuGroup) {
    if (entry?.label?.text === label && entry?.bg) return entry.bg;
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

  return {
    reticles: taggedCount("reticle"),
    tracers: taggedCount("tracer"),
    bursts: taggedCount("burst"),
    vignetteAlpha: scene?.lowHpVignette?.alpha ?? 0,
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

    async submitAction(action, sceneKey) {
      const scene = getScene(game, sceneKey);
      const gameId = scene?.gameState?.id;
      if (!gameId) throw new Error("Active scene has no game id");
      const result = await gameAction(gameId, action);
      if (!result?.error) {
        applySceneGameState(game, scene, result);
        if (scene?.scene?.key === "Battle" && result.phase === "world") {
          await this.waitForSceneReady("World");
        }
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
        });
        scene.showActionFocus(partyActor, enemyTarget, {
          tracerColor: 0xbb88ff,
          targetColor: 0xbb88ff,
        });
        scene.hitFx(enemyTarget.x, enemyTarget.y, 19, false, false, "magical", {
          targetKey: `proof_magic_number_${stamp}`,
          element: "dark",
        });
      } else {
        throw new Error(`Unknown battle visibility demo: ${kind}`);
      }

      await nextFrame();
      await nextFrame();
      return visibleBattleFxSnapshot(scene);
    },

    clickMenuButton(label, sceneKey) {
      const scene = getScene(game, sceneKey);
      const button = findMenuButton(scene, label);
      if (!button) throw new Error(`Menu button not found: ${label}`);
      clickGameObject(button);
    },

    menuButtonPosition(label, sceneKey) {
      const scene = getScene(game, sceneKey);
      return gameObjectCenter(game, findMenuButton(scene, label));
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

    startTownScene(spawn, fromSceneKey = "World") {
      const scene = getScene(game, fromSceneKey) || activeScene(game);
      const sourceGameState = clone(scene?.gameState) || defaultGameState();
      game.scene.start("Town", {
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
        offsetX: scene.offsetX ?? null,
        offsetY: scene.offsetY ?? null,
        roomW: scene.roomW ?? null,
        roomH: scene.roomH ?? null,
        npcKeys: (scene.npcs || []).map(
          (npc) => npc.image?.texture?.key || null,
        ),
        npcPositions: (scene.npcs || []).map((npc) => ({ x: npc.x, y: npc.y })),
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
      let closestIdx = -1;
      let closestDist = Infinity;
      for (let i = 0; i < (scene.npcs || []).length; i++) {
        const dist =
          Math.abs(scene.playerX - scene.npcs[i].x) +
          Math.abs(scene.playerY - scene.npcs[i].y);
        if (dist <= 2 && dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }
      if (closestIdx >= 0) {
        scene.nearNpcIndex = closestIdx;
        if (typeof scene.showInteractPrompt === "function") {
          scene.showInteractPrompt();
        }
      } else {
        scene.nearNpcIndex = -1;
        if (typeof scene.hideInteractPrompt === "function") {
          scene.hideInteractPrompt();
        }
      }
      return {
        x: scene.playerX,
        y: scene.playerY,
        nearNpcIndex: scene.nearNpcIndex,
        npcPositions: (scene.npcs || []).map((npc) => ({ x: npc.x, y: npc.y })),
      };
    },

    async interact(sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene || typeof scene.interact !== "function") {
        throw new Error("Scene cannot interact");
      }
      const pending = scene.interact();
      [150, 350, 650, 1000].forEach((delay) => {
        setTimeout(() => scene.input.keyboard.emit("keydown-ENTER"), delay);
      });
      await pending;
      return this.gameState(sceneKey);
    },
  };
}
