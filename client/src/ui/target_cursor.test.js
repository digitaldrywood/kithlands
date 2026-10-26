import { describe, expect, it } from "vitest";

import { TargetCursor } from "./target_cursor.js";

function makeDisplayObject() {
  return {
    visible: false,
    x: 0,
    y: 0,
    tint: null,
    flipX: false,
    setOrigin() {
      return this;
    },
    setDepth(depth) {
      this.depth = depth;
      return this;
    },
    setScale(scale) {
      this.scale = scale;
      return this;
    },
    setVisible(visible) {
      this.visible = visible;
      return this;
    },
    setAlpha(alpha) {
      this.alpha = alpha;
      return this;
    },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
      return this;
    },
    setColor(color) {
      this.color = color;
      return this;
    },
    setText(text) {
      this.text = text;
      return this;
    },
    clear() {
      this.commands = [];
      return this;
    },
    lineStyle(...args) {
      this.commands.push(["lineStyle", ...args]);
      return this;
    },
    strokeEllipse(...args) {
      this.commands.push(["strokeEllipse", ...args]);
      return this;
    },
    fillStyle(...args) {
      this.commands.push(["fillStyle", ...args]);
      return this;
    },
    fillTriangle(...args) {
      this.commands.push(["fillTriangle", ...args]);
      return this;
    },
    lineBetween(...args) {
      this.commands.push(["lineBetween", ...args]);
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function makeScene() {
  const tweenCalls = [];
  return {
    tweenCalls,
    add: {
      graphics() {
        return makeDisplayObject();
      },
      text(_x, _y, text) {
        return { ...makeDisplayObject(), text };
      },
    },
    tweens: {
      add(config) {
        tweenCalls.push(config);
        return {
          stop() {},
        };
      },
      killTweensOf() {},
    },
  };
}

describe("TargetCursor", () => {
  it("places the target arrow and label above a measured enemy name", () => {
    const cursor = new TargetCursor(makeScene());
    cursor.showFor({ x: 100, y: 140, width: 60, height: 70, nameTop: 90 });
    expect(cursor.label.y).toBe(72);
    expect(cursor.graphics.commands).toContainEqual([
      "fillTriangle",
      -7,
      -64,
      7,
      -64,
      0,
      -54,
    ]);
  });

  it("draws a labeled target reticle and hides cleanly", () => {
    const scene = makeScene();
    const cursor = new TargetCursor(scene);

    cursor.showFor(
      { x: 100, y: 140, width: 60, height: 70 },
      { tint: 0xff6666 },
    );

    expect(cursor.graphics.visible).toBe(true);
    expect(cursor.label.visible).toBe(true);
    expect(cursor.label.text).toBe("TARGET");
    expect(cursor.label.color).toBe("#ff6666");
    expect(
      cursor.graphics.commands.some(([name]) => name === "lineBetween"),
    ).toBe(true);
    expect(scene.tweenCalls[0]).toMatchObject({
      targets: [cursor.graphics, cursor.label],
      duration: 430,
      yoyo: true,
      repeat: -1,
    });

    cursor.hide();
    expect(cursor.graphics.visible).toBe(false);
    expect(cursor.label.visible).toBe(false);
  });

  it("uses a ground ring and ACTING label for the actor role", () => {
    const scene = makeScene();
    const cursor = new TargetCursor(scene, {
      variant: "actor",
      label: "ACTING",
    });

    cursor.showFor({ x: 200, y: 220, width: 64, height: 80, feetY: 270 });
    expect(cursor.graphics.commands).toContainEqual([
      "strokeEllipse",
      0,
      50,
      78,
      16,
    ]);

    expect(cursor.label.text).toBe("ACTING");
    expect(
      cursor.graphics.commands.some(([name]) => name === "strokeEllipse"),
    ).toBe(true);
  });
});
