import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub `./world_menu.js` before importing options — options imports
// toggleMenu which otherwise drags the whole world-menu graph (api, audio,
// world_interact, character_detail, ...) into the test runner.
vi.mock("./world_menu.js", () => ({
  toggleMenu: vi.fn(),
}));

import { showOptions } from "./options.js";
import { toggleMenu } from "./world_menu.js";
import {
  setBattleSpeed,
  setMessageSpeed,
  setWalkSpeed,
  getBattleSpeed,
  getMessageSpeed,
  getWalkSpeed,
} from "../systems/prefs.js";
import { barFillWidth } from "../systems/hpBar.js";

// Fake Phaser scene — same dumb-recorder pattern as panel.test.js, extended
// with an input.keyboard stub that captures handlers so tests can fire them
// synchronously.

function makeRectangle() {
  const handlers = {};
  const rect = {
    __kind: "rect",
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    fill: null,
    fillAlpha: null,
    stroke: null,
    strokeWidth: null,
    visible: true,
    interactive: false,
    destroyed: false,
    handlers,
    setFillStyle(fill, alpha) {
      rect.fill = fill;
      if (alpha !== undefined) rect.fillAlpha = alpha;
      return rect;
    },
    setStrokeStyle(width, color) {
      rect.strokeWidth = width;
      rect.stroke = color;
      return rect;
    },
    setScrollFactor() {
      return rect;
    },
    setDepth() {
      return rect;
    },
    setInteractive() {
      rect.interactive = true;
      return rect;
    },
    disableInteractive() {
      rect.interactive = false;
      return rect;
    },
    setOrigin(ox, oy) {
      rect.originX = ox;
      rect.originY = oy;
      return rect;
    },
    setSize(w, h) {
      rect.w = w;
      rect.h = h;
      return rect;
    },
    setVisible(v) {
      rect.visible = !!v;
      return rect;
    },
    on(event, fn) {
      handlers[event] = fn;
      return rect;
    },
    destroy() {
      rect.destroyed = true;
    },
  };
  return rect;
}

function makeText(initial) {
  const t = {
    __kind: "text",
    text: initial,
    color: null,
    destroyed: false,
    setOrigin() {
      return t;
    },
    setScrollFactor() {
      return t;
    },
    setDepth() {
      return t;
    },
    setText(next) {
      t.text = next;
      return t;
    },
    setColor(c) {
      t.color = c;
      return t;
    },
    destroy() {
      t.destroyed = true;
    },
  };
  return t;
}

function makeScene() {
  const keyHandlers = { on: {}, once: {} };
  const scene = {
    created: { rects: [], texts: [] },
    input: {
      keyboard: {
        on(event, fn) {
          keyHandlers.on[event] = fn;
        },
        off(event, fn) {
          if (keyHandlers.on[event] === fn) delete keyHandlers.on[event];
          if (keyHandlers.once[event] === fn) delete keyHandlers.once[event];
        },
        once(event, fn) {
          keyHandlers.once[event] = fn;
        },
      },
    },
    keyHandlers,
    add: {
      rectangle(x, y, w, h, fill, alpha) {
        const r = makeRectangle();
        r.x = x;
        r.y = y;
        r.w = w;
        r.h = h;
        r.fill = fill;
        r.fillAlpha = alpha ?? 1;
        scene.created.rects.push(r);
        return r;
      },
      text(x, y, str) {
        const t = makeText(str);
        t.x = x;
        t.y = y;
        scene.created.texts.push(t);
        return t;
      },
    },
  };
  return scene;
}

// In-memory localStorage shim. Real prefs.js caches the loaded blob in a
// module-scoped variable, so tests MUST go through the prefs API (not raw
// localStorage) to stay in sync with that cache. We only stub localStorage
// to keep prefs.save() from throwing in node.
function stubLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  stubLocalStorage();
  // Reset to mid-range known values through the cached prefs API.
  setBattleSpeed(3);
  setMessageSpeed(3);
  setWalkSpeed(2);
  toggleMenu.mockClear();
});

describe("showOptions overlay", () => {
  it("renders three rows with label text, progress bar, and cur/max", () => {
    const scene = makeScene();
    const handle = showOptions(scene);

    expect(handle.rowHandles).toHaveLength(3);

    const labels = scene.created.texts.map((t) => t.text);
    expect(labels).toContain("BATTLE SPEED");
    expect(labels).toContain("MESSAGE SPEED");
    expect(labels).toContain("WALK SPEED");
    expect(labels).toContain("3/6"); // battle + message
    expect(labels).toContain("2/3"); // walk
  });

  it("plus button increments value, persists, and updates the bar + label", () => {
    const scene = makeScene();
    const handle = showOptions(scene);
    const battle = handle.rowHandles[0];

    // onClick fires on pointerup after a pointerdown.
    battle.incBtn.bg.handlers.pointerdown();
    battle.incBtn.bg.handlers.pointerup();

    expect(getBattleSpeed()).toBe(4);
    expect(battle.bar.label.text).toBe("4/6");
    expect(battle.bar.fill.w).toBe(barFillWidth(4, 6, 200));
  });

  it("minus button decrements value, persists, and updates the bar + label", () => {
    const scene = makeScene();
    const handle = showOptions(scene);
    const message = handle.rowHandles[1];

    message.decBtn.bg.handlers.pointerdown();
    message.decBtn.bg.handlers.pointerup();

    expect(getMessageSpeed()).toBe(2);
    expect(message.bar.label.text).toBe("2/6");
    expect(message.bar.fill.w).toBe(barFillWidth(2, 6, 200));
  });

  it("plus button is disabled when value is at max", () => {
    setBattleSpeed(6);
    const scene = makeScene();
    const handle = showOptions(scene);
    const battle = handle.rowHandles[0];

    expect(battle.incBtn.isEnabled()).toBe(false);
    // Clicks are swallowed — drawButton disableInteractive path.
    battle.incBtn.bg.handlers.pointerdown();
    battle.incBtn.bg.handlers.pointerup();
    expect(getBattleSpeed()).toBe(6);
  });

  it("minus button is disabled when value is at min", () => {
    setWalkSpeed(1);
    const scene = makeScene();
    const handle = showOptions(scene);
    const walk = handle.rowHandles[2];

    expect(walk.decBtn.isEnabled()).toBe(false);
    walk.decBtn.bg.handlers.pointerdown();
    walk.decBtn.bg.handlers.pointerup();
    expect(getWalkSpeed()).toBe(1);
  });

  it("re-enables buttons after stepping away from a bound", () => {
    setBattleSpeed(6);
    const scene = makeScene();
    const handle = showOptions(scene);
    const battle = handle.rowHandles[0];

    expect(battle.incBtn.isEnabled()).toBe(false);
    expect(battle.decBtn.isEnabled()).toBe(true);

    battle.decBtn.bg.handlers.pointerdown();
    battle.decBtn.bg.handlers.pointerup();

    expect(getBattleSpeed()).toBe(5);
    expect(battle.incBtn.isEnabled()).toBe(true);
  });

  it("progress bar fill width matches barFillWidth across the range", () => {
    const scene = makeScene();
    const handle = showOptions(scene);
    const walk = handle.rowHandles[2]; // max 3, starts at 2

    expect(walk.bar.fill.w).toBe(barFillWidth(2, 3, 200));
    handle.nudge(2, +1);
    expect(walk.bar.fill.w).toBe(barFillWidth(3, 3, 200));
    expect(walk.bar.fill.w).toBe(200);
    handle.nudge(2, -1);
    handle.nudge(2, -1);
    expect(walk.bar.fill.w).toBe(barFillWidth(1, 3, 200));
  });

  it("persisted value survives a close + reopen cycle", () => {
    const scene1 = makeScene();
    const h1 = showOptions(scene1);
    h1.rowHandles[0].incBtn.bg.handlers.pointerdown();
    h1.rowHandles[0].incBtn.bg.handlers.pointerup();
    h1.rowHandles[0].incBtn.bg.handlers.pointerdown();
    h1.rowHandles[0].incBtn.bg.handlers.pointerup();
    expect(getBattleSpeed()).toBe(5);
    h1.close();

    // Reopen on a fresh scene. New bar should read the persisted value.
    const scene2 = makeScene();
    const h2 = showOptions(scene2);
    expect(h2.rowHandles[0].bar.label.text).toBe("5/6");
    expect(h2.rowHandles[0].bar.fill.w).toBe(barFillWidth(5, 6, 200));
  });

  it("ESC handler destroys overlay objects and reopens the party menu", () => {
    const scene = makeScene();
    const handle = showOptions(scene);

    const esc = scene.keyHandlers.once["keydown-ESC"];
    expect(typeof esc).toBe("function");
    esc();

    // Bars, buttons, text, and panel should all be destroyed.
    expect(handle.rowHandles[0].bar.track.destroyed).toBe(true);
    expect(handle.rowHandles[0].bar.fill.destroyed).toBe(true);
    expect(handle.rowHandles[0].bar.label.destroyed).toBe(true);
    expect(handle.rowHandles[0].incBtn.bg.destroyed).toBe(true);
    expect(handle.rowHandles[0].decBtn.bg.destroyed).toBe(true);

    // Arrow-key handlers are torn down.
    expect(scene.keyHandlers.on["keydown-LEFT"]).toBeUndefined();
    expect(scene.keyHandlers.on["keydown-RIGHT"]).toBeUndefined();
    expect(scene.keyHandlers.on["keydown-UP"]).toBeUndefined();
    expect(scene.keyHandlers.on["keydown-DOWN"]).toBeUndefined();

    // Party menu reopens — regression guard for issue #129 flow.
    expect(toggleMenu).toHaveBeenCalledTimes(1);
  });

  it("ESC handler unlocks world input via resumeWorldFor", () => {
    const scene = makeScene();
    const handle = showOptions(scene);
    // showOptions calls pauseWorldFor under the hood; locks set initialized.
    expect(scene._modalLocks.has("options")).toBe(true);
    handle.close();
    expect(scene._modalLocks.has("options")).toBe(false);
  });

  it("keyboard LEFT/RIGHT nudges the focused row, UP/DOWN moves focus", () => {
    const scene = makeScene();
    const handle = showOptions(scene);

    // Default focus = 0 (battle). RIGHT increments battle.
    scene.keyHandlers.on["keydown-RIGHT"]();
    expect(getBattleSpeed()).toBe(4);
    expect(handle.rowHandles[0].bar.label.text).toBe("4/6");

    // DOWN moves focus to message row. LEFT decrements message.
    scene.keyHandlers.on["keydown-DOWN"]();
    scene.keyHandlers.on["keydown-LEFT"]();
    expect(getMessageSpeed()).toBe(2);
    expect(handle.rowHandles[1].bar.label.text).toBe("2/6");

    // UP wraps back to battle (2 -> 1 -> 0).
    scene.keyHandlers.on["keydown-UP"]();
    scene.keyHandlers.on["keydown-LEFT"]();
    expect(getBattleSpeed()).toBe(3);
  });

  it("focused row's bar has the focus stroke color", () => {
    const scene = makeScene();
    const handle = showOptions(scene);

    expect(handle.rowHandles[0].bar.isFocused()).toBe(true);
    expect(handle.rowHandles[1].bar.isFocused()).toBe(false);

    scene.keyHandlers.on["keydown-DOWN"]();
    expect(handle.rowHandles[0].bar.isFocused()).toBe(false);
    expect(handle.rowHandles[1].bar.isFocused()).toBe(true);
  });

  it("hovering a bar moves focus to that row", () => {
    const scene = makeScene();
    const handle = showOptions(scene);

    handle.rowHandles[2].bar.track.handlers.pointerover();
    expect(handle.rowHandles[2].bar.isFocused()).toBe(true);
    expect(handle.rowHandles[0].bar.isFocused()).toBe(false);
  });
});
