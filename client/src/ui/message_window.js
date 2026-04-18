const FRAME_SCALE = 0.5;
const FRAME_TILE = 64 * FRAME_SCALE;

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
    { x = 20, y = 510, width = 760, height = 85, depth = 20 } = {},
  ) {
    this.scene = scene;
    this.bounds = { x, y, width, height };
    this.currentText = "";
    this.container = scene.add.container(0, 0).setDepth(depth);
    this.container._combatFxTag = "message-window";

    const frame = this.buildFrame(x, y, width, height, depth);
    this.accentBar = scene.add
      .rectangle(x + 18, y + height / 2, 6, height - 22, 0xffff44, 1)
      .setOrigin(0, 0.5)
      .setDepth(depth + 1);
    this.text = scene.add
      .text(x + 34, y + 14, "", {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "monospace",
        fontStyle: "bold",
        wordWrap: { width: width - 58, useAdvancedWrap: true },
        lineSpacing: 4,
      })
      .setOrigin(0, 0)
      .setDepth(depth + 2);
    if (typeof this.text.setShadow === "function") {
      this.text.setShadow(1, 1, "#05070e", 2, true, true);
    }

    this.container.add([...frame, this.accentBar, this.text]);
  }

  buildFrame(x, y, width, height, depth) {
    const innerWidth = Math.max(FRAME_TILE, width - FRAME_TILE * 2);
    const innerHeight = Math.max(FRAME_TILE, height - FRAME_TILE * 2);
    const fill = this.scene.add
      .tileSprite(
        x + FRAME_TILE,
        y + FRAME_TILE,
        innerWidth,
        innerHeight,
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

    return [fill, top, bottom, left, right, ...corners];
  }

  setText(text) {
    this.currentText = text || "";
    this.text.setText(this.currentText);
    return this;
  }

  getText() {
    return this.currentText;
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
