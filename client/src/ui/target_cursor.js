function toColorInt(color, fallback = 0xffffff) {
  if (typeof color === "number" && Number.isFinite(color)) return color;
  if (typeof color === "string") {
    const normalized = color.trim().replace(/^#/, "");
    const parsed = parseInt(normalized, 16);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export class TargetCursor {
  constructor(
    scene,
    {
      textureKey = "target_cursor",
      depth = 15,
      scale = 2,
      tag = "target-cursor",
    } = {},
  ) {
    this.scene = scene;
    this.baseX = 0;
    this.bobTween = null;
    this.sprite = scene.add
      .image(0, 0, textureKey)
      .setOrigin(0.5)
      .setDepth(depth)
      .setScale(scale)
      .setVisible(false);
    this.sprite._combatFxTag = tag;
  }

  showFor(
    entry,
    { tint = 0xffffff, side = "left", offsetX = 18, offsetY = 0 } = {},
  ) {
    const x = entry?.x ?? entry?.sprite?.x ?? 0;
    const y = entry?.y ?? entry?.sprite?.y ?? 0;
    const fullWidth =
      entry?.width ?? entry?.sprite?.displayWidth ?? entry?.sprite?.width ?? 48;
    const direction = side === "right" ? 1 : -1;
    this.baseX = x + direction * (fullWidth / 2 + offsetX);

    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite
      .setVisible(true)
      .setTint(toColorInt(tint))
      .setFlipX(side === "right")
      .setPosition(this.baseX, y + offsetY);

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      x: this.baseX + direction * 4,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return this;
  }

  hide() {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setVisible(false);
    return this;
  }

  destroy() {
    this.hide();
    this.sprite.destroy();
  }
}
