import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Math: {
      Between: vi.fn(() => 0),
    },
  },
}));

import { FloatingTextPool } from "./floating_text.js";

function makeText() {
  return {
    active: false,
    visible: false,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    text: "",
    fontSize: 16,
    color: "#ffffff",
    fontStyle: "bold",
    stroke: null,
    strokeThickness: 0,
    x: 0,
    y: 0,
    setOrigin() {
      return this;
    },
    setDepth(depth) {
      this.depth = depth;
      return this;
    },
    setActive(active) {
      this.active = active;
      return this;
    },
    setVisible(visible) {
      this.visible = visible;
      return this;
    },
    setShadow(x, y, color, blur) {
      this.shadow = { x, y, color, blur };
      return this;
    },
    setText(text) {
      this.text = text;
      return this;
    },
    setAlpha(alpha) {
      this.alpha = alpha;
      return this;
    },
    setScale(scaleX, scaleY = scaleX) {
      this.scaleX = scaleX;
      this.scaleY = scaleY;
      return this;
    },
    setFontSize(fontSize) {
      this.fontSize = fontSize;
      return this;
    },
    setColor(color) {
      this.color = color;
      return this;
    },
    setFontStyle(fontStyle) {
      this.fontStyle = fontStyle;
      return this;
    },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
      return this;
    },
    setStroke(stroke, strokeThickness) {
      this.stroke = stroke;
      this.strokeThickness = strokeThickness;
      return this;
    },
  };
}

function makeScene() {
  const texts = [];
  const tweenCalls = [];
  return {
    texts,
    tweenCalls,
    add: {
      text() {
        const text = makeText();
        texts.push(text);
        return text;
      },
    },
    tweens: {
      add(config) {
        tweenCalls.push(config);
        return config;
      },
      killTweensOf() {},
    },
    time: {
      delayedCall(_ms, cb) {
        cb();
      },
    },
  };
}

describe("FloatingTextPool", () => {
  it("renders party-hit numbers larger with a dark stroke and bounce tween", async () => {
    const scene = makeScene();
    const pool = new FloatingTextPool(scene);

    await pool.spawn(120, 240, 33, "party_hit", "party_A");

    const active = pool.active[0];
    expect(active.text).toBe("-33");
    expect(active.fontSize).toBe(26);
    expect(active.color).toBe("#ff8800");
    expect(active.stroke).toBe("#140808");
    expect(active.strokeThickness).toBe(2);
    expect(active.scaleX).toBeGreaterThan(1);
    expect(scene.tweenCalls[0]).toMatchObject({
      targets: active,
      scaleX: 1,
      scaleY: 1,
      duration: 120,
    });
    expect(scene.tweenCalls[1]).toMatchObject({
      targets: active,
      alpha: 0,
      duration: 1080,
      y: 174,
    });
  });

  it("applies elemental magical colors without dropping the default stroke", async () => {
    const scene = makeScene();
    const pool = new FloatingTextPool(scene);

    await pool.spawn(300, 180, 18, "magical", "enemy_7", {
      element: "fire",
    });

    const active = pool.active[0];
    expect(active.text).toBe("-18");
    expect(active.color).toBe("#ff4444");
    expect(active.stroke).toBe("#111111");
    expect(active.strokeThickness).toBe(2);
    expect(scene.tweenCalls).toHaveLength(2);
    expect(scene.tweenCalls[1]).toMatchObject({
      targets: active,
      alpha: 0,
      duration: 960,
    });
  });
});
