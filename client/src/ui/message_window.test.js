import { describe, expect, it } from "vitest";

import { MessageWindow } from "./message_window.js";

function makeNode(kind) {
  return {
    kind,
    visible: true,
    destroyed: false,
    fill: null,
    fillAlpha: 1,
    tint: null,
    scale: 1,
    children: [],
    x: 0,
    y: 0,
    text: "",
    setOrigin() {
      return this;
    },
    setDepth(depth) {
      this.depth = depth;
      return this;
    },
    setScrollFactor() {
      return this;
    },
    setScale(scale) {
      this.scale = scale;
      return this;
    },
    setDisplaySize(width, height) {
      this.displayWidth = width;
      this.displayHeight = height;
      return this;
    },
    setFillStyle(fill, alpha = 1) {
      this.fill = fill;
      this.fillAlpha = alpha;
      return this;
    },
    setText(text) {
      this.text = text;
      return this;
    },
    setColor(color) {
      this.color = color;
      return this;
    },
    setAlpha(alpha) {
      this.alpha = alpha;
      return this;
    },
    add(children) {
      this.children.push(...children);
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function makeScene() {
  return {
    add: {
      container() {
        return makeNode("container");
      },
      tileSprite(x, y, width, height, key) {
        const node = makeNode("tileSprite");
        node.x = x;
        node.y = y;
        node.width = width;
        node.height = height;
        node.key = key;
        return node;
      },
      image(x, y, key) {
        const node = makeNode("image");
        node.x = x;
        node.y = y;
        node.key = key;
        return node;
      },
      rectangle(x, y, width, height, fill, alpha) {
        const node = makeNode("rectangle");
        node.x = x;
        node.y = y;
        node.width = width;
        node.height = height;
        node.fill = fill;
        node.fillAlpha = alpha ?? 1;
        return node;
      },
      text(x, y, text, style) {
        const node = makeNode("text");
        node.x = x;
        node.y = y;
        node.text = text;
        node.style = style;
        return node;
      },
    },
  };
}

describe("MessageWindow", () => {
  it("renders framed text with a separate accent color", () => {
    const scene = makeScene();
    const window = new MessageWindow(scene, {
      x: 20,
      y: 510,
      width: 760,
      height: 85,
    });

    window.setColor("#ff8844").setText("Bruno attacks Goblin!");

    expect(window.getText()).toBe("Bruno attacks Goblin!");
    expect(window.accentBar.fill).toBe(0xff8844);
    expect(window.text.text).toBe("Bruno attacks Goblin!");
    expect(window.text.style.color).toBe("#ffffff");
    expect(window.container.children.length).toBeGreaterThan(3);
  });
});
