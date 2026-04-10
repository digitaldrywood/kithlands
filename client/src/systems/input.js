/**
 * Touch input system for Kithlands.
 * Virtual D-pad, action button, tap-to-move with A* pathfinding,
 * pinch-to-zoom, and swipe gestures for mobile devices.
 */

import { interactWithDoor } from '../scenes/world_interact.js';
import { toggleMenu } from '../scenes/world_menu.js';
import { toggleCodex } from '../scenes/world_codex.js';
import { toggleMute, isMuted } from './audio.js';

// Tile walkability (mirrored from world.js to avoid circular dependency)
const TILE_WALKABLE = {
  0: true, 1: true, 2: false, 3: false, 4: false,
  5: true, 6: true, 7: false, 8: false, 9: true,
  10: false, 11: false, 12: true,
};
const RENDERED_TILE = 32;

let _isTouch = false;
let _controls = null;

export function isTouchDevice() {
  return _isTouch;
}

// ─── A* Pathfinding ───────────────────────────────────────────

function findPath(tileData, sx, sy, ex, ey, mapW, mapH) {
  if (ex < 0 || ex >= mapW || ey < 0 || ey >= mapH) return null;
  if (!TILE_WALKABLE[tileData[ey][ex]]) return null;
  if (sx === ex && sy === ey) return [];

  const toKey = (x, y) => x * mapH + y;
  const open = [];
  const closed = new Set();
  const gScore = new Map();
  const parent = new Map();
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
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
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) continue;
      if (!TILE_WALKABLE[tileData[ny][nx]]) continue;
      const nk = toKey(nx, ny);
      if (closed.has(nk)) continue;

      const ng = gScore.get(ck) + 1;
      if (!gScore.has(nk) || ng < gScore.get(nk)) {
        gScore.set(nk, ng);
        parent.set(nk, ck);
        const nf = ng + h(nx, ny);
        const idx = open.findIndex(o => toKey(o.x, o.y) === nk);
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
  const preview = path.map(step =>
    scene.add.circle(
      step.x * RENDERED_TILE + RENDERED_TILE / 2,
      step.y * RENDERED_TILE + RENDERED_TILE / 2,
      4, 0xffffff, 0.3
    ).setDepth(8)
  );

  let idx = 0;
  const timer = scene.time.addEvent({
    delay: 160,
    loop: true,
    callback: () => {
      if (idx >= path.length || scene.animating || scene.menuOpen ||
          scene.codexOpen || scene.gameOver) {
        cancelAutoWalk(scene);
        return;
      }
      const step = path[idx];
      const dx = step.x - scene.playerX;
      const dy = step.y - scene.playerY;
      if (Math.abs(dx) + Math.abs(dy) !== 1) {
        cancelAutoWalk(scene);
        return;
      }
      scene.tryMove(dx, dy);
      if (preview[idx]) { preview[idx].destroy(); preview[idx] = null; }
      idx++;
      if (idx >= path.length) cancelAutoWalk(scene);
    },
  });

  scene._autoWalk = { timer, preview };
}

function cancelAutoWalk(scene) {
  if (!scene._autoWalk) return;
  scene._autoWalk.timer.remove();
  scene._autoWalk.preview.forEach(el => { if (el) el.destroy(); });
  scene._autoWalk = null;
}

// ─── Tap-to-Move ──────────────────────────────────────────────

function isControlArea(x, y) {
  if (!_isTouch) return false;
  if (x < 175 && y > 395) return true;   // D-pad
  if (x > 675 && y > 440) return true;   // Action button
  if (x > 660 && y < 260) return true;   // Touch HUD
  if (y > 565) return true;              // HUD bar
  return false;
}

function setupTapToMove(scene) {
  let pendingTap = null;

  scene.input.on('pointerdown', (pointer) => {
    if (scene.animating || scene.menuOpen || scene.codexOpen || scene.gameOver) return;
    if (!scene.tileData) return;
    if (isControlArea(pointer.x, pointer.y)) return;

    // Cancel any existing auto-walk on new tap
    cancelAutoWalk(scene);

    // If second pointer arrives, this is a pinch — cancel pending tap
    if (scene.input.pointer1?.isDown && scene.input.pointer2?.isDown) {
      if (pendingTap) { pendingTap.remove(); pendingTap = null; }
      return;
    }

    // Defer tap processing briefly so a pinch's second finger can cancel it
    if (pendingTap) pendingTap.remove();
    const px = pointer.x, py = pointer.y;
    pendingTap = scene.time.delayedCall(80, () => {
      pendingTap = null;
      if (scene.input.pointer2?.isDown) return; // Became a pinch

      const worldPoint = scene.cameras.main.getWorldPoint(px, py);
      const tx = Math.floor(worldPoint.x / RENDERED_TILE);
      const ty = Math.floor(worldPoint.y / RENDERED_TILE);
      if (tx === scene.playerX && ty === scene.playerY) return;

      const path = findPath(scene.tileData, scene.playerX, scene.playerY,
        tx, ty, scene.mapW, scene.mapH);

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
  const cx = 85, cy = 470;
  const size = 58;
  const offset = size + 4;
  const els = _controls.elements;

  const bg = scene.add.circle(cx, cy, 82, 0x000000, 0.15)
    .setScrollFactor(0).setDepth(25);
  els.push(bg);

  const directions = [
    { label: '\u25B2', dx: 0, dy: -1, x: cx, y: cy - offset },
    { label: '\u25BC', dx: 0, dy: 1, x: cx, y: cy + offset },
    { label: '\u25C0', dx: -1, dy: 0, x: cx - offset, y: cy },
    { label: '\u25B6', dx: 1, dy: 0, x: cx + offset, y: cy },
  ];

  for (const dir of directions) {
    const btn = scene.add.rectangle(dir.x, dir.y, size, size, 0xffffff, 0.15)
      .setScrollFactor(0).setDepth(25).setInteractive();
    const lbl = scene.add.text(dir.x, dir.y, dir.label, {
      fontSize: '22px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(26).setAlpha(0.35);

    btn.on('pointerdown', () => {
      btn.setFillStyle(0xffffff, 0.35);
      lbl.setAlpha(0.7);
      cancelAutoWalk(scene);
      scene.tryMove(dir.dx, dir.dy);
      if (_controls.moveTimer) _controls.moveTimer.remove();
      _controls.moveTimer = scene.time.addEvent({
        delay: 150,
        loop: true,
        callback: () => {
          if (scene.animating || scene.menuOpen || scene.codexOpen || scene.gameOver) return;
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
    btn.on('pointerup', release);
    btn.on('pointerout', release);

    els.push(btn, lbl);
  }
}

// ─── Action Button ────────────────────────────────────────────

function createActionButton(scene) {
  const x = 715, y = 480;
  const r = 34;
  const els = _controls.elements;

  const bg = scene.add.circle(x, y, r + 4, 0x000000, 0.15)
    .setScrollFactor(0).setDepth(25);

  const btn = scene.add.circle(x, y, r, 0xffc107, 0.2)
    .setScrollFactor(0).setDepth(25).setInteractive();

  const lbl = scene.add.text(x, y, 'A', {
    fontSize: '26px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(26).setAlpha(0.45);

  btn.on('pointerdown', () => {
    btn.setFillStyle(0xffc107, 0.45);
    lbl.setAlpha(0.8);
    interactWithDoor(scene);
  });
  const release = () => {
    btn.setFillStyle(0xffc107, 0.2);
    lbl.setAlpha(0.45);
  };
  btn.on('pointerup', release);
  btn.on('pointerout', release);

  els.push(bg, btn, lbl);
}

// ─── Pinch-to-Zoom ───────────────────────────────────────────

function setupPinchZoom(scene) {
  let lastDist = 0;

  scene.input.on('pointermove', () => {
    const p1 = scene.input.pointer1;
    const p2 = scene.input.pointer2;
    if (!p1.isDown || !p2.isDown) { lastDist = 0; return; }

    const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
    if (lastDist === 0) { lastDist = dist; return; }

    const zoom = Phaser.Math.Clamp(
      scene.cameras.main.zoom + (dist - lastDist) * 0.004, 0.5, 2.0
    );
    scene.cameras.main.setZoom(zoom);
    lastDist = dist;
  });

  scene.input.on('pointerup', () => { lastDist = 0; });
}

// ─── Swipe Gestures ──────────────────────────────────────────

function setupSwipeGestures(scene) {
  let sx = 0, sy = 0, st = 0, spid = -1, multiTouch = false;

  scene.input.on('pointerdown', (pointer) => {
    if (!pointer.wasTouch) return;
    if (spid < 0) {
      sx = pointer.x; sy = pointer.y; st = Date.now(); spid = pointer.id;
      multiTouch = false;
    } else {
      // Second finger touched — this is a pinch, not a swipe
      multiTouch = true;
    }
  });

  scene.input.on('pointerup', (pointer) => {
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
    } else if (dx > 0 && sx < 40 && !scene.menuOpen && !scene.codexOpen && !scene.animating) {
      toggleMenu(scene);
    }
  });
}

// ─── Touch HUD ───────────────────────────────────────────────

function createTouchHUD(scene) {
  const els = _controls.elements;
  const btnW = 55, btnH = 44;
  const x = 735, startY = 110;
  const gap = 4;

  const makeTouchBtn = (y, label, color, handler) => {
    const bg = scene.add.rectangle(x, y, btnW, btnH, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(25).setInteractive();
    const txt = scene.add.text(x, y, label, {
      fontSize: '11px', color, fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    bg.on('pointerdown', handler);
    bg.on('pointerover', () => bg.setFillStyle(0x333333, 0.8));
    bg.on('pointerout', () => bg.setFillStyle(0x000000, 0.6));
    els.push(bg, txt);
    return txt;
  };

  makeTouchBtn(startY, 'MENU', '#ffcc44', () => toggleMenu(scene));
  makeTouchBtn(startY + btnH + gap, 'HELP', '#8888ff', () => toggleCodex(scene));

  const muteTxt = makeTouchBtn(startY + (btnH + gap) * 2, isMuted() ? 'VOL+' : 'MUTE',
    '#888888', () => {
      const m = toggleMute();
      muteTxt.setText(m ? 'VOL+' : 'MUTE');
    });
}

// ─── Init / Destroy ──────────────────────────────────────────

export function initTouchControls(scene) {
  _controls = null;
  // Don't use feature detection alone — wait for actual touch event to avoid
  // showing touch UI on touchscreen laptops in desktop mode
  _isTouch = false;

  setupTapToMove(scene);

  // Activate touch UI on first real touch event
  scene.input.on('pointerdown', (pointer) => {
    if (pointer.wasTouch && !_isTouch) {
      _isTouch = true;
      createTouchUI(scene);
    }
  });
}

function createTouchUI(scene) {
  _controls = { elements: [], moveTimer: null };
  createDpad(scene);
  createActionButton(scene);
  createTouchHUD(scene);
  setupPinchZoom(scene);
  setupSwipeGestures(scene);
}

export function destroyTouchControls() {
  if (!_controls) return;
  if (_controls.moveTimer) _controls.moveTimer.remove();
  _controls.elements.forEach(el => { if (el && el.scene) el.destroy(); });
  _controls = null;
}
