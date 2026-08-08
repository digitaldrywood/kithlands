import { describe, expect, it } from "vitest";

import {
  battleHudLayout,
  gameLogicalSizeForViewport,
  rectsOverlap,
} from "./battle_hud_layout.js";

function expectContained(rect, height = 600) {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(800);
  expect(rect.y + rect.height).toBeLessThanOrEqual(height);
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
    [layout.command, layout.message, layout.party].forEach((rect) =>
      expectContained(rect),
    );
  });

  it("reflows party status below commands and history on mobile", () => {
    const layout = battleHudLayout({ viewportWidth: 390, viewportHeight: 844 });
    expect(layout.mode).toBe("mobile");
    expect(layout.gameHeight).toBe(1600);
    expect(rectsOverlap(layout.command, layout.message)).toBe(false);
    expect(layout.party.y).toBeGreaterThan(layout.command.y);
    expect(layout.party.width).toBe(768);
    [layout.command, layout.message, layout.party].forEach((rect) =>
      expectContained(rect, layout.gameHeight),
    );
  });

  it("uses a tall logical canvas so portrait text and controls remain legible", () => {
    expect(
      gameLogicalSizeForViewport({ viewportWidth: 390, viewportHeight: 844 }),
    ).toEqual({ width: 800, height: 1600 });
    expect(
      gameLogicalSizeForViewport({ viewportWidth: 1280, viewportHeight: 720 }),
    ).toEqual({ width: 800, height: 600 });
  });
});
