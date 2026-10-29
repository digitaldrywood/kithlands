import { describe, expect, it } from "vitest";
import { meadowPathPixel } from "./meadowPath.js";

describe("worn meadow paths", () => {
  it("keeps the middle of every junction and connected edge continuous", () => {
    for (let mask = 0; mask < 16; mask++)
      for (let variant = 0; variant < 8; variant++) {
        expect(meadowPathPixel(mask, 0, 8, 8, variant)).toBe(true);
        for (const [bit, x, y] of [
          [1, 8, 0],
          [2, 15, 8],
          [4, 8, 15],
          [8, 0, 8],
        ])
          if (mask & bit)
            expect(meadowPathPixel(mask, 0, x, y, variant)).toBe(true);
      }
  });
  it("leaves no grass pinholes inside a joined two-by-two road block", () => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        expect(meadowPathPixel(15, 15, x, y)).toBe(true);
  });
  it("has a bounded broken fringe and preserves bare surrounding grass", () => {
    const edge = new Set();
    for (let variant = 0; variant < 8; variant++) {
      expect(meadowPathPixel(5, 0, 0, 8, variant)).toBe(false);
      expect(meadowPathPixel(5, 0, 15, 8, variant)).toBe(false);
      edge.add(meadowPathPixel(5, 0, 3, 8, variant));
    }
    expect([...edge].sort()).toEqual([false, true]);
  });
});
