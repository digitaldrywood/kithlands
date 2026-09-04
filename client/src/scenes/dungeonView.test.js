import { describe, expect, it } from "vitest";
import { gameplayViewportLayout } from "../systems/gameplayViewport.js";
import {
  dungeonLayout,
  dungeonMapOffset,
  dungeonModel,
  dungeonPath,
  distanceToAction,
} from "./dungeonView.js";

describe("dungeon presentation input", () => {
  const grid = [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ];

  it("turns a map tap into only cardinal steps around visible collision", () => {
    const start = { x: 0, y: 1 };
    const path = dungeonPath(grid, start, { x: 3, y: 1 });
    expect(path).toHaveLength(5);
    let previous = start;
    for (const point of path) {
      expect(distanceToAction(previous, point)).toBe(1);
      expect(grid[point.y][point.x]).toBe(0);
      previous = point;
    }
    expect(previous).toEqual({ x: 3, y: 1 });
  });

  it("stops next to a blocked landmark without pretending to open it", () => {
    const target = { x: 2, y: 1 };
    const path = dungeonPath(grid, { x: 0, y: 1 }, target, true);
    expect(distanceToAction(path.at(-1), target)).toBe(1);
    expect(dungeonPath(grid, { x: 0, y: 1 }, target)).toBeNull();
  });

  it("rejects off-map and unreachable destinations", () => {
    expect(dungeonPath(grid, { x: 0, y: 0 }, { x: -1, y: 0 })).toBeNull();
    expect(dungeonPath([[0, 1, 0]], { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it("uses the saved server position without requiring an authored spawn anchor", () => {
    const map = {
      type: "map",
      orientation: "orthogonal",
      width: 4,
      height: 3,
      tilewidth: 32,
      tileheight: 32,
      properties: [{ name: "id", value: "room" }],
      layers: [
        { name: "ground", image: "/room.png" },
        {
          name: "collision",
          objects: [{ x: 32, y: 32, width: 32, height: 32 }],
        },
        { name: "foreground", image: "/canopy.png" },
      ],
    };
    const before = JSON.stringify(map);
    const model = dungeonModel({ map, position: { x: 2, y: 2 } });
    expect(model.spawn).toMatchObject({ x: 2, y: 2 });
    expect(model.tileData[1][1]).toBe(1);
    expect(model.foreground).toBe("/canopy.png");
    expect(JSON.stringify(map)).toBe(before);
  });

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [375, 667],
    [800, 600],
  ]) {
    it(`frames the room inside the field at ${width}×${height}`, () => {
      const layout = dungeonLayout(gameplayViewportLayout(width, height), {
        width: 24,
        height: 16,
      });
      expect(layout.tile).toBeGreaterThan(0);
      if (layout.portrait) {
        expect(layout.offsetY).toBeLessThanOrEqual(layout.top);
        expect(layout.offsetY + layout.mapHeight).toBeGreaterThanOrEqual(
          layout.bottom,
        );
        expect(layout.offsetX).toBeLessThanOrEqual(16);
        expect(layout.offsetX + layout.mapWidth).toBeGreaterThanOrEqual(
          layout.width - 16,
        );
      } else {
        expect(layout.offsetY).toBeGreaterThanOrEqual(layout.top);
        expect(layout.offsetY + layout.mapHeight).toBeLessThanOrEqual(
          layout.bottom,
        );
        expect(layout.offsetX).toBeGreaterThanOrEqual(0);
        expect(layout.offsetX + layout.mapWidth).toBeLessThanOrEqual(
          layout.width,
        );
      }
      expect(layout.bottom).toBeLessThan(
        layout.actionY - layout.buttonHeight / 2,
      );
    });
  }

  it("follows the party on a phone while clamping the camera to authored art", () => {
    const layout = dungeonLayout(
      gameplayViewportLayout(390, 844),
      { width: 24, height: 16 },
      { x: 12, y: 8 },
    );
    const center = dungeonMapOffset(layout, { x: 12, y: 8 });
    expect(center.offsetX + 12.5 * layout.tile).toBeCloseTo(layout.width / 2);
    const left = dungeonMapOffset(layout, { x: 0, y: 8 });
    expect(left.offsetX).toBe(16);
    const right = dungeonMapOffset(layout, { x: 23, y: 8 });
    expect(right.offsetX + layout.mapWidth).toBeCloseTo(layout.width - 16);
    expect(center.offsetY).toBe(layout.top);
  });
});
