import { describe, expect, it } from "vitest";
import { updateWorldTerrainVisibility } from "./worldTerrainVisibility.js";
describe("terrain camera visibility", () => {
  it("keeps edge tiles and restores tiles when the view moves or zooms out", () => {
    const tiles = [0, 32, 64, 96, 128, 160, 320].map((x) => ({
      x,
      y: 0,
      visible: true,
    }));
    updateWorldTerrainVisibility(tiles, { x: 0, y: 0, width: 64, height: 64 });
    expect(tiles.map((t) => t.visible)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    updateWorldTerrainVisibility(tiles, {
      x: 256,
      y: 0,
      width: 64,
      height: 64,
    });
    expect(tiles.map((t) => t.visible)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    updateWorldTerrainVisibility(tiles, {
      x: 0,
      y: 0,
      width: 640,
      height: 480,
    });
    expect(tiles.every((t) => t.visible)).toBe(true);
  });
  it("also excludes rows outside the camera", () => {
    const tiles = [
      { x: 0, y: 0 },
      { x: 0, y: 320 },
    ];
    updateWorldTerrainVisibility(tiles, {
      x: 0,
      y: 256,
      width: 64,
      height: 64,
    });
    expect(tiles.map((t) => t.visible)).toEqual([false, true]);
  });
});
