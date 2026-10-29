import { portraitFontSize } from "../systems/gameplayViewport.js";
import Phaser from "phaser";

// ── Style definitions per damage type ──────────────────────────────────
const FLOAT_STYLES = {
  status: {
    color: "#d8caff",
    fontSize: "28px",
    rise: 0,
    duration: 1850,
    bounceScale: 1,
    stroke: "#131021",
    strokeThickness: 4,
  },
  status_resist: {
    color: "#e4eaf2",
    fontSize: "28px",
    rise: 0,
    duration: 1850,
    text: "RESISTED",
    bounceScale: 1,
    stroke: "#11151e",
    strokeThickness: 4,
  },
  physical: {
    color: "#ffffff",
    fontSize: "28px",
    rise: 22,
    duration: 1750,
    prefix: "-",
    bounceScale: 1.18,
    stroke: "#111111",
    strokeThickness: 4,
  },
  crit: {
    color: "#ffcc00",
    fontSize: "32px",
    rise: 24,
    duration: 2100,
    prefix: "-",
    suffix: "!",
    bounceScale: 1.34,
    stroke: "#1f1300",
    strokeThickness: 4,
  },
  magical: {
    color: "#bb88ff",
    fontSize: "28px",
    rise: 22,
    duration: 1750,
    prefix: "-",
    bounceScale: 1.18,
    stroke: "#111111",
    strokeThickness: 4,
  },
  heal: {
    color: "#44ff44",
    fontSize: "28px",
    rise: 20,
    duration: 1750,
    prefix: "+",
    bounceScale: 1.12,
    stroke: "#0b1a0b",
    strokeThickness: 4,
  },
  miss: {
    color: "#eef2fa",
    fontSize: "24px",
    rise: 16,
    duration: 1600,
    text: "MISS",
    fontStyle: "italic",
    bounceScale: 1.1,
    stroke: "#111111",
    strokeThickness: 4,
  },
  party_hit: {
    color: "#ff8800",
    fontSize: "26px",
    rise: 22,
    duration: 1850,
    prefix: "-",
    bounceScale: 1.22,
    stroke: "#140808",
    strokeThickness: 4,
  },
  defeated: {
    color: "#ff4444",
    fontSize: "20px",
    rise: 0,
    duration: 1750,
    delay: 300,
    text: "DEFEATED!",
    bounceScale: 1.08,
    stroke: "#220808",
    strokeThickness: 4,
  },
};

// Element color overrides for magical damage
const ELEMENT_TEXT_COLORS = {
  fire: "#ffbb80",
  ice: "#a4e5ff",
  lightning: "#ffff44",
  holy: "#ffffff",
  dark: "#dab7ff",
};

const POOL_SIZE = 24;
const MAX_PER_TARGET = 6;
const STAGGER_X = 18;
const STAGGER_Y = 34;
const STAGGER_WINDOW = 700; // ms

const BASE_STYLE = {
  fontSize: "16px",
  color: "#ffffff",
  fontFamily: "Arial, sans-serif",
  fontStyle: "bold",
};

function applyTextStroke(textObj, stroke, thickness) {
  if (typeof textObj.setStroke === "function") {
    textObj.setStroke(stroke, thickness);
  }
}

export class FloatingTextPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.targetCounts = new Map(); // targetKey -> { count, lastTime }

    for (let i = 0; i < POOL_SIZE; i++) {
      const t = scene.add
        .text(0, 0, "", BASE_STYLE)
        .setOrigin(0.5)
        .setDepth(25)
        .setActive(false)
        .setVisible(false);
      t.setShadow(1, 1, "#000000", 2, true, true);
      t._poolIndex = i;
      this.pool.push(t);
    }
  }

  acquire() {
    // Find first inactive
    for (const t of this.pool) {
      if (!t.active) {
        return t;
      }
    }
    // Pool exhausted: force-release oldest active
    if (this.active.length > 0) {
      const oldest = this.active.shift();
      this._reset(oldest);
      return oldest;
    }
    // Fallback: return first pool item
    const t = this.pool[0];
    this._reset(t);
    return t;
  }

  release(textObj) {
    this._reset(textObj);
    const idx = this.active.indexOf(textObj);
    if (idx !== -1) this.active.splice(idx, 1);
  }

  _reset(t) {
    this.scene.tweens.killTweensOf(t);
    t.setActive(false)
      .setVisible(false)
      .setText("")
      .setAlpha(1)
      .setScale(1)
      .setFontSize(16)
      .setColor("#ffffff")
      .setFontStyle("bold");
    applyTextStroke(t, "#000000", 0);
    if (t._targetKey) {
      if (t._usesStagger) this._decrementTarget(t._targetKey);
      t._targetKey = null;
      t._resultType = null;
    }
  }

  _decrementTarget(key) {
    const entry = this.targetCounts.get(key);
    if (entry) {
      entry.count = Math.max(0, entry.count - 1);
    }
  }

  _getStaggerOffset(targetKey) {
    const now = Date.now();
    let entry = this.targetCounts.get(targetKey);
    if (!entry || now - entry.lastTime > STAGGER_WINDOW) {
      entry = { count: 0, lastTime: now };
      this.targetCounts.set(targetKey, entry);
    } else {
      entry.count++;
      entry.lastTime = now;
    }

    // Cap to prevent excessive overlap
    const count = Math.min(entry.count, MAX_PER_TARGET - 1);

    // Fan pattern: left(-1), center(0), right(1), repeating
    const xDir = (count % 3) - 1;
    return {
      dx: xDir * STAGGER_X,
      dy: -count * STAGGER_Y,
    };
  }

  _enforceTargetCap(targetKey) {
    // Count active texts for this target
    const matching = this.active.filter((t) => t._targetKey === targetKey);
    while (matching.length >= MAX_PER_TARGET) {
      const oldest = matching.shift();
      this.release(oldest);
    }
  }

  /**
   * Spawn a floating text number.
   * @param {number} x - center x position
   * @param {number} y - center y position
   * @param {number} value - damage/heal value (ignored for miss/defeated)
   * @param {string} type - one of: physical, crit, magical, heal, miss, party_hit, defeated
   * @param {string} targetKey - unique key per target for stagger tracking (e.g. "enemy_102")
   * @param {object} [opts] - optional overrides { element }
   * @returns {Promise} resolves after spawn delay (150ms)
   */
  spawn(x, y, value, type, targetKey, opts = {}) {
    const style = FLOAT_STYLES[type] || FLOAT_STYLES.physical;
    const reducedMotion = this.scene.reducedBattleMotion?.() || false;

    this._enforceTargetCap(targetKey);
    const offset =
      type === "defeated" || opts.still
        ? { dx: 0, dy: 0 }
        : this._getStaggerOffset(targetKey);
    const t = this.acquire();

    // Build display text
    let displayText = style.text;
    if (!displayText) {
      displayText =
        (type === "crit"
          ? opts.guarded
            ? "CRIT · GUARD\n"
            : "CRITICAL\n"
          : opts.guarded
            ? "GUARD\n"
            : "") +
        (style.prefix || "") +
        value +
        (style.suffix || "");
    }

    // Determine color (element override for magical)
    let color = style.color;
    if (opts.guarded && type !== "crit") color = "#9edcff";
    if (
      type === "magical" &&
      opts.element &&
      ELEMENT_TEXT_COLORS[opts.element]
    ) {
      color = ELEMENT_TEXT_COLORS[opts.element];
    }

    // Configure text object
    t.setText(displayText)
      .setFontSize(
        Math.max(
          parseInt(style.fontSize),
          parseInt(portraitFontSize(this.scene, type === "crit" ? 18 : 16)),
        ),
      )
      .setColor(color)
      .setFontStyle(style.fontStyle || "bold")
      .setPosition(
        x + offset.dx + Phaser.Math.Between(-5, 5),
        // Defeat has its own lower status lane; damage fan-out must not pull
        // it back into a two-line critical number on the same target.
        y -
          (type === "crit" || opts.guarded ? 30 : 10) +
          (type === "defeated" ? 0 : offset.dy),
      )
      .setAlpha(1)
      .setActive(true)
      .setVisible(true)
      .setDepth(25);
    applyTextStroke(t, style.stroke || "#111111", style.strokeThickness || 2);

    t._targetKey = targetKey;
    t._resultType = type;
    t._usesStagger = type !== "defeated" && !opts.still;
    this.active.push(t);

    // Brief bounce on spawn so even normal hits read as impact.
    let startScale =
      reducedMotion || opts.still
        ? 1
        : Math.min(style.bounceScale || 1.12, 1.16);
    t.setScale(startScale);
    // Reserve actual multiline/bounce bounds above the name/status lane.
    // A high target can use a single-line critical so it stays above the head.
    if (Number.isFinite(opts.maxBottom)) {
      const margin = opts.gap ?? 10;
      let bounds = t.getBounds();
      if (opts.maxBottom - bounds.height < margin && t.text.includes("\n")) {
        t.setText(t.text.replaceAll("\n", " · "));
        bounds = t.getBounds();
      }
      if (opts.maxBottom - bounds.height < margin && startScale > 1) {
        startScale = 1;
        t.setScale(1);
        bounds = t.getBounds();
      }
      const width = this.scene.scale?.gameSize?.width || 800;
      t.setPosition(
        Math.max(
          bounds.width / 2 + margin,
          Math.min(width - bounds.width / 2 - margin, t.x),
        ),
        Math.max(
          margin + bounds.height / 2,
          Math.min(t.y, opts.maxBottom - bounds.height / 2),
        ),
      );
    }

    if (startScale > 1) {
      this.scene.tweens.add({
        targets: t,
        scaleX: 1,
        scaleY: 1,
        duration: type === "crit" ? 150 : 120,
        ease: "Back.easeOut",
      });
    }

    // Reading time is independent of battle speed. Hold full opacity first,
    // then fade; a critical must never blink while the player reads it.
    const readMs = type === "crit" ? 1500 : 1200;
    this.scene.tweens.add({
      targets: t,
      y: t.y - (reducedMotion || opts.still ? 0 : style.rise),
      duration: style.duration,
      ease: "Sine.Out",
    });
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      duration: style.duration - readMs,
      delay: readMs + (style.delay || 0),
      ease: "Sine.In",
      onComplete: () => this.release(t),
    });

    return new Promise((resolve) => {
      this.scene.time.delayedCall(150, resolve);
    });
  }

  spawnResult(x, y, value, type, targetKey, opts = {}) {
    // A sequential strike replaces only the prior result for this target,
    // after the scene has honored its independent full-opacity reading hold.
    if (opts.replaceTarget) {
      for (const text of [...this.active])
        if (text._targetKey === targetKey) this.release(text);
    }
    const pending = [];
    let maxBottom = opts.maxBottom;
    if (opts.groupResult) {
      // A simultaneous group result gets one stable number per target. The
      // scene reports defeats once, without repeating a wide status banner.
      return this.spawn(x, y, value, type, targetKey, { ...opts, still: true });
    }
    if (opts.defeated) {
      pending.push(
        this.spawn(
          x,
          Number.isFinite(maxBottom) ? maxBottom : y + 52,
          0,
          "defeated",
          targetKey,
          opts,
        ),
      );
      const status = this.active.at(-1);
      maxBottom = status.getBounds().top - (opts.gap ?? 10);
    }
    pending.push(
      this.spawn(x, y, value, type, targetKey, { ...opts, maxBottom }),
    );
    return Promise.all(pending);
  }

  destroy() {
    for (const t of this.pool) {
      this.scene.tweens.killTweensOf(t);
      t.destroy();
    }
    this.pool = [];
    this.active = [];
    this.targetCounts.clear();
  }
}

/**
 * Convenience wrapper for spawning floating text.
 */
export function spawnFloatingText(pool, x, y, value, type, targetKey, opts) {
  return pool.spawn(x, y, value, type, targetKey, opts);
}
