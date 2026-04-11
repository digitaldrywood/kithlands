import { describe, it, expect } from "vitest";
import {
  applyDamage,
  applyHeal,
  formatHPLabel,
  hpBarFillWidth,
  hpBarColorPct,
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
