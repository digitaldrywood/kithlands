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
    expect(active.strokeThickness).toBe(4);
    expect(active.scaleX).toBeGreaterThan(1);
    expect(scene.tweenCalls[0]).toMatchObject({
      targets: active,
      scaleX: 1,
      scaleY: 1,
      duration: 120,
    });
    expect(scene.tweenCalls[1]).toMatchObject({
      targets: active,
      duration: 1850,
      y: 208,
    });
  });

  it("keeps critical text opaque through a 1.5-second read hold without flashing", async () => {
    const scene = makeScene();
    const pool = new FloatingTextPool(scene);
    await pool.spawn(300, 180, 42, "crit", "enemy_1");
    expect(pool.active[0].text).toBe("CRITICAL\n-42!");
    const fades = scene.tweenCalls.filter((t) => t.alpha !== undefined);
    expect(fades).toHaveLength(1);
    expect(fades[0]).toMatchObject({ alpha: 0, delay: 1500, duration: 600 });
    expect(pool.active[0].alpha).toBe(1);
    fades[0].onComplete();
    expect(pool.active).toHaveLength(0);
  });

  it("keeps defeat below a simultaneous two-line critical on the same target", async () => {
    const pool = new FloatingTextPool(makeScene());
    await pool.spawn(100, 100, 169, "crit", "enemy_1");
    await pool.spawn(100, 152, "DEFEATED!", "defeated", "enemy_1");
    const [critical, defeated] = pool.active;
    expect(defeated.y - critical.y).toBeGreaterThan(64);
  });

  it("labels server-confirmed guards without hiding critical results", async () => {
    const pool = new FloatingTextPool(makeScene());
    await pool.spawn(100, 100, 12, "party_hit", "hero", { guarded: true });
    expect(pool.active[0].text).toBe("GUARD\n-12");
    expect(pool.active[0].color).toBe("#9edcff");
    await pool.spawn(200, 100, 24, "crit", "ally", { guarded: true });
    expect(pool.active[1].text).toBe("CRIT · GUARD\n-24!");
  });

  it("reduced motion holds text still without a bounce", async () => {
    const scene = makeScene();
    scene.reducedBattleMotion = () => true;
    const pool = new FloatingTextPool(scene);
    await pool.spawn(100, 100, 33, "physical", "enemy_1");
    const t = pool.active[0];
    expect(t.scaleX).toBe(1);
    expect(scene.tweenCalls).toHaveLength(2);
    expect(scene.tweenCalls[0].y).toBe(t.y);
    expect(scene.tweenCalls[1].delay).toBeGreaterThanOrEqual(1200);
  });

  it("applies elemental magical colors without dropping the default stroke", async () => {
    const scene = makeScene();
    const pool = new FloatingTextPool(scene);

    await pool.spawn(300, 180, 18, "magical", "enemy_7", {
      element: "fire",
    });

    const active = pool.active[0];
    expect(active.text).toBe("-18");
    expect(active.color).toBe("#ffbb80");
    expect(active.stroke).toBe("#111111");
    expect(active.strokeThickness).toBe(4);
    expect(scene.tweenCalls).toHaveLength(3);
    expect(scene.tweenCalls[1]).toMatchObject({
      targets: active,
      duration: 1750,
    });
  });
});
