import { describe, it, expect } from "vitest";
import { interiorFraming } from "./interiorCamera.js";
import { gameplayViewportLayout } from "../systems/gameplayViewport.js";

describe("portrait interior framing", () => {
  it.each([
    [390, 844],
    [375, 667],
    [600, 601],
  ])("preserves actor scale and a positive field at %sx%s", (vw, vh) => {
    const l = gameplayViewportLayout(vw, vh),
      f = interiorFraming(l, 512, 448);
    expect((512 * f.zoom) / l.width).toBeGreaterThan(0.9);
    expect(f.viewport.y).toBeGreaterThanOrEqual(120);
    expect(f.viewport.height).toBeGreaterThanOrEqual(64);
    expect(f.viewport.y + f.viewport.height).toBeLessThanOrEqual(
      l.controlArea.dpadTop - 95.99,
    );
  });
  it("pans a tall hall rather than making actors smaller", () => {
    const l = gameplayViewportLayout(375, 667),
      a = interiorFraming(l, 512, 448),
      b = interiorFraming(l, 512, 1024);
    expect(b.zoom).toBe(a.zoom);
    expect(b.viewport.height).toBeLessThan(1024 * b.zoom);
  });
  it("keeps desktop framing unchanged", () =>
    expect(
      interiorFraming(gameplayViewportLayout(1440, 900), 512, 448),
    ).toEqual({ zoom: 1, viewport: null }));
});
