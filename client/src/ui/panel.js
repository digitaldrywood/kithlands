// Reusable panel + button helpers for the world menu, character detail
// screen (#95), and equip UI (#96). The goal is to move scenes off of
// immediate-mode `scene.add.text("[ ... ]")` buttons onto drawn rectangles
// with proper hover/press states. Kept framework-light so a fake scene
// shim (see panel.test.js) can exercise the wiring without Phaser.

import { barFillWidth, barLabel } from "../systems/hpBar.js";

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

const DEFAULT_PROGRESS_BAR_STYLE = {
  track: 0x1a2a4a,
  fill: 0x4488ff,
  stroke: 0x4488ff,
  strokeFocus: 0xffcc44,
  strokeWidth: 2,
  depth: 41,
  labelColor: "#ffcc44",
  labelFontSize: "14px",
  labelFontFamily: "monospace",
  labelOffset: 12,
  showLabel: true,
};

const DEFAULT_LABELED_STAT_BAR_STYLE = {
  track: 0x222244,
  fill: 0x4488ff,
  stroke: 0x4488ff,
  strokeWidth: 1,
  depth: 41,
  height: 10,
  trackYOffset: 6,
  labelColor: "#cccccc",
  labelFontSize: "11px",
  labelFontFamily: "monospace",
  labelWidth: 24,
  valueColor: "#ffffff",
  valueFontSize: "10px",
  valueFontFamily: "monospace",
  valueWidth: 52,
  valueGap: 6,
  valueText: null,
};

// Draw a horizontal progress bar — a track rectangle plus a fill rectangle
// that grows from the left. Built for the options screen (#142) so speed
// settings show visual "X of max" instead of a bare number, but kept
// generic so other menus can reuse it. Math reuses `barFillWidth` from
// systems/hpBar.js (already integer-safe and unit-tested there).
//
//   const bar = drawProgressBar(scene, 400, 300, 200, 14, 3, 6);
//   bar.setValue(4);        // grows the fill and rewrites "4/6"
//   bar.setFocused(true);   // swaps stroke to strokeFocus for kbd focus
//   bar.destroy();          // tears down track, fill, and label together
//
// The fill rect uses origin (0, 0.5) so resizing it via setSize keeps the
// left edge anchored at the track's left edge.
export function drawProgressBar(scene, x, y, w, h, cur, max, opts = {}) {
  const style = { ...DEFAULT_PROGRESS_BAR_STYLE, ...opts };

  const track = scene.add
    .rectangle(x, y, w, h, style.track, 1)
    .setOrigin(0, 0.5)
    .setStrokeStyle(style.strokeWidth, style.stroke)
    .setScrollFactor(0)
    .setDepth(style.depth);

  const fillW = barFillWidth(cur, max, w);
  const fill = scene.add
    .rectangle(x, y, Math.max(1, fillW), h, style.fill, 1)
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(style.depth + 1);
  if (fillW <= 0) fill.setVisible(false);

  let label = null;
  if (style.showLabel) {
    label = scene.add
      .text(x + w + style.labelOffset, y, barLabel(cur, max), {
        fontSize: style.labelFontSize,
        color: style.labelColor,
        fontFamily: style.labelFontFamily,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(style.depth + 1);
  }

  const state = { focused: false };

  return {
    track,
    fill,
    label,
    setValue(nextCur) {
      const nextW = barFillWidth(nextCur, max, w);
      if (nextW <= 0) {
        fill.setVisible(false);
      } else {
        fill.setVisible(true);
        fill.setSize(nextW, h);
      }
      if (label) label.setText(barLabel(nextCur, max));
    },
    setFocused(on) {
      state.focused = !!on;
      track.setStrokeStyle(
        style.strokeWidth,
        state.focused ? style.strokeFocus : style.stroke,
      );
    },
    isFocused() {
      return state.focused;
    },
    destroy() {
      track.destroy();
      fill.destroy();
      if (label) label.destroy();
    },
  };
}

// Draw a compact JRPG-style stat bar with a short left label, a fixed-width
// track, and a right-side numeric value. The created Phaser objects are tagged
// so dev/proof tooling can identify party-menu and character-detail bars
// without depending on fragile text adjacency.
export function drawLabeledStatBar(
  scene,
  x,
  y,
  width,
  cur,
  max,
  prefix,
  opts = {},
) {
  const style = { ...DEFAULT_LABELED_STAT_BAR_STYLE, ...opts };
  const valueText = style.valueText ?? barLabel(cur, max);
  const trackX = x + style.labelWidth;
  const trackW = Math.max(
    1,
    width - style.labelWidth - style.valueGap - style.valueWidth,
  );
  const trackY = y + style.trackYOffset;

  const prefixLabel = scene.add
    .text(x, y, prefix, {
      fontSize: style.labelFontSize,
      color: style.labelColor,
      fontFamily: style.labelFontFamily,
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(style.depth + 1);
  if (typeof prefixLabel.setColor === "function") {
    prefixLabel.setColor(style.labelColor);
  }
  prefixLabel.__kithlandsStatBar = { prefix, role: "prefix" };

  const track = scene.add
    .rectangle(trackX, trackY, trackW, style.height, style.track, 1)
    .setOrigin(0, 0.5)
    .setStrokeStyle(style.strokeWidth, style.stroke)
    .setScrollFactor(0)
    .setDepth(style.depth);
  track.__kithlandsStatBar = { prefix, role: "track" };

  const fillW = barFillWidth(cur, max, trackW);
  const fill = scene.add
    .rectangle(trackX, trackY, Math.max(1, fillW), style.height, style.fill, 1)
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(style.depth + 1);
  fill.__kithlandsStatBar = { prefix, role: "fill" };
  if (fillW <= 0) {
    if (typeof fill.setVisible === "function") fill.setVisible(false);
    else fill.visible = false;
  }

  const valueLabel = scene.add
    .text(trackX + trackW + style.valueGap, y, valueText, {
      fontSize: style.valueFontSize,
      color: style.valueColor,
      fontFamily: style.valueFontFamily,
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(style.depth + 1);
  if (typeof valueLabel.setColor === "function") {
    valueLabel.setColor(style.valueColor);
  }
  valueLabel.__kithlandsStatBar = { prefix, role: "value" };

  return {
    prefixLabel,
    track,
    fill,
    valueLabel,
    destroy() {
      prefixLabel.destroy();
      track.destroy();
      fill.destroy();
      valueLabel.destroy();
    },
  };
}
