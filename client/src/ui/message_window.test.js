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
      if (this.kind === "text") {
        const fontSize = parseInt(this.style?.fontSize || "16", 10) || 16;
        const wrapWidth = this.style?.wordWrap?.width || 320;
        const charsPerLine = Math.max(
          8,
          Math.floor(wrapWidth / (fontSize * 0.55)),
        );
        const lines = Math.max(
          1,
          String(text || "")
            .split("\n")
            .reduce(
              (count, line) =>
                count + Math.max(1, Math.ceil(line.length / charsPerLine)),
              0,
            ),
        );
        this.width = Math.min(
          wrapWidth,
          String(text || "").length * fontSize * 0.55,
        );
        this.height = lines * (fontSize + 4);
      }
      return this;
    },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
      return this;
    },
    setSize(width, height) {
      this.width = width;
      this.height = height;
      return this;
    },
    setWordWrapWidth(width) {
      if (this.style?.wordWrap) this.style.wordWrap.width = width;
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
    expect(window.text.style.color).toBe("#e9eef7");
    expect(window.container.children.length).toBe(3);
  });

  it("anchors text inside the framed fill area", () => {
    const scene = makeScene();
    const window = new MessageWindow(scene, {
      x: 20,
      y: 510,
      width: 760,
      height: 85,
    });

    const metrics = window.getLayoutMetrics();

    expect(metrics.textBounds.x).toBeGreaterThanOrEqual(
      metrics.contentBounds.x,
    );
    expect(metrics.textBounds.y).toBeGreaterThanOrEqual(
      metrics.contentBounds.y,
    );
  });

  it("shrinks for a short one-line prompt while keeping the bottom anchored", () => {
    const scene = makeScene();
    const window = new MessageWindow(scene, {
      x: 388,
      y: 490,
      width: 392,
      height: 98,
      minHeight: 68,
      maxHeight: 108,
      // Keep the original 16 px default here so the layout math stays within
      // the legacy 98 px frame this test asserts against. Runtime battle
      // usage now defaults to the FF6-readable 22 px (issue #258).
      fontSize: "16px",
    });

    const beforeBottom =
      window.getLayoutMetrics().bounds.y +
      window.getLayoutMetrics().bounds.height;
    window.setText("Hero's turn -- choose an action");
    const metrics = window.getLayoutMetrics();
    const afterBottom = metrics.bounds.y + metrics.bounds.height;

    expect(metrics.bounds.height).toBeLessThan(98);
    expect(afterBottom).toBe(beforeBottom);
  });

  it("grows for wrapped prompts without exceeding the configured max height", () => {
    const scene = makeScene();
    const window = new MessageWindow(scene, {
      x: 388,
      y: 490,
      width: 392,
      height: 98,
      minHeight: 68,
      maxHeight: 108,
    });

    window.setText(
      "Hero's turn -- choose an action, cast a very long spell name, or select a target now!",
    );
    const metrics = window.getLayoutMetrics();

    expect(metrics.bounds.height).toBeGreaterThanOrEqual(92);
    expect(metrics.bounds.height).toBeLessThanOrEqual(108);
  });
});
