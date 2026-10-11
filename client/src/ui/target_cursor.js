function toColorInt(color, fallback = 0xffffff) {
  if (typeof color === "number" && Number.isFinite(color)) return color;
  if (typeof color === "string") {
    const normalized = color.trim().replace(/^#/, "");
    const parsed = parseInt(normalized, 16);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function colorHex(color) {
  return `#${toColorInt(color).toString(16).padStart(6, "0")}`;
}

// A semantic battle indicator. Actor and target use different geometry,
// placement, motion, and text so their roles never depend on tint alone.
export class TargetCursor {
  constructor(
    scene,
    {
      depth = 15,
      tag = "target-cursor",
      variant = "target",
      label = variant === "actor" ? "ACTING" : "TARGET",
    } = {},
  ) {
    this.scene = scene;
    this.variant = variant;
    this.defaultLabel = label;
    this.graphics = scene.add.graphics().setDepth(depth).setVisible(false);
    this.graphics._combatFxTag = tag;
    this.label = scene.add
      .text(0, 0, label, {
        fontSize: "9px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#111111",
        padding: { x: 4, y: 2 },
      })
      .setDepth(depth + 1)
      .setVisible(false);
    this.label._combatFxTag = `${tag}-label`;

    // Preserve the old property name for callers/tests that only need the
    // primary visible object, while the implementation is now code-native.
    this.sprite = this.graphics;
  }

  drawActor(width, height, color, feetOffset) {
    const ringWidth = Math.max(50, width + 14);
    const ringY = feetOffset ?? Math.max(18, height * 0.42);
    this.graphics.lineStyle(3, color, 0.95);
    this.graphics.strokeEllipse(0, ringY, ringWidth, 16);
    this.graphics.lineStyle(1, 0xffffff, 0.7);
    this.graphics.strokeEllipse(0, ringY, ringWidth - 8, 10);
    this.graphics.fillStyle(color, 1);
    this.graphics.fillTriangle(
      -ringWidth / 2 - 7,
      ringY,
      -ringWidth / 2 - 17,
      ringY - 7,
      -ringWidth / 2 - 17,
      ringY + 7,
    );
  }

  drawTarget(width, height, color) {
    const halfW = Math.max(27, width / 2 + 8);
    const halfH = Math.max(27, height / 2 + 8);
    const corner = 13;
    this.graphics.lineStyle(3, color, 1);
    this.graphics.lineBetween(-halfW, -halfH, -halfW + corner, -halfH);
    this.graphics.lineBetween(-halfW, -halfH, -halfW, -halfH + corner);
    this.graphics.lineBetween(halfW, -halfH, halfW - corner, -halfH);
    this.graphics.lineBetween(halfW, -halfH, halfW, -halfH + corner);
    this.graphics.lineBetween(-halfW, halfH, -halfW + corner, halfH);
    this.graphics.lineBetween(-halfW, halfH, -halfW, halfH - corner);
    this.graphics.lineBetween(halfW, halfH, halfW - corner, halfH);
    this.graphics.lineBetween(halfW, halfH, halfW, halfH - corner);

    // The downward diamond is deliberately unlike the actor's ground ring.
    this.graphics.fillStyle(color, 1);
    this.graphics.fillTriangle(-7, -halfH - 13, 7, -halfH - 13, 0, -halfH - 3);
  }

  showFor(entry, { tint = 0xffffff, label = this.defaultLabel } = {}) {
    const x = entry?.x ?? entry?.sprite?.x ?? 0;
    const y = entry?.y ?? entry?.sprite?.y ?? 0;
    const width = Math.max(
      42,
      entry?.width ?? entry?.sprite?.displayWidth ?? entry?.sprite?.width ?? 48,
    );
    const height = Math.max(
      42,
      entry?.height ??
        entry?.sprite?.displayHeight ??
        entry?.sprite?.height ??
        48,
    );
    const color = toColorInt(tint);

    this.scene.tweens.killTweensOf(this.graphics);
    this.scene.tweens.killTweensOf(this.label);
    this.graphics.clear().setPosition(x, y).setVisible(true).setAlpha(1);
    this.label
      .setText(label)
      .setColor(colorHex(color))
      .setVisible(true)
      .setAlpha(1);

    if (this.variant === "actor") {
      this.drawActor(
        width,
        height,
        color,
        entry?.feetY != null ? entry.feetY - y : undefined,
      );
      this.label.setOrigin(1, 0.5).setPosition(x - width / 2 - 16, y);
      this.scene.tweens.add({
        targets: this.graphics,
        scaleX: { from: 0.94, to: 1.04 },
        scaleY: { from: 0.94, to: 1.04 },
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
      this.drawTarget(width, height, color);
      this.label
        .setOrigin(0.5, 1)
        .setPosition(x, y - Math.max(27, height / 2 + 8) - 17);
      this.scene.tweens.add({
        targets: [this.graphics, this.label],
        alpha: { from: 1, to: 0.62 },
        duration: 430,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    return this;
  }

  hide() {
    this.scene.tweens.killTweensOf(this.graphics);
    this.scene.tweens.killTweensOf(this.label);
    this.graphics.setVisible(false);
    this.label.setVisible(false);
    return this;
  }

  destroy() {
    this.hide();
    this.graphics.destroy();
    this.label.destroy();
  }
}
