/**
 * Touch input system for Kithlands.
 * Virtual D-pad, action button, tap-to-move with A* pathfinding,
 * pinch-to-zoom, and swipe gestures for mobile devices.
 */

import { interactWithDoor } from "../scenes/world_interact.js";
import { toggleMenu } from "../scenes/world_menu.js";
import { toggleCodex } from "../scenes/world_codex.js";
import { toggleMute, isMuted } from "./audio.js";
import { isWorldInputLocked } from "./modalLock.js";
import { TILE_WALKABLE } from "../scenes/tileConstants.js";
import { gameplayViewportLayout } from "./gameplayViewport.js";
const RENDERED_TILE = 32;

let _isTouch = false;
let _controls = null;

export function isTouchDevice() {
  return _isTouch;
}

// ─── A* Pathfinding ───────────────────────────────────────────

function findPath(tileData, sx, sy, ex, ey, mapW, mapH, canWalk) {
  const walkable = canWalk || ((tile) => !!TILE_WALKABLE[tile]);
  if (ex < 0 || ex >= mapW || ey < 0 || ey >= mapH) return null;
  if (!walkable(tileData[ey][ex])) return null;
  if (sx === ex && sy === ey) return [];

  const toKey = (x, y) => x * mapH + y;
  const open = [];
  const closed = new Set();
  const gScore = new Map();
  const parent = new Map();
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  const h = (x, y) => Math.abs(x - ex) + Math.abs(y - ey);

  const sk = toKey(sx, sy);
  gScore.set(sk, 0);
  open.push({ x: sx, y: sy, f: h(sx, sy) });

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const cur = open.splice(bestIdx, 1)[0];
    const ck = toKey(cur.x, cur.y);

    if (cur.x === ex && cur.y === ey) {
      const path = [];
      let k = ck;
      while (k !== undefined && k !== sk) {
        const py = k % mapH;
        const px = (k - py) / mapH;
        path.unshift({ x: px, y: py });
        k = parent.get(k);
      }
      return path.length > 50 ? path.slice(0, 50) : path;
    }

    closed.add(ck);

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx,
        ny = cur.y + dy;
      if (nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) continue;
      if (!walkable(tileData[ny][nx])) continue;
      const nk = toKey(nx, ny);
      if (closed.has(nk)) continue;

      const ng = gScore.get(ck) + 1;
      if (!gScore.has(nk) || ng < gScore.get(nk)) {
        gScore.set(nk, ng);
        parent.set(nk, ck);
        const nf = ng + h(nx, ny);
        const idx = open.findIndex((o) => toKey(o.x, o.y) === nk);
        if (idx >= 0) open[idx].f = nf;
        else open.push({ x: nx, y: ny, f: nf });
      }
    }

    if (closed.size > 2500) return null;
  }

  return null;
}

// ─── Auto-walk ────────────────────────────────────────────────

function startAutoWalk(scene, path) {
  cancelAutoWalk(scene);
  const offsetX = scene.offsetX || 0;
  const offsetY = scene.offsetY || 0;
  const preview = path.map((step) =>
    scene.add
      .circle(
        offsetX + step.x * RENDERED_TILE + RENDERED_TILE / 2,
        offsetY + step.y * RENDERED_TILE + RENDERED_TILE / 2,
        4,
        0xffffff,
        0.3,
      )
      .setDepth(8),
  );

  const controller = { cancelled: false, preview };
  scene._autoWalk = controller;
  controller.done = (async () => {
    for (let idx = 0; idx < path.length; idx += 1) {
      if (controller.cancelled || scene._autoWalk !== controller) return false;
      if (isWorldInputLocked(scene)) {
        cancelAutoWalk(scene);
        return false;
      }
      const step = path[idx];
      const dx = step.x - scene.playerX;
      const dy = step.y - scene.playerY;
      if (Math.abs(dx) + Math.abs(dy) !== 1) {
        cancelAutoWalk(scene);
        return false;
      }
      const priorWorldStep = scene.worldStepDone;
      const requested = scene.tryMove(dx, dy);
      if (requested === false) {
        cancelAutoWalk(scene);
        return false;
      }
      let accepted = true;
      if (scene.worldStepDone && scene.worldStepDone !== priorWorldStep) {
        accepted = await scene.worldStepDone;
      } else if (scene.animating) {
        await new Promise((resolve) => {
          const waitForAnimation = () => {
            if (!scene.animating) {
              resolve();
              return;
            }
            scene.time.delayedCall(16, waitForAnimation);
          };
          waitForAnimation();
        });
      }
      if (
        !accepted ||
        controller.cancelled ||
        scene._autoWalk !== controller ||
        scene.playerX !== step.x ||
        scene.playerY !== step.y
      ) {
        cancelAutoWalk(scene);
        return false;
      }
      if (preview[idx]) {
        preview[idx].destroy();
        preview[idx] = null;
      }
    }
    cancelAutoWalk(scene);
    return true;
  })();
  return controller.done;
}

function cancelAutoWalk(scene) {
  if (!scene._autoWalk) return;
  scene._autoWalk.cancelled = true;
  scene._autoWalk.timer?.remove?.();
  scene._autoWalk.preview.forEach((el) => {
    if (el) el.destroy();
  });
  scene._autoWalk = null;
}

// ─── Tap-to-Move ──────────────────────────────────────────────

function touchLayout(scene) {
  const layout =
    scene.gameplayLayout ||
    gameplayViewportLayout(
      globalThis.innerWidth || 800,
      globalThis.innerHeight || 600,
    );
  if (!scene.explorationHUD || !layout.portrait) return layout;
  // Keep movement above the native footer; use the same offset for hit areas.
  const offset = 150;
  return {
    ...layout,
    dpad: { ...layout.dpad, y: layout.dpad.y - offset },
    action: { ...layout.action, y: layout.action.y - offset },
    controlArea: {
      ...layout.controlArea,
      dpadTop: layout.controlArea.dpadTop - offset,
      dpadBottom: layout.controlArea.dpadBottom - offset,
      actionTop: layout.controlArea.actionTop - offset,
      actionBottom: layout.controlArea.actionBottom - offset,
    },
  };
}

// Renderer-facing logical boundary; overlays share the painted control geometry.
export function touchControlsTop(scene) {
  if (!_isTouch) return null;
  const area = touchLayout(scene).controlArea;
  return Math.min(area.dpadTop, area.actionTop);
}

function isControlArea(scene, x, y) {
  if (!_isTouch) return false;
  const area = touchLayout(scene).controlArea;
  return (
    (x >= area.dpadLeft &&
      x <= area.dpadRight &&
      y >= area.dpadTop &&
      y <= area.dpadBottom) ||
    (x >= area.actionLeft &&
      x <= area.actionRight &&
      y >= area.actionTop &&
      y <= area.actionBottom) ||
    (!scene.explorationHUD &&
      x >= area.touchHudLeft &&
      x <= area.touchHudRight &&
      y >= area.touchHudTop &&
      y <= area.touchHudBottom) ||
    y >= area.footerTop
  );
}

function setupTapToMove(scene) {
  let pendingTap = null;

  scene.input.on("pointerdown", (pointer) => {
    if (isWorldInputLocked(scene)) return;
    if (!scene.tileData) return;
    // The first real touch is reserved for revealing the touch UI. Without
    // this guard it also leaks through as a tap-to-walk command.
    if (pointer.wasTouch && !_isTouch) return;
    if (isControlArea(scene, pointer.x, pointer.y)) return;

    // Cancel any existing auto-walk on new tap
    cancelAutoWalk(scene);

    // If second pointer arrives, this is a pinch — cancel pending tap
    if (scene.input.pointer1?.isDown && scene.input.pointer2?.isDown) {
      if (pendingTap) {
        pendingTap.remove();
        pendingTap = null;
      }
      return;
    }

    // Defer tap processing briefly so a pinch's second finger can cancel it
    if (pendingTap) pendingTap.remove();
    const px = pointer.x,
      py = pointer.y;
    pendingTap = scene.time.delayedCall(80, () => {
      pendingTap = null;
      if (scene.input.pointer2?.isDown) return; // Became a pinch

      const worldPoint = scene.cameras.main.getWorldPoint(px, py);
      const tx = Math.floor(
        (worldPoint.x - (scene.offsetX || 0)) / RENDERED_TILE,
      );
      const ty = Math.floor(
        (worldPoint.y - (scene.offsetY || 0)) / RENDERED_TILE,
      );
      if (tx === scene.playerX && ty === scene.playerY) return;

      const canWalk = scene.canWalkTile
        ? (tile) => scene.canWalkTile(tile)
        : null;
      const path = findPath(
        scene.tileData,
        scene.playerX,
        scene.playerY,
        tx,
        ty,
        scene.mapW ?? scene.roomW,
        scene.mapH ?? scene.roomH,
        canWalk,
      );

      if (path && path.length > 0) {
        startAutoWalk(scene, path);
      } else {
        // Fallback: single step toward tapped direction
        const dx = tx - scene.playerX;
        const dy = ty - scene.playerY;
        if (Math.abs(dx) > Math.abs(dy)) scene.tryMove(dx > 0 ? 1 : -1, 0);
        else if (dy !== 0) scene.tryMove(0, dy > 0 ? 1 : -1);
      }
    });
  });
}

// ─── D-pad ────────────────────────────────────────────────────

function createDpad(scene) {
  const layout = touchLayout(scene).dpad;
  const { x: cx, y: cy, size, offset, radius } = layout;
  const els = _controls.elements;

  const bg = scene.add
    .circle(cx, cy, radius, 0x000000, 0.15)
    .setScrollFactor(0)
    .setDepth(25);
  els.push(bg);

  const directions = [
    { label: "\u25B2", dx: 0, dy: -1, x: cx, y: cy - offset },
    { label: "\u25BC", dx: 0, dy: 1, x: cx, y: cy + offset },
    { label: "\u25C0", dx: -1, dy: 0, x: cx - offset, y: cy },
    { label: "\u25B6", dx: 1, dy: 0, x: cx + offset, y: cy },
  ];

  for (const dir of directions) {
    const btn = scene.add
      .rectangle(dir.x, dir.y, size, size, 0xffffff, 0.15)
      .setScrollFactor(0)
      .setDepth(25)
      .setInteractive();
    const lbl = scene.add
      .text(dir.x, dir.y, dir.label, {
        fontSize: "22px",
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(26)
      .setAlpha(0.35);

    btn.on("pointerdown", () => {
      btn.setFillStyle(0xffffff, 0.35);
      lbl.setAlpha(0.7);
      cancelAutoWalk(scene);
      scene.tryMove(dir.dx, dir.dy);
      if (_controls.moveTimer) _controls.moveTimer.remove();
      _controls.moveTimer = scene.time.addEvent({
        delay: 150,
        loop: true,
        callback: () => {
          if (isWorldInputLocked(scene)) return;
          scene.tryMove(dir.dx, dir.dy);
        },
      });
    });

    const release = () => {
      btn.setFillStyle(0xffffff, 0.15);
      lbl.setAlpha(0.35);
      if (_controls && _controls.moveTimer) {
        _controls.moveTimer.remove();
        _controls.moveTimer = null;
      }
    };
    btn.on("pointerup", release);
    btn.on("pointerout", release);

    els.push(btn, lbl);
  }
}

// ─── Action Button ────────────────────────────────────────────

function createActionButton(scene) {
  const { x, y, radius: r } = touchLayout(scene).action;
  const els = _controls.elements;

  const bg = scene.add
    .circle(x, y, r + 4, 0x000000, 0.15)
    .setScrollFactor(0)
    .setDepth(25);

  const btn = scene.add
    .circle(x, y, r, 0xffc107, 0.2)
    .setScrollFactor(0)
    .setDepth(25)
    .setInteractive();

  const lbl = scene.add
    .text(x, y, "A", {
      fontSize: "26px",
      color: "#ffffff",
      fontFamily: "monospace",
      fontStyle: "bold",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(26)
    .setAlpha(0.45);

  btn.on("pointerdown", () => {
    btn.setFillStyle(0xffc107, 0.45);
    lbl.setAlpha(0.8);
    if (typeof scene.handleAction === "function") scene.handleAction();
    else interactWithDoor(scene);
  });
  const release = () => {
    btn.setFillStyle(0xffc107, 0.2);
    lbl.setAlpha(0.45);
  };
  btn.on("pointerup", release);
  btn.on("pointerout", release);

  els.push(bg, btn, lbl);
}

// ─── Pinch-to-Zoom ───────────────────────────────────────────

function setupPinchZoom(scene) {
  let lastDist = 0;

  scene.input.on("pointermove", () => {
    const p1 = scene.input.pointer1;
    const p2 = scene.input.pointer2;
    if (!p1.isDown || !p2.isDown) {
      lastDist = 0;
      return;
    }

    const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
    if (lastDist === 0) {
      lastDist = dist;
      return;
    }

    const zoom = Phaser.Math.Clamp(
      scene.cameras.main.zoom + (dist - lastDist) * 0.004,
      0.5,
      2.0,
    );
    scene.cameras.main.setZoom(zoom);
    lastDist = dist;
  });

  scene.input.on("pointerup", () => {
    lastDist = 0;
  });
}

// ─── Swipe Gestures ──────────────────────────────────────────

function setupSwipeGestures(scene) {
  let sx = 0,
    sy = 0,
    st = 0,
    spid = -1,
    multiTouch = false;

  scene.input.on("pointerdown", (pointer) => {
    if (!pointer.wasTouch) return;
    if (spid < 0) {
      sx = pointer.x;
      sy = pointer.y;
      st = Date.now();
      spid = pointer.id;
      multiTouch = false;
    } else {
      // Second finger touched — this is a pinch, not a swipe
      multiTouch = true;
    }
  });

  scene.input.on("pointerup", (pointer) => {
    if (pointer.id !== spid) return;
    const wasMulti = multiTouch;
    spid = -1;
    multiTouch = false;
    if (wasMulti || Date.now() - st > 300) return;

    const dx = pointer.x - sx;
    const dy = pointer.y - sy;
    if (Math.abs(dx) < 50 && Math.abs(dy) < 50) return;

    if (Math.abs(dy) > Math.abs(dx) && dy > 0) {
      if (scene.codexOpen) toggleCodex(scene);
      else if (scene.menuOpen) toggleMenu(scene);
    } else if (
      dx > 0 &&
      sx < 40 &&
      !scene.menuOpen &&
      !scene.codexOpen &&
      !scene.animating
    ) {
      toggleMenu(scene);
    }
  });
}

// ─── Touch HUD ───────────────────────────────────────────────

function createTouchHUD(scene) {
  const els = _controls.elements;
  const layout = touchLayout(scene).touchHud;
  const { width: btnW, height: btnH, x, startY, gap } = layout;

  const makeTouchBtn = (y, label, color, handler) => {
    const bg = scene.add
      .rectangle(x, y, btnW, btnH, 0x000000, 0.6)
      .setScrollFactor(0)
      .setDepth(25)
      .setInteractive();
    const txt = scene.add
      .text(x, y, label, {
        fontSize: touchLayout(scene).portrait ? "19px" : "11px",
        color,
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(26);
    bg.on("pointerdown", handler);
    bg.on("pointerover", () => bg.setFillStyle(0x333333, 0.8));
    bg.on("pointerout", () => bg.setFillStyle(0x000000, 0.6));
    els.push(bg, txt);
    return txt;
  };

  makeTouchBtn(startY, "MENU", "#ffcc44", () => toggleMenu(scene));
  makeTouchBtn(startY + btnH + gap, "HELP", "#8888ff", () =>
    toggleCodex(scene),
  );

  const muteTxt = makeTouchBtn(
    startY + (btnH + gap) * 2,
    isMuted() ? "VOL+" : "MUTE",
    "#888888",
    () => {
      const m = toggleMute();
      muteTxt.setText(m ? "VOL+" : "MUTE");
    },
  );
}

// ─── Init / Destroy ──────────────────────────────────────────

export function initTouchControls(scene) {
  _controls = null;
  // Don't use feature detection alone — wait for actual touch event to avoid
  // showing touch UI on touchscreen laptops in desktop mode
  _isTouch = false;

  setupTapToMove(scene);

  // Activate touch UI on first real touch event
  scene.input.on("pointerdown", (pointer) => {
    if (pointer.wasTouch && !_isTouch) {
      _isTouch = true;
      createTouchUI(scene);
      scene.updateInteractionTarget?.();
    }
  });
}

function createTouchUI(scene) {
  _controls = { elements: [], moveTimer: null };
  createDpad(scene);
  createActionButton(scene);
  if (!scene.explorationHUD) createTouchHUD(scene);
  setupPinchZoom(scene);
  setupSwipeGestures(scene);
}

export function destroyTouchControls() {
  if (!_controls) return;
  if (_controls.moveTimer) _controls.moveTimer.remove();
  _controls.elements.forEach((el) => {
    if (el && el.scene) el.destroy();
  });
  _controls = null;
}
