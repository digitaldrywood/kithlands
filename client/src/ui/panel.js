// Reusable panel + button helpers for the world menu, character detail
// screen (#95), and equip UI (#96). The goal is to move scenes off of
// immediate-mode `scene.add.text("[ ... ]")` buttons onto drawn rectangles
// with proper hover/press states. Kept framework-light so a fake scene
// shim (see panel.test.js) can exercise the wiring without Phaser.

const DEFAULT_BUTTON_STYLE = {
  fontSize: "12px",
  fontFamily: "monospace",
  textColor: "#ffffff",
  textColorDisabled: "#666666",
  fill: 0x1a2a4a,
  fillHover: 0x2a4a7a,
  fillPress: 0x3a5a9a,
  fillDisabled: 0x111122,
  fillActive: 0x2a4a7a,
  stroke: 0x4488ff,
  strokeActive: 0x88ccff,
  strokeWidth: 2,
  depth: 41,
};

// Draw a bordered, semi-opaque panel. Returns { bg, border } — both Phaser
// objects, so callers can push them into their lifetime group and destroy
// them together on close.
export function drawPanel(scene, x, y, w, h, opts = {}) {
  const {
    fill = 0x000000,
    fillAlpha = 0.95,
    stroke = 0x4488ff,
    strokeWidth = 2,
    depth = 40,
    interactive = true,
  } = opts;

  const bg = scene.add
    .rectangle(x, y, w, h, fill, fillAlpha)
    .setStrokeStyle(strokeWidth, stroke)
    .setScrollFactor(0)
    .setDepth(depth);
  if (interactive) bg.setInteractive();
  return { bg };
}

// Draw a rectangular button with hover / press / active / disabled visual
// states and a centered label. Returns a handle with mutation methods.
//
//   const btn = drawButton(scene, 400, 500, 140, 36, "SAVE", () => save());
//   scene.menuGroup.push(btn.bg, btn.label);
//   btn.setEnabled(false);
//   btn.setLabel("Saving...");
//   btn.setActive(true);   // for tab-style selection
//   btn.destroy();         // tears down both objects
//
// onClick fires on `pointerup` rather than `pointerdown` so accidental
// drags don't activate the button.
export function drawButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const style = { ...DEFAULT_BUTTON_STYLE, ...opts };

  const bg = scene.add
    .rectangle(x, y, w, h, style.fill, 1)
    .setStrokeStyle(style.strokeWidth, style.stroke)
    .setScrollFactor(0)
    .setDepth(style.depth)
    .setInteractive({ useHandCursor: true });

  const text = scene.add
    .text(x, y, label, {
      fontSize: style.fontSize,
      color: style.textColor,
      fontFamily: style.fontFamily,
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(style.depth + 1);

  const state = { enabled: true, active: false, pressed: false };

  const repaint = () => {
    if (!state.enabled) {
      bg.setFillStyle(style.fillDisabled, 1);
      bg.setStrokeStyle(style.strokeWidth, style.stroke);
      text.setColor(style.textColorDisabled);
      return;
    }
    if (state.pressed) {
      bg.setFillStyle(style.fillPress, 1);
    } else if (state.active) {
      bg.setFillStyle(style.fillActive, 1);
    } else {
      bg.setFillStyle(style.fill, 1);
    }
    bg.setStrokeStyle(
      style.strokeWidth,
      state.active ? style.strokeActive : style.stroke,
    );
    text.setColor(style.textColor);
  };

  bg.on("pointerover", () => {
    if (!state.enabled) return;
    if (!state.pressed) bg.setFillStyle(style.fillHover, 1);
  });
  bg.on("pointerout", () => {
    state.pressed = false;
    repaint();
  });
  bg.on("pointerdown", () => {
    if (!state.enabled) return;
    state.pressed = true;
    bg.setFillStyle(style.fillPress, 1);
  });
  bg.on("pointerup", () => {
    if (!state.enabled) return;
    const wasPressed = state.pressed;
    state.pressed = false;
    repaint();
    if (wasPressed && typeof onClick === "function") onClick();
  });

  return {
    bg,
    label: text,
    setLabel(next) {
      text.setText(next);
    },
    setEnabled(enabled) {
      state.enabled = !!enabled;
      if (enabled) {
        bg.setInteractive({ useHandCursor: true });
      } else {
        bg.disableInteractive();
        state.pressed = false;
      }
      repaint();
    },
    setActive(active) {
      state.active = !!active;
      repaint();
    },
    isEnabled() {
      return state.enabled;
    },
    isActive() {
      return state.active;
    },
    destroy() {
      bg.destroy();
      text.destroy();
    },
  };
}
