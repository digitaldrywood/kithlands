import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWorldTileMapCache,
  rememberWorldCheckpoint,
  rememberWorldPosition,
  rememberWorldTileMap,
  worldDirectionForGame,
  worldPositionForGame,
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

  it("restores the server checkpoint and tracks same-game live movement", () => {
    expect(
      rememberWorldCheckpoint({
        id: "loaded",
        world_checkpoint: { x: 14, y: 9, world_node_id: "shrine" },
      }),
    ).toBe(true);
    expect(worldPositionForGame("loaded")).toEqual({ x: 14, y: 9 });

    rememberWorldPosition("loaded", { x: 15, y: 9 }, "right");
    expect(worldPositionForGame("loaded")).toEqual({ x: 15, y: 9 });
    expect(worldDirectionForGame("loaded")).toBe("right");
  });

  it("never reuses coordinates after another game is selected", () => {
    rememberWorldPosition("first", { x: 22, y: 17 }, "left");
    rememberWorldTileMap({ id: "second", tilemap: { width: 12 } });

    expect(worldPositionForGame("second")).toBeNull();
    expect(worldPositionForGame("first")).toBeNull();
    expect(worldDirectionForGame("second")).toBe("down");
  });
});
