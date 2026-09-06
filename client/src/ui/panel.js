// Reusable panel + button helpers for the world menu, character detail
// screen (#95), and equip UI (#96). The goal is to move scenes off of
// immediate-mode `scene.add.text("[ ... ]")` buttons onto drawn rectangles
// with proper hover/press states. Kept framework-light so a fake scene
// shim (see panel.test.js) can exercise the wiring without Phaser.

import { MENU_THEME, roundedRectangle } from "./theme.js";
import { barFillWidth, barLabel } from "../systems/hpBar.js";

const DEFAULT_BUTTON_STYLE = {
  fontSize: "12px",
  fontFamily: "Arial, sans-serif",
  fontStyle: "",
  textColor: "#e9eef7",
  textColorDisabled: "#697888",
  fill: MENU_THEME.card,
  fillHover: MENU_THEME.hover,
  fillPress: 0x344759,
  fillDisabled: 0x101824,
  fillActive: 0x283748,
  stroke: MENU_THEME.line,
  strokeActive: MENU_THEME.accent,
  strokeWidth: 1,
  depth: 41,
};

// Draw a bordered, semi-opaque panel. Returns { bg, border } — both Phaser
// objects, so callers can push them into their lifetime group and destroy
// them together on close.
export function drawPanel(scene, x, y, w, h, opts = {}) {
  const {
    depth = 40,
    interactive = true,
    radius = 18,
    fillAlpha = 0.98,
  } = opts;
  const bg = roundedRectangle(
    scene,
    x,
    y,
    w,
    h,
    opts.fill ?? MENU_THEME.panel,
    fillAlpha,
    radius,
  )
    .setStrokeStyle(1, 0x384859)
    .setScrollFactor(0)
    .setDepth(depth);
  if (interactive) bg.setInteractive();
  return { bg };
}

// Kept as an API alias for battle layouts; the chrome follows the shared theme.
export function drawFF6BottomStrip(
  scene,
  { x = 0, y = 420, width = 800, height = 180, depth = 6 } = {},
) {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  g.fillStyle(0x101824, 1);
  g.fillRect(x, y, width, height);
  g.fillStyle(0x384859, 1);
  g.fillRect(x, y, width, 1);
  return g;
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

  const bg = roundedRectangle(scene, x, y, w, h, style.fill, 1)
    .setStrokeStyle(style.strokeWidth, style.stroke)
    .setScrollFactor(0)
    .setDepth(style.depth)
    .setInteractive({ useHandCursor: true });

  const text = scene.add
    .text(
      x,
      y,
      String(label)
        .replace(/[\[\]]/g, "")
        .trim(),
      {
        fontSize: style.fontSize,
        fontStyle: style.fontStyle,
        color: style.textColor,
        fontFamily: style.fontFamily,
      },
    )
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(style.depth + 1)
    .setInteractive({ useHandCursor: true });

  const state = {
    enabled: true,
    active: false,
    pressed: false,
    focused: false,
  };

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
      state.active || state.focused ? style.strokeActive : style.stroke,
    );
    text.setColor(style.textColor);
  };

  const onPointerOver = () => {
    if (!state.enabled) return;
    if (!state.focused) {
      state.focused = true;
      if (typeof style.onFocus === "function") style.onFocus();
    }
    if (!state.pressed) bg.setFillStyle(style.fillHover, 1);
    bg.setStrokeStyle(style.strokeWidth, style.strokeActive);
  };
  const onPointerOut = () => {
    if (state.focused) {
      state.focused = false;
      if (typeof style.onBlur === "function") style.onBlur();
    }
    state.pressed = false;
    repaint();
  };
  const onPointerDown = () => {
    if (!state.enabled) return;
    state.pressed = true;
    bg.setFillStyle(style.fillPress, 1);
  };
  const onPointerUp = () => {
    if (!state.enabled) return;
    const wasPressed = state.pressed;
    state.pressed = false;
    repaint();
    if (wasPressed && typeof onClick === "function") onClick();
  };

  bg.on("pointerover", onPointerOver);
  bg.on("pointerout", onPointerOut);
  bg.on("pointerdown", onPointerDown);
  bg.on("pointerup", onPointerUp);
  text.on("pointerover", onPointerOver);
  text.on("pointerout", onPointerOut);
  text.on("pointerdown", onPointerDown);
  text.on("pointerup", onPointerUp);

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
        text.setInteractive({ useHandCursor: true });
      } else {
        bg.disableInteractive();
        text.disableInteractive();
        state.pressed = false;
        state.focused = false;
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
  track: 0x1c2736,
  fill: 0x8faee9,
  stroke: 0x8faee9,
  strokeFocus: 0xc9b589,
  strokeWidth: 1,
  depth: 41,
  labelColor: "#c9b589",
  labelFontSize: "14px",
  labelFontFamily: "Arial, sans-serif",
  labelOffset: 12,
  showLabel: true,
};

const DEFAULT_LABELED_STAT_BAR_STYLE = {
  track: 0x283748,
  fill: 0x8faee9,
  stroke: 0x8faee9,
  strokeWidth: 1,
  depth: 41,
  height: 10,
  trackYOffset: 6,
  labelColor: "#94a8bd",
  labelFontSize: "11px",
  labelFontFamily: "Arial, sans-serif",
  labelFontStyle: "",
  labelWidth: 24,
  valueColor: "#e9eef7",
  valueFontSize: "10px",
  valueFontFamily: "Arial, sans-serif",
  valueFontStyle: "",
  valueWidth: 52,
  valueGap: 6,
  valueText: null,
  trackShadow: null,
  trackShadowAlpha: 0.35,
  trackInner: null,
  trackInnerAlpha: 1,
  fillShadow: null,
  fillShadowAlpha: 0.28,
  highlightFill: null,
  highlightAlpha: 0.55,
  tickCount: 0,
  tickColor: 0xe9eef7,
  tickAlpha: 0.18,
  tickHeight: null,
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
  const extras = [];

  const prefixLabel = scene.add
    .text(x, y, prefix, {
      fontSize: style.labelFontSize,
      color: style.labelColor,
      fontFamily: style.labelFontFamily,
      fontStyle: style.labelFontStyle,
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(style.depth + 1);
  if (typeof prefixLabel.setColor === "function") {
    prefixLabel.setColor(style.labelColor);
  }
  prefixLabel.__kithlandsStatBar = { prefix, role: "prefix" };

  if (style.trackShadow != null) {
    const shadow = scene.add
      .rectangle(
        trackX,
        trackY + 1,
        trackW,
        style.height,
        style.trackShadow,
        style.trackShadowAlpha,
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(style.depth - 1);
    extras.push(shadow);
  }

  const track = scene.add
    .rectangle(trackX, trackY, trackW, style.height, style.track, 1)
    .setOrigin(0, 0.5)
    .setStrokeStyle(style.strokeWidth, style.stroke)
    .setScrollFactor(0)
    .setDepth(style.depth);
  track.__kithlandsStatBar = { prefix, role: "track" };

  if (style.trackInner != null) {
    const inner = scene.add
      .rectangle(
        trackX + 1,
        trackY,
        Math.max(1, trackW - 2),
        Math.max(1, style.height - 2),
        style.trackInner,
        style.trackInnerAlpha,
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(style.depth + 0.25);
    extras.push(inner);
  }

  const fillW = barFillWidth(cur, max, trackW);
  if (style.fillShadow != null && fillW > 0) {
    const fillShadow = scene.add
      .rectangle(
        trackX,
        trackY + 1,
        Math.max(1, fillW),
        Math.max(1, style.height - 2),
        style.fillShadow,
        style.fillShadowAlpha,
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(style.depth + 0.5);
    extras.push(fillShadow);
  }
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

  if (style.highlightFill != null && fillW > 2) {
    const highlight = scene.add
      .rectangle(
        trackX + 1,
        trackY - style.height / 2 + 1,
        Math.max(1, fillW - 2),
        Math.max(1, Math.floor(style.height / 3)),
        style.highlightFill,
        style.highlightAlpha,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(style.depth + 1.5);
    extras.push(highlight);
  }

  if (style.tickCount > 0) {
    const tickHeight = style.tickHeight ?? Math.max(2, style.height - 2);
    for (let i = 1; i <= style.tickCount; i += 1) {
      const tick = scene.add
        .rectangle(
          trackX + Math.round((trackW * i) / (style.tickCount + 1)),
          trackY,
          1,
          tickHeight,
          style.tickColor,
          style.tickAlpha,
        )
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(style.depth + 1.25);
      extras.push(tick);
    }
  }

  const valueLabel = scene.add
    .text(trackX + trackW + style.valueGap, y, valueText, {
      fontSize: style.valueFontSize,
      color: style.valueColor,
      fontFamily: style.valueFontFamily,
      fontStyle: style.valueFontStyle,
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
    extras,
    destroy() {
      for (const extra of extras) extra.destroy();
      prefixLabel.destroy();
      track.destroy();
      fill.destroy();
      valueLabel.destroy();
    },
  };
}
