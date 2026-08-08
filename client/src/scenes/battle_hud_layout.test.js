import { describe, expect, it } from "vitest";

import { battleHudLayout, rectsOverlap } from "./battle_hud_layout.js";

function expectContained(rect) {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(800);
  expect(rect.y + rect.height).toBeLessThanOrEqual(600);
}

describe("battleHudLayout", () => {
  it("uses three separated desktop regions", () => {
    const layout = battleHudLayout({
      viewportWidth: 1280,
      viewportHeight: 720,
    });
    expect(layout.mode).toBe("desktop");
    expect(rectsOverlap(layout.command, layout.message)).toBe(false);
    expect(rectsOverlap(layout.message, layout.party)).toBe(false);
    expect(layout.message.x - (layout.command.x + layout.command.width)).toBe(
      8,
    );
    expect(layout.party.x - (layout.message.x + layout.message.width)).toBe(8);
    [layout.command, layout.message, layout.party].forEach(expectContained);
  });

  it("reflows party status below commands and history on mobile", () => {
    const layout = battleHudLayout({ viewportWidth: 390, viewportHeight: 844 });
    expect(layout.mode).toBe("mobile");
    expect(rectsOverlap(layout.command, layout.message)).toBe(false);
    expect(layout.party.y).toBeGreaterThan(layout.command.y);
    expect(layout.party.width).toBe(784);
    [layout.command, layout.message, layout.party].forEach(expectContained);
  });
});
