import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWorldTileMapCache,
  rememberWorldTileMap,
  worldTileMapForGame,
} from "./worldMapCache.js";

beforeEach(() => clearWorldTileMapCache());

describe("world tilemap cache", () => {
  it("shares a loaded map with later responses from the same game", () => {
    const tilemap = { width: 12, height: 8 };
    expect(rememberWorldTileMap({ id: "loaded", tilemap })).toBe(true);
    expect(worldTileMapForGame("loaded")).toBe(tilemap);
  });

  it("rejects a stale map from another game", () => {
    rememberWorldTileMap({ id: "first", tilemap: { width: 12 } });
    expect(worldTileMapForGame("second")).toBeNull();
    expect(rememberWorldTileMap({ id: "second" })).toBe(false);
  });
});
