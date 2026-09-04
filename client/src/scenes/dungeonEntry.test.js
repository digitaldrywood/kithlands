import { describe, expect, it } from "vitest";
import { dungeonEntryVisible } from "./dungeonEntry.js";

describe("dungeon entrance presentation", () => {
  const scene = () => ({
    gameState: {
      phase: "exploration",
      current_location: { kind: "world" },
      dungeon_entry: { node_id: "home" },
    },
    spawns: [
      { node_id: "home", x: 8, y: 8 },
      { node_id: "other", x: 20, y: 20 },
    ],
    playerX: 8,
    playerY: 10,
  });

  it("offers the trail only near the home locality entrance", () => {
    const current = scene();
    expect(dungeonEntryVisible(current)).toBe(true);
    current.playerX = 20;
    current.playerY = 20;
    expect(dungeonEntryVisible(current)).toBe(false);
  });

  it("uses an authored settlement exit and the matching home node", () => {
    const current = scene();
    current.gameState.current_location = {
      kind: "settlement",
      world_node_id: "home",
    };
    current.model = {
      tileWidth: 32,
      tileHeight: 32,
      interactions: [{ type: "exit", x: 256, y: 384 }],
    };
    expect(dungeonEntryVisible(current)).toBe(true);
    current.gameState.current_location.world_node_id = "other";
    expect(dungeonEntryVisible(current)).toBe(false);
  });

  it("never exposes an entrance during combat or inside another room", () => {
    const current = scene();
    current.gameState.phase = "combat";
    expect(dungeonEntryVisible(current)).toBe(false);
    current.gameState.phase = "exploration";
    current.gameState.current_location.kind = "interior";
    expect(dungeonEntryVisible(current)).toBe(false);
  });
});
