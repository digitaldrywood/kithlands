import { describe, expect, it } from "vitest";
import { resolveWorldStartPosition } from "./worldPosition.js";

function map(width, height, tile = 0) {
  return Array.from({ length: height }, () => Array(width).fill(tile));
}

function resolve(overrides = {}) {
  const tileData = overrides.tileData || map(12, 8);
  return resolveWorldStartPosition({
    tileData,
    width: tileData[0].length,
    height: tileData.length,
    spawns: [{ node_id: "shrine", x: 9, y: 4 }],
    currentNodeID: "shrine",
    preferredPosition: null,
    defaultPosition: { x: 1, y: 1 },
    canWalk: (tile) => tile === 0,
    ...overrides,
  });
}

describe("fresh world position restoration", () => {
  it("preserves a valid same-session tile checkpoint", () => {
    expect(resolve({ preferredPosition: { x: 4, y: 6 } })).toEqual({
      x: 4,
      y: 6,
    });
  });

  it("anchors a fresh load at the authoritative remote node", () => {
    expect(resolve()).toEqual({ x: 9, y: 4 });
  });

  it("chooses a nearby walkable tile when the node marker is blocked", () => {
    const tileData = map(12, 8);
    tileData[4][9] = 7;
    expect(resolve({ tileData })).toEqual({ x: 9, y: 3 });
  });

  it("falls back safely for a stale node id or blocked neighborhood", () => {
    expect(resolve({ currentNodeID: "missing" })).toEqual({ x: 1, y: 1 });
    const tileData = map(12, 8);
    for (let y = 1; y <= 7; y += 1) {
      for (let x = 6; x <= 11; x += 1) tileData[y][x] = 7;
    }
    expect(resolve({ tileData })).toEqual({ x: 1, y: 1 });
  });
});
