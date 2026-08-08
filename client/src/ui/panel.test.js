import { describe, it, expect, vi } from "vitest";
import {
  drawPanel,
  drawButton,
  drawProgressBar,
  drawLabeledStatBar,
} from "./panel.js";
import { barFillWidth } from "../systems/hpBar.js";

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
  rect.visible = true;
  return rect;
}

function makeText(initial) {
  const handlers = {};
  const t = {
    __kind: "text",
    text: initial,
    color: null,
    interactive: false,
    destroyed: false,
    handlers,
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
    setInteractive() {
      t.interactive = true;
      return t;
    },
    disableInteractive() {
      t.interactive = false;
      return t;
    },
    on(event, fn) {
      handlers[event] = fn;
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

  it("fires onClick when the visible label is clicked", () => {
    const scene = freshScene();
    const onClick = vi.fn();
    const btn = drawButton(scene, 100, 100, 120, 30, ">", onClick);
    btn.label.handlers.pointerdown();
    btn.label.handlers.pointerup();
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
    expect(btn.label.interactive).toBe(false);
    btn.bg.handlers.pointerdown();
    btn.bg.handlers.pointerup();
    expect(onClick).not.toHaveBeenCalled();

    btn.setEnabled(true);
    expect(btn.bg.interactive).toBe(true);
    expect(btn.label.interactive).toBe(true);
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

describe("drawProgressBar", () => {
  it("creates a track + fill rect and a cur/max text label", () => {
    const scene = freshScene();
    const bar = drawProgressBar(scene, 100, 200, 200, 14, 3, 6);
    expect(bar.track).toBeDefined();
    expect(bar.fill).toBeDefined();
    expect(bar.label).toBeDefined();
    expect(bar.track.w).toBe(200);
    expect(bar.track.h).toBe(14);
    expect(bar.track.originX).toBe(0);
    expect(bar.fill.originX).toBe(0);
    expect(bar.label.text).toBe("3/6");
  });

  it("fill width matches barFillWidth for the initial value", () => {
    const scene = freshScene();
    const bar = drawProgressBar(scene, 0, 0, 200, 14, 3, 6);
    expect(bar.fill.w).toBe(barFillWidth(3, 6, 200));
  });

  it("at max value, fill width equals full track width", () => {
    const scene = freshScene();
    const bar = drawProgressBar(scene, 0, 0, 200, 14, 6, 6);
    expect(bar.fill.w).toBe(200);
    expect(bar.label.text).toBe("6/6");
  });

  it("at zero value, fill is hidden", () => {
    const scene = freshScene();
    const bar = drawProgressBar(scene, 0, 0, 200, 14, 0, 6);
    expect(bar.fill.visible).toBe(false);
    expect(bar.label.text).toBe("0/6");
  });

  it("setValue updates fill width and label text", () => {
    const scene = freshScene();
    const bar = drawProgressBar(scene, 0, 0, 200, 14, 2, 6);
    bar.setValue(5);
    expect(bar.fill.w).toBe(barFillWidth(5, 6, 200));
    expect(bar.label.text).toBe("5/6");
    bar.setValue(1);
    expect(bar.fill.w).toBe(barFillWidth(1, 6, 200));
    expect(bar.label.text).toBe("1/6");
  });

  it("setFocused swaps the track stroke color", () => {
    const scene = freshScene();
    const bar = drawProgressBar(scene, 0, 0, 200, 14, 3, 6);
    expect(bar.track.stroke).toBe(0x4488ff);
    bar.setFocused(true);
    expect(bar.track.stroke).toBe(0xffcc44);
    expect(bar.isFocused()).toBe(true);
    bar.setFocused(false);
    expect(bar.track.stroke).toBe(0x4488ff);
    expect(bar.isFocused()).toBe(false);
  });

  it("destroy tears down track, fill, and label together", () => {
    const scene = freshScene();
    const bar = drawProgressBar(scene, 0, 0, 200, 14, 3, 6);
    bar.destroy();
    expect(bar.track.destroyed).toBe(true);
    expect(bar.fill.destroyed).toBe(true);
    expect(bar.label.destroyed).toBe(true);
  });

  it("omits the label when showLabel is false", () => {
    const scene = freshScene();
    const bar = drawProgressBar(scene, 0, 0, 200, 14, 3, 6, {
      showLabel: false,
    });
    expect(bar.label).toBe(null);
    expect(() => bar.setValue(4)).not.toThrow();
    expect(() => bar.destroy()).not.toThrow();
  });

  it("walk-speed bar (max 3) tracks fill width correctly across its range", () => {
    const scene = freshScene();
    const bar = drawProgressBar(scene, 0, 0, 200, 14, 1, 3);
    expect(bar.fill.w).toBe(barFillWidth(1, 3, 200));
    bar.setValue(2);
    expect(bar.fill.w).toBe(barFillWidth(2, 3, 200));
    bar.setValue(3);
    expect(bar.fill.w).toBe(200);
    expect(bar.label.text).toBe("3/3");
  });
});

describe("drawLabeledStatBar", () => {
  it("creates prefix/value labels and a fixed-width track", () => {
    const scene = freshScene();
    const bar = drawLabeledStatBar(scene, 40, 80, 260, 18, 30, "HP", {
      fill: 0x44ff44,
      labelColor: "#44ff44",
    });

    expect(bar.prefixLabel.text).toBe("HP");
    expect(bar.prefixLabel.color).toBe("#44ff44");
    expect(bar.track.w).toBe(178);
    expect(bar.fill.w).toBe(barFillWidth(18, 30, 178));
    expect(bar.valueLabel.text).toBe("18/30");
    expect(bar.track.__kithlandsStatBar).toEqual({
      prefix: "HP",
      role: "track",
    });
  });

  it("hides the fill when the current value is zero", () => {
    const scene = freshScene();
    const bar = drawLabeledStatBar(scene, 0, 0, 200, 0, 10, "MP");

    expect(bar.fill.visible).toBe(false);
    expect(bar.valueLabel.text).toBe("0/10");
  });

  it("supports a custom value label and tears down all objects", () => {
    const scene = freshScene();
    const bar = drawLabeledStatBar(scene, 0, 0, 220, 0, 0, "MP", {
      valueText: "\u2014",
    });

    expect(bar.valueLabel.text).toBe("\u2014");
    bar.destroy();
    expect(bar.prefixLabel.destroyed).toBe(true);
    expect(bar.track.destroyed).toBe(true);
    expect(bar.fill.destroyed).toBe(true);
    expect(bar.valueLabel.destroyed).toBe(true);
  });
});
