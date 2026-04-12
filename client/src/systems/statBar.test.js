import { describe, expect, it } from "vitest";

import { barFillWidth, barLabel } from "./hpBar.js";

// Issue #136: The shared `barFillWidth` helper (exported as an alias of
// `hpBarFillWidth` from hpBar.js) is reused for MP bars in battle.js,
// world_menu.js, and character_detail.js. These tests pin MP-specific edge
// cases called out in the issue body so a regression in the shared helper
// shows up as a failing MP-bar test, not as a silent visual glitch in the
// three scenes that consume it.
describe("MP bar fill width (barFillWidth)", () => {
  it("empty MP renders 0 px", () => {
    expect(barFillWidth(0, 10, 100)).toBe(0);
  });

  it("half MP renders half width", () => {
    expect(barFillWidth(5, 10, 100)).toBe(50);
  });

  it("full MP renders full width", () => {
    expect(barFillWidth(10, 10, 100)).toBe(100);
  });

  it("over-cap MP clamps to full width", () => {
    expect(barFillWidth(11, 10, 100)).toBe(100);
  });

  it("very low MP still renders at least 1 px so a live caster never reads as dead", () => {
    expect(barFillWidth(1, 100, 65)).toBe(1);
  });

  it("negative MP floors to 0 px", () => {
    expect(barFillWidth(-5, 10, 100)).toBe(0);
  });

  it("zero max MP floors to 0 px (non-casters)", () => {
    expect(barFillWidth(0, 0, 100)).toBe(0);
  });
});

describe("MP bar label (barLabel)", () => {
  it("formats as cur/max integers", () => {
    expect(barLabel(5, 10)).toBe("5/10");
  });

  it("clamps negative current to 0 without mutating max", () => {
    expect(barLabel(-3, 10)).toBe("0/10");
  });
});
