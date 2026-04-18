import Phaser from "phaser";

// ── Style definitions per damage type ──────────────────────────────────
const FLOAT_STYLES = {
  physical: {
    color: "#ffffff",
    fontSize: "22px",
    rise: 52,
    duration: 1040,
    prefix: "-",
    bounceScale: 1.18,
    stroke: "#111111",
    strokeThickness: 2,
  },
  crit: {
    color: "#ffcc00",
    fontSize: "30px",
    rise: 60,
    duration: 980,
    prefix: "-",
    suffix: "!",
    bounceScale: 1.34,
    stroke: "#1f1300",
    strokeThickness: 2,
  },
  magical: {
    color: "#bb88ff",
    fontSize: "22px",
    rise: 48,
    duration: 960,
    prefix: "-",
    bounceScale: 1.18,
    stroke: "#111111",
    strokeThickness: 2,
  },
  heal: {
    color: "#44ff44",
    fontSize: "20px",
    rise: 44,
    duration: 920,
    prefix: "+",
    bounceScale: 1.12,
    stroke: "#0b1a0b",
    strokeThickness: 2,
  },
  miss: {
    color: "#888888",
    fontSize: "14px",
    rise: 28,
    duration: 680,
    text: "MISS",
    fontStyle: "italic",
    bounceScale: 1.1,
    stroke: "#111111",
    strokeThickness: 2,
  },
  party_hit: {
    color: "#ff8800",
    fontSize: "26px",
    rise: 56,
    duration: 1080,
    prefix: "-",
    bounceScale: 1.22,
    stroke: "#140808",
    strokeThickness: 2,
  },
  defeated: {
    color: "#ff4444",
    fontSize: "11px",
    rise: 0,
    duration: 1000,
    delay: 300,
    text: "DEFEATED!",
    bounceScale: 1.08,
    stroke: "#220808",
    strokeThickness: 2,
  },
};

// Element color overrides for magical damage
const ELEMENT_TEXT_COLORS = {
  fire: "#ff4444",
  ice: "#44aaff",
  lightning: "#ffff44",
  holy: "#ffffff",
  dark: "#cc66ff",
};

const POOL_SIZE = 24;
const MAX_PER_TARGET = 6;
const STAGGER_X = 18;
const STAGGER_Y = 14;
const STAGGER_WINDOW = 150; // ms

const BASE_STYLE = {
  fontSize: "16px",
  color: "#ffffff",
  fontFamily: "monospace",
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
      this._decrementTarget(t._targetKey);
      t._targetKey = null;
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

    this._enforceTargetCap(targetKey);
    const offset = this._getStaggerOffset(targetKey);
    const t = this.acquire();

    // Build display text
    let displayText = style.text;
    if (!displayText) {
      displayText = (style.prefix || "") + value + (style.suffix || "");
    }

    // Determine color (element override for magical)
    let color = style.color;
    if (
      type === "magical" &&
      opts.element &&
      ELEMENT_TEXT_COLORS[opts.element]
    ) {
      color = ELEMENT_TEXT_COLORS[opts.element];
    }

    // Configure text object
    t.setText(displayText)
      .setFontSize(parseInt(style.fontSize))
      .setColor(color)
      .setFontStyle(style.fontStyle || "bold")
      .setPosition(
        x + offset.dx + Phaser.Math.Between(-5, 5),
        y - 10 + offset.dy,
      )
      .setAlpha(1)
      .setActive(true)
      .setVisible(true)
      .setDepth(25);
    applyTextStroke(t, style.stroke || "#111111", style.strokeThickness || 2);

    t._targetKey = targetKey;
    this.active.push(t);

    // Brief bounce on spawn so even normal hits read as impact.
    const startScale = style.bounceScale || 1.12;
    t.setScale(startScale);

    if (startScale > 1) {
      this.scene.tweens.add({
        targets: t,
        scaleX: 1,
        scaleY: 1,
        duration: type === "crit" ? 150 : 120,
        ease: "Back.easeOut",
      });
    }

    if (type === "crit") {
      this.scene.tweens.add({
        targets: t,
        alpha: { from: 0.75, to: 1 },
        duration: 90,
        yoyo: true,
        repeat: 1,
      });
    }

    // Main rise + fade tween
    this.scene.tweens.add({
      targets: t,
      y: t.y - style.rise,
      alpha: 0,
      duration: style.duration,
      delay: style.delay || 0,
      ease: "Quad.Out",
      onComplete: () => this.release(t),
    });

    return new Promise((resolve) => {
      this.scene.time.delayedCall(150, resolve);
    });
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
