import { describe, it, expect, vi } from "vitest";
import {
  applyDamage,
  applyHeal,
  formatHPLabel,
  hpBarFillWidth,
  hpBarColorPct,
  hpConditionLabel,
  combatantConditionLabel,
  barFillWidth,
  barLabel,
  tweenBarTo,
} from "./hpBar.js";

// These tests pin the issue #69 repro: an enemy with max_hp=7 and current
// hp=3 who takes 3 damage must end at exactly 0 HP — not 0.9999... from a
// float-reconstructed intermediate state — and the label must render as
// "0/7" so a drifted bar never paints a "1 HP" sliver on a dead enemy.

describe("applyDamage", () => {
  it("clamps lethal damage to 0", () => {
    expect(applyDamage(3, 3)).toBe(0);
    expect(applyDamage(3, 10)).toBe(0);
  });

  it("produces exact integer HP for non-even ratios", () => {
    expect(applyDamage(7, 4)).toBe(3);
    expect(applyDamage(100, 33)).toBe(67);
  });

  it("never returns a fractional value", () => {
    for (const cur of [1, 3, 7, 13, 100]) {
      for (const dmg of [0, 1, 2, 3, 50, 1000]) {
        const out = applyDamage(cur, dmg);
        expect(Number.isInteger(out)).toBe(true);
      }
    }
  });

  it("ignores malformed inputs instead of producing NaN", () => {
    expect(applyDamage(undefined, 3)).toBe(0);
    expect(applyDamage(7, undefined)).toBe(7);
    expect(applyDamage("foo", "bar")).toBe(0);
  });
});

describe("applyHeal", () => {
  it("clamps at maxHP", () => {
    expect(applyHeal(10, 50, 20)).toBe(20);
  });

  it("returns integer HP", () => {
    expect(applyHeal(3, 5, 20)).toBe(8);
    expect(Number.isInteger(applyHeal(1, 30, 50))).toBe(true);
  });
});

describe("formatHPLabel", () => {
  it("never shows fractional values even for drifted floats", () => {
    expect(formatHPLabel(0.9999999, 7)).toBe("0/7");
    expect(formatHPLabel(1.9999999, 7)).toBe("1/7");
    expect(formatHPLabel(-1, 7)).toBe("0/7");
  });

  it("pins the issue #69 repro: max_hp=7, hp=3, take 3 damage → 0/7", () => {
    const after = applyDamage(3, 3);
    expect(formatHPLabel(after, 7)).toBe("0/7");
  });
});

describe("hpBarFillWidth", () => {
  it("returns 0 for dead HP so no pixel sliver remains", () => {
    expect(hpBarFillWidth(0, 7, 65)).toBe(0);
    expect(hpBarFillWidth(-1, 7, 65)).toBe(0);
  });

  it("returns an integer pixel count", () => {
    expect(Number.isInteger(hpBarFillWidth(3, 7, 65))).toBe(true);
    expect(Number.isInteger(hpBarFillWidth(5, 8, 100))).toBe(true);
  });

  it("never exceeds the total bar width", () => {
    expect(hpBarFillWidth(100, 10, 65)).toBeLessThanOrEqual(65);
    expect(hpBarFillWidth(10, 10, 65)).toBe(65);
  });

  it("handles max HP of 0 gracefully", () => {
    expect(hpBarFillWidth(5, 0, 65)).toBe(0);
  });

  it("guarantees at least 1 pixel for any positive HP so low-HP combatants are not invisible", () => {
    // Regression for the "floor-the-ratio" bug: 1 HP out of 100 on the
    // 65px enemy bar would naively floor to 0.65 → 0 pixels, making a
    // living enemy look dead. Same for 1/200 on the 85px party bar.
    expect(hpBarFillWidth(1, 100, 65)).toBeGreaterThanOrEqual(1);
    expect(hpBarFillWidth(1, 200, 85)).toBeGreaterThanOrEqual(1);
    expect(hpBarFillWidth(1, 999, 65)).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 when total width is 0 or negative", () => {
    expect(hpBarFillWidth(5, 10, 0)).toBe(0);
    expect(hpBarFillWidth(5, 10, -1)).toBe(0);
  });
});

describe("hpBarColorPct", () => {
  it("is 0 for dead or missing HP", () => {
    expect(hpBarColorPct(0, 7)).toBe(0);
    expect(hpBarColorPct(-5, 7)).toBe(0);
    expect(hpBarColorPct(5, 0)).toBe(0);
  });

  it("is capped at 1 for over-max values", () => {
    expect(hpBarColorPct(20, 10)).toBe(1);
  });
});

describe("color-independent HP conditions", () => {
  it("mirrors the existing health color thresholds with text", () => {
    expect(hpConditionLabel(51, 100)).toBe("");
    expect(hpConditionLabel(50, 100)).toBe("LOW HP");
    expect(hpConditionLabel(25, 100)).toBe("CRITICAL");
    expect(hpConditionLabel(1, 100)).toBe("CRITICAL");
    expect(hpConditionLabel(0, 100)).toBe("KO");
  });

  it("does not infer a false KO when maximum HP is unavailable", () => {
    expect(hpConditionLabel(0, 0)).toBe("");
    expect(hpConditionLabel(undefined, undefined)).toBe("");
  });

  it("combines abnormal status and low health while keeping KO concise", () => {
    expect(combatantConditionLabel(40, 100, "poison")).toBe("POISON · LOW HP");
    expect(combatantConditionLabel(80, 100, "turned_to_stone")).toBe(
      "TURNED TO STONE",
    );
    expect(combatantConditionLabel(0, 100, "poison")).toBe("KO");
    expect(combatantConditionLabel(80, 100, "normal")).toBe("");
  });
});

describe("generic bar aliases (issue #94)", () => {
  it("barFillWidth mirrors hpBarFillWidth exactly", () => {
    for (const [cur, max, w] of [
      [0, 10, 100],
      [3, 7, 65],
      [1, 999, 65],
      [10, 10, 65],
      [50, 100, 200],
    ]) {
      expect(barFillWidth(cur, max, w)).toBe(hpBarFillWidth(cur, max, w));
    }
  });

  it("barLabel mirrors formatHPLabel exactly", () => {
    expect(barLabel(3, 7)).toBe(formatHPLabel(3, 7));
    expect(barLabel(0, 0)).toBe(formatHPLabel(0, 0));
    expect(barLabel(12, 20)).toBe("12/20");
  });
});

describe("tweenBarTo", () => {
  it("dispatches a tween to the scene targeting the fill rect", () => {
    const addTween = vi.fn();
    const scene = { tweens: { add: addTween } };
    const fillRect = { width: 50 };
    tweenBarTo(scene, fillRect, 5, 10, 100, { duration: 200 });
    expect(addTween).toHaveBeenCalledTimes(1);
    const arg = addTween.mock.calls[0][0];
    expect(arg.targets).toBe(fillRect);
    expect(arg.duration).toBe(200);
    expect(arg.width).toBe(barFillWidth(5, 10, 100));
  });

  it("returns null and no-ops when scene or fill rect is missing", () => {
    expect(tweenBarTo(null, { width: 0 }, 5, 10, 100)).toBe(null);
    expect(tweenBarTo({ tweens: { add: () => {} } }, null, 5, 10, 100)).toBe(
      null,
    );
  });
});
