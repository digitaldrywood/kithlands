import { describe, it, expect, vi } from "vitest";
import { drawPanel, drawButton } from "./panel.js";

// Fake scene shim — Phaser objects are just dumb recorders so we can assert
// on fills, labels, handlers, and lifetime without instantiating Phaser.

function makeRectangle() {
  const handlers = {};
  const rect = {
    __kind: "rect",
    fill: null,
    fillAlpha: null,
    stroke: null,
    strokeWidth: null,
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
  return {
    created: { rects: [], texts: [] },
    add: {
      rectangle(x, y, w, h, fill, alpha) {
        const r = makeRectangle();
        r.x = x;
        r.y = y;
        r.w = w;
        r.h = h;
        r.fill = fill;
        r.fillAlpha = alpha ?? 1;
        this._scene.created.rects.push(r);
        return r;
      },
      text(x, y, str) {
        const t = makeText(str);
        t.x = x;
        t.y = y;
        this._scene.created.texts.push(t);
        return t;
      },
    },
  };
}

function freshScene() {
  const s = makeScene();
  // wire the back-ref so `add.rectangle`/`add.text` can push into created
  s.add._scene = s;
  return s;
}

describe("drawPanel", () => {
  it("creates an interactive bordered rectangle at the requested coords", () => {
    const scene = freshScene();
    const { bg } = drawPanel(scene, 400, 300, 760, 540);
    expect(bg.x).toBe(400);
    expect(bg.y).toBe(300);
    expect(bg.w).toBe(760);
    expect(bg.h).toBe(540);
    expect(bg.interactive).toBe(true);
    expect(bg.stroke).toBe(0x4488ff);
    expect(bg.strokeWidth).toBe(2);
  });

  it("skips setInteractive when interactive=false", () => {
    const scene = freshScene();
    const { bg } = drawPanel(scene, 0, 0, 100, 100, { interactive: false });
    expect(bg.interactive).toBe(false);
  });
});

describe("drawButton", () => {
  it("fires onClick on pointerup after a pointerdown", () => {
    const scene = freshScene();
    const onClick = vi.fn();
    const btn = drawButton(scene, 100, 100, 120, 30, "SAVE", onClick);
    btn.bg.handlers.pointerdown();
    btn.bg.handlers.pointerup();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick on pointerup without a preceding pointerdown", () => {
    const scene = freshScene();
    const onClick = vi.fn();
    const btn = drawButton(scene, 0, 0, 100, 30, "X", onClick);
    btn.bg.handlers.pointerup();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("swallows clicks when disabled and restores them when re-enabled", () => {
    const scene = freshScene();
    const onClick = vi.fn();
    const btn = drawButton(scene, 0, 0, 100, 30, "X", onClick);
    btn.setEnabled(false);
    expect(btn.isEnabled()).toBe(false);
    expect(btn.bg.interactive).toBe(false);
    btn.bg.handlers.pointerdown();
    btn.bg.handlers.pointerup();
    expect(onClick).not.toHaveBeenCalled();

    btn.setEnabled(true);
    expect(btn.bg.interactive).toBe(true);
    btn.bg.handlers.pointerdown();
    btn.bg.handlers.pointerup();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("setLabel updates the underlying text object", () => {
    const scene = freshScene();
    const btn = drawButton(scene, 0, 0, 100, 30, "OFF", () => {});
    btn.setLabel("ON");
    expect(btn.label.text).toBe("ON");
  });

  it("setActive paints the active fill/stroke pair", () => {
    const scene = freshScene();
    const btn = drawButton(scene, 0, 0, 100, 30, "Tab", () => {});
    btn.setActive(true);
    expect(btn.isActive()).toBe(true);
    expect(btn.bg.stroke).toBe(0x88ccff);
    btn.setActive(false);
    expect(btn.bg.stroke).toBe(0x4488ff);
  });

  it("pointerover on an enabled button switches to fillHover", () => {
    const scene = freshScene();
    const btn = drawButton(scene, 0, 0, 100, 30, "X", () => {});
    btn.bg.handlers.pointerover();
    expect(btn.bg.fill).toBe(0x2a4a7a);
  });

  it("pointerover on a disabled button is a no-op", () => {
    const scene = freshScene();
    const btn = drawButton(scene, 0, 0, 100, 30, "X", () => {});
    btn.setEnabled(false);
    const fillBefore = btn.bg.fill;
    btn.bg.handlers.pointerover();
    expect(btn.bg.fill).toBe(fillBefore);
  });

  it("destroy tears down both the bg and label", () => {
    const scene = freshScene();
    const btn = drawButton(scene, 0, 0, 100, 30, "X", () => {});
    btn.destroy();
    expect(btn.bg.destroyed).toBe(true);
    expect(btn.label.destroyed).toBe(true);
  });
});
