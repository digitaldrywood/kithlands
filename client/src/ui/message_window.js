import { roundedRectangle } from "./theme.js";
const FRAME_TILE = 16;
const TEXT_PADDING_X = 12;
const TEXT_PADDING_Y = 4;
const DEFAULT_MIN_HEIGHT = 72;
const DEFAULT_MAX_HEIGHT = 112;
// Default message text size bumped for FF6-style readability (issue #258).
// 22 px combined with the default 98–112 px frame gives ~40 px of interior
// text space, enough for two lines of bold monospace without clipping.
const DEFAULT_FONT_SIZE = "22px";
const DEFAULT_LINE_SPACING = 6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toColorInt(color, fallback = 0xc9b589) {
  if (typeof color === "number" && Number.isFinite(color)) return color;
  if (typeof color === "string") {
    const normalized = color.trim().replace(/^#/, "");
    const parsed = parseInt(normalized, 16);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export class MessageWindow {
  constructor(
    scene,
    {
      x = 20,
      y = 510,
      width = 760,
      height = 85,
      minHeight = DEFAULT_MIN_HEIGHT,
      maxHeight = DEFAULT_MAX_HEIGHT,
      anchorBottom = true,
      depth = 20,
      fontSize = DEFAULT_FONT_SIZE,
      lineSpacing = DEFAULT_LINE_SPACING,
    } = {},
  ) {
    this.scene = scene;
    this.bounds = { x, y, width, height };
    this.minHeight = Math.max(FRAME_TILE * 2, minHeight);
    this.maxHeight = Math.max(this.minHeight, maxHeight);
    this.anchorBottom = anchorBottom;
    this.fixedBottom = y + height;
    this.currentText = "";
    this.container = scene.add.container(0, 0).setDepth(depth);
    this.container._combatFxTag = "message-window";

    this.frame = this.buildFrame(x, y, width, height, depth);
    this.accentBar = scene.add
      .rectangle(x + 18, y + height / 2, 3, height - 32, 0xc9b589, 1)
      .setOrigin(0, 0.5)
      .setDepth(depth + 1);
    this.text = scene.add
      .text(
        this.contentBounds.x + TEXT_PADDING_X,
        this.contentBounds.y + TEXT_PADDING_Y,
        "",
        {
          fontSize,
          color: "#e9eef7",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
          wordWrap: {
            width: this.contentBounds.width - TEXT_PADDING_X * 2,
            useAdvancedWrap: true,
          },
          lineSpacing,
        },
      )
      .setOrigin(0, 0)
      .setDepth(depth + 2);
    if (typeof this.text.setShadow === "function") {
      this.text.setShadow(1, 1, "#05070e", 2, true, true);
    }

    this.container.add([...this.frame.nodes, this.accentBar, this.text]);
    this.applyLayout(height);
  }

  buildFrame(x, y, width, height, depth) {
    const innerWidth = Math.max(FRAME_TILE, width - FRAME_TILE * 2);
    const innerHeight = Math.max(FRAME_TILE, height - FRAME_TILE * 2);
    this.contentBounds = {
      x: x + FRAME_TILE,
      y: y + FRAME_TILE,
      width: innerWidth,
      height: innerHeight,
    };
    const fill = roundedRectangle(
      this.scene,
      x,
      y,
      width,
      height,
      0x151e2b,
      0.98,
      16,
    )
      .setOrigin(0, 0)
      .setDepth(depth);
    return { fill, nodes: [fill] };
  }

  applyLayout(nextHeight) {
    const width = this.bounds.width;
    const height = clamp(nextHeight, this.minHeight, this.maxHeight);
    const x = this.bounds.x;
    const y = this.anchorBottom ? this.fixedBottom - height : this.bounds.y;
    const innerWidth = Math.max(FRAME_TILE, width - FRAME_TILE * 2);
    const innerHeight = Math.max(FRAME_TILE, height - FRAME_TILE * 2);

    this.bounds = { x, y, width, height };
    this.contentBounds = {
      x: x + FRAME_TILE,
      y: y + FRAME_TILE,
      width: innerWidth,
      height: innerHeight,
    };

    this.frame.fill.setPosition(x, y).setSize(width, height);

    this.accentBar
      .setPosition(x + 18, y + height / 2)
      .setSize(3, Math.max(18, height - 32));
    this.text.setPosition(
      this.contentBounds.x + TEXT_PADDING_X,
      this.contentBounds.y + TEXT_PADDING_Y,
    );
    if (typeof this.text.setWordWrapWidth === "function") {
      this.text.setWordWrapWidth(
        this.contentBounds.width - TEXT_PADDING_X * 2,
        true,
      );
    } else if (this.text.style?.wordWrap) {
      this.text.style.wordWrap.width =
        this.contentBounds.width - TEXT_PADDING_X * 2;
    }
  }

  fitToText() {
    const textHeight = Math.max(18, this.text.height || 0);
    const nextHeight =
      FRAME_TILE * 2 + TEXT_PADDING_Y * 2 + textHeight + TEXT_PADDING_Y;
    this.applyLayout(nextHeight);
  }

  setText(text) {
    this.currentText = text || "";
    this.text.setText(this.currentText);
    this.fitToText();
    return this;
  }

  getText() {
    return this.currentText;
  }

  getLayoutMetrics() {
    return {
      bounds: { ...this.bounds },
      contentBounds: { ...this.contentBounds },
      textBounds: {
        x: this.text?.x ?? null,
        y: this.text?.y ?? null,
        width: this.text?.width ?? this.text?.displayWidth ?? null,
        height: this.text?.height ?? this.text?.displayHeight ?? null,
      },
    };
  }

  setColor(color) {
    this.accentBar.setFillStyle(toColorInt(color), 1);
    return this;
  }

  destroy() {
    const children = this.container.list || this.container.children || [];
    for (const child of [...children]) {
      child.destroy();
    }
    this.container.destroy();
  }
}
