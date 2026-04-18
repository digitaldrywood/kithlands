const FRAME_SCALE = 0.5;
const FRAME_TILE = 64 * FRAME_SCALE;
const TEXT_PADDING_X = 12;
const TEXT_PADDING_Y = 4;
const DEFAULT_MIN_HEIGHT = 72;
const DEFAULT_MAX_HEIGHT = 112;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toColorInt(color, fallback = 0xffff44) {
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
      .rectangle(x + 18, y + height / 2, 6, height - 22, 0xffff44, 1)
      .setOrigin(0, 0.5)
      .setDepth(depth + 1);
    this.text = scene.add
      .text(
        this.contentBounds.x + TEXT_PADDING_X,
        this.contentBounds.y + TEXT_PADDING_Y,
        "",
        {
          fontSize: "16px",
          color: "#ffffff",
          fontFamily: "monospace",
          fontStyle: "bold",
          wordWrap: {
            width: this.contentBounds.width - TEXT_PADDING_X * 2,
            useAdvancedWrap: true,
          },
          lineSpacing: 4,
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
    const fill = this.scene.add
      .tileSprite(
        this.contentBounds.x,
        this.contentBounds.y,
        this.contentBounds.width,
        this.contentBounds.height,
        "border_fill",
      )
      .setOrigin(0, 0)
      .setDepth(depth);
    const top = this.scene.add
      .tileSprite(x + FRAME_TILE, y, innerWidth, FRAME_TILE, "border_t")
      .setOrigin(0, 0)
      .setDepth(depth);
    const bottom = this.scene.add
      .tileSprite(
        x + FRAME_TILE,
        y + height - FRAME_TILE,
        innerWidth,
        FRAME_TILE,
        "border_b",
      )
      .setOrigin(0, 0)
      .setDepth(depth);
    const left = this.scene.add
      .tileSprite(x, y + FRAME_TILE, FRAME_TILE, innerHeight, "border_l")
      .setOrigin(0, 0)
      .setDepth(depth);
    const right = this.scene.add
      .tileSprite(
        x + width - FRAME_TILE,
        y + FRAME_TILE,
        FRAME_TILE,
        innerHeight,
        "border_r",
      )
      .setOrigin(0, 0)
      .setDepth(depth);

    const corners = [
      ["border_tl", x, y],
      ["border_tr", x + width - FRAME_TILE, y],
      ["border_bl", x, y + height - FRAME_TILE],
      ["border_br", x + width - FRAME_TILE, y + height - FRAME_TILE],
    ].map(([key, px, py]) =>
      this.scene.add
        .image(px, py, key)
        .setOrigin(0, 0)
        .setScale(FRAME_SCALE)
        .setDepth(depth),
    );

    return {
      fill,
      top,
      bottom,
      left,
      right,
      corners,
      nodes: [fill, top, bottom, left, right, ...corners],
    };
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

    this.frame.fill
      .setPosition(this.contentBounds.x, this.contentBounds.y)
      .setSize(this.contentBounds.width, this.contentBounds.height);
    this.frame.top
      .setPosition(x + FRAME_TILE, y)
      .setSize(innerWidth, FRAME_TILE);
    this.frame.bottom
      .setPosition(x + FRAME_TILE, y + height - FRAME_TILE)
      .setSize(innerWidth, FRAME_TILE);
    this.frame.left
      .setPosition(x, y + FRAME_TILE)
      .setSize(FRAME_TILE, innerHeight);
    this.frame.right
      .setPosition(x + width - FRAME_TILE, y + FRAME_TILE)
      .setSize(FRAME_TILE, innerHeight);

    const [tl, tr, bl, br] = this.frame.corners;
    tl.setPosition(x, y);
    tr.setPosition(x + width - FRAME_TILE, y);
    bl.setPosition(x, y + height - FRAME_TILE);
    br.setPosition(x + width - FRAME_TILE, y + height - FRAME_TILE);

    this.accentBar
      .setPosition(x + 18, y + height / 2)
      .setSize(6, Math.max(18, height - 22));
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
