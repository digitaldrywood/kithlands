import { describe, expect, it } from "vitest";

import { TargetCursor } from "./target_cursor.js";

function makeSprite() {
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
    setPosition(x, y) {
      this.x = x;
      this.y = y;
      return this;
    },
    setTint(tint) {
      this.tint = tint;
      return this;
    },
    clearTint() {
      this.tint = null;
      return this;
    },
    setFlipX(flipX) {
      this.flipX = flipX;
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
      image() {
        return makeSprite();
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
  it("positions a bobbing cursor beside the target and hides cleanly", () => {
    const scene = makeScene();
    const cursor = new TargetCursor(scene);

    cursor.showFor(
      { x: 100, y: 140, width: 60 },
      { tint: 0xff6666, side: "left" },
    );

    expect(cursor.sprite.visible).toBe(true);
    expect(cursor.sprite.tint).toBe(0xff6666);
    expect(cursor.sprite.x).toBeLessThan(100);
    expect(scene.tweenCalls[0]).toMatchObject({
      targets: cursor.sprite,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    cursor.hide();
    expect(cursor.sprite.visible).toBe(false);
  });
});
