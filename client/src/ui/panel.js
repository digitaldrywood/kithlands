// Reusable panel + button helpers for the world menu, character detail
// screen (#95), and equip UI (#96). The goal is to move scenes off of
// immediate-mode `scene.add.text("[ ... ]")` buttons onto drawn rectangles
// with proper hover/press states. Kept framework-light so a fake scene
// shim (see panel.test.js) can exercise the wiring without Phaser.

import { barFillWidth, barLabel } from "../systems/hpBar.js";

const DEFAULT_BUTTON_STYLE = {
  fontSize: "12px",
  fontFamily: "monospace",
  fontStyle: "",
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
  if (opts.variant === "ff6") {
    return drawFF6Panel(scene, x, y, w, h, opts);
  }

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

function drawFF6Panel(scene, x, y, w, h, opts = {}) {
  const {
    depth = 40,
    radius = 18,
    interactive = false,
    shadowColor = 0x08111f,
    shadowAlpha = 0.45,
    shadowOffsetX = 3,
    shadowOffsetY = 3,
    outerStroke = 0xe4f3ff,
    outerStrokeWidth = 3,
    outerFill = 0x4f7dc4,
    innerStroke = 0xc0d7ff,
    innerStrokeWidth = 2,
    innerTop = 0x2e5f9d,
    innerBottom = 0x14294c,
    innerInset = 6,
    sheenColor = 0xffffff,
    sheenAlpha = 0.12,
  } = opts;

  const bg = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  const left = x - w / 2;
  const top = y - h / 2;

  bg.fillStyle(shadowColor, shadowAlpha);
  bg.fillRoundedRect(left + shadowOffsetX, top + shadowOffsetY, w, h, radius);

  bg.lineStyle(outerStrokeWidth, outerStroke, 1);
  bg.fillStyle(outerFill, 1);
  bg.fillRoundedRect(left, top, w, h, radius);
  bg.strokeRoundedRect(left, top, w, h, radius);

  if (typeof bg.fillGradientStyle === "function") {
    bg.fillGradientStyle(innerTop, innerTop, innerBottom, innerBottom, 1);
  } else {
    bg.fillStyle(innerTop, 1);
  }
  bg.lineStyle(innerStrokeWidth, innerStroke, 0.95);
  bg.fillRoundedRect(
    left + innerInset,
    top + innerInset,
    w - innerInset * 2,
    h - innerInset * 2,
    Math.max(4, radius - innerInset + 2),
  );
  bg.strokeRoundedRect(
    left + innerInset,
    top + innerInset,
    w - innerInset * 2,
    h - innerInset * 2,
    Math.max(4, radius - innerInset + 2),
  );

  bg.fillStyle(sheenColor, sheenAlpha);
  bg.fillRoundedRect(
    left + innerInset + 4,
    top + innerInset + 4,
    w - innerInset * 2 - 8,
    Math.max(18, Math.floor(h * 0.16)),
    Math.max(4, radius - innerInset + 2),
  );

  if (interactive && typeof bg.setInteractive === "function") {
    bg.setInteractive();
  }
  return { bg };
}

// Draw an opaque FF6-style horizontal strip across the bottom of the battle
// scene (issue #258). The strip occludes the bottom third of the pre-rendered
// background so the MessageWindow + ACTION_HUD panels on top have guaranteed
// contrast regardless of the art behind them. Returns the graphics object so
// the caller can destroy it alongside the rest of the backdrop.
export function drawFF6BottomStrip(scene, opts = {}) {
  const {
    x = 0,
    y = 420,
    width = 800,
    height = 180,
    depth = 6,
    outerStroke = 0xe4f3ff,
    outerStrokeWidth = 3,
    outerFill = 0x4f7dc4,
    innerStroke = 0xc0d7ff,
    innerStrokeWidth = 2,
    innerTop = 0x2e5f9d,
    innerBottom = 0x14294c,
    innerInset = 6,
    topEdgeColor = 0x08111f,
    topEdgeAlpha = 0.55,
    topEdgeHeight = 2,
  } = opts;

  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth);

  g.fillStyle(outerFill, 1);
  g.fillRect(x, y, width, height);

  g.lineStyle(outerStrokeWidth, outerStroke, 1);
  g.strokeRect(x, y, width, height);

  if (typeof g.fillGradientStyle === "function") {
    g.fillGradientStyle(innerTop, innerTop, innerBottom, innerBottom, 1);
  } else {
    g.fillStyle(innerTop, 1);
  }
  g.fillRect(
    x + innerInset,
    y + innerInset,
    width - innerInset * 2,
    height - innerInset * 2,
  );
  g.lineStyle(innerStrokeWidth, innerStroke, 0.95);
  g.strokeRect(
    x + innerInset,
    y + innerInset,
    width - innerInset * 2,
    height - innerInset * 2,
  );

  // Hard dark line at the very top edge so the strip reads as a distinct
  // foreground layer instead of blending into the painted background.
  g.fillStyle(topEdgeColor, topEdgeAlpha);
  g.fillRect(x, y - topEdgeHeight, width, topEdgeHeight);

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

  const bg = scene.add
    .rectangle(x, y, w, h, style.fill, 1)
    .setStrokeStyle(style.strokeWidth, style.stroke)
    .setScrollFactor(0)
    .setDepth(style.depth)
    .setInteractive({ useHandCursor: true });

  const text = scene.add
    .text(x, y, label, {
      fontSize: style.fontSize,
      fontStyle: style.fontStyle,
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
  labelFontStyle: "",
  labelWidth: 24,
  valueColor: "#ffffff",
  valueFontSize: "10px",
  valueFontFamily: "monospace",
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
  tickColor: 0xffffff,
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
