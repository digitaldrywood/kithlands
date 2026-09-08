import { setPathMode } from "../systems/prefs.js";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  dungeonAction: vi.fn(),
  transitionLocation: vi.fn(),
}));
vi.mock("../api.js", () => api);

import {
  dungeonEntryForScene,
  dungeonEntryVisible,
  enterDungeon,
  updateDungeonEntry,
} from "./dungeonEntry.js";

describe("dungeon entrance presentation", () => {
  const scene = () => ({
    gameState: {
      phase: "exploration",
      current_location: { kind: "world", world_node_id: "home" },
      dungeon_entry: { node_id: "home" },
    },
    spawns: [
      { node_id: "home", x: 8, y: 8 },
      { node_id: "other", x: 20, y: 20 },
    ],
    playerX: 8,
    playerY: 10,
  });

  it("recreates native trail controls after the World scene restarts", () => {
    setPathMode(true);
    const current = scene();
    current.gameState.dungeon_entries = [
      { node_id: "home" },
      {
        node_id: "other",
        title: "Other trail",
        route_node_ids: ["home", "other"],
      },
    ];
    const shutdown = [];
    current.events = { once: (_event, callback) => shutdown.push(callback) };
    current.explorationHUD = {
      trail: vi.fn(() => ({
        setLabel: vi.fn(),
        setEnabled: vi.fn(),
        destroy: vi.fn(),
      })),
    };
    updateDungeonEntry(current);
    const first = current.dungeonEntryButton;
    const firstRoute = current.dungeonRouteButton;
    expect(first).toBeTruthy();
    expect(firstRoute).toBeTruthy();
    for (const callback of shutdown) callback();
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(current.dungeonEntryButton).toBeNull();
    expect(firstRoute.destroy).toHaveBeenCalledOnce();
    expect(current.dungeonRouteButton).toBeNull();
    updateDungeonEntry(current);
    expect(current.dungeonEntryButton).not.toBe(first);
    expect(current.dungeonRouteButton).not.toBe(firstRoute);
    expect(current.explorationHUD.trail).toHaveBeenCalledTimes(4);
    setPathMode(false);
    updateDungeonEntry(current);
    expect(current.dungeonRouteButton).toBeNull();
    expect(current.dungeonEntryButton).toBeTruthy();
  });

  it("offers the trail only near the home locality entrance", () => {
    const current = scene();
    expect(dungeonEntryVisible(current)).toBe(true);
    current.playerX = 20;
    current.playerY = 20;
    expect(dungeonEntryVisible(current)).toBe(false);
  });

  it("requires the server-authorized world node even when locally nearby", () => {
    const current = scene();
    current.gameState.current_location.world_node_id = "other";
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

  it("selects the nearby authored adventure from the dungeon catalog", () => {
    const current = scene();
    current.gameState.dungeon_entries = [
      { id: "old-mill", node_id: "home" },
      { id: "forgotten-shrine", node_id: "other" },
    ];
    current.gameState.current_location.world_node_id = "other";
    current.playerX = 20;
    current.playerY = 19;

    expect(dungeonEntryForScene(current)?.id).toBe("forgotten-shrine");
  });

  it("checkpoints the exact world tile before dungeon entry", async () => {
    const current = scene();
    current.gameState.id = "game";
    current.gameState.dungeon_entry = {
      id: "old-mill",
      node_id: "home",
    };
    current.animating = false;
    current.gameOver = false;
    current.scene = { isActive: () => true, start: vi.fn() };
    current.updateHUD = vi.fn();
    current.showMessage = vi.fn();
    api.transitionLocation.mockResolvedValue({
      ...current.gameState,
      world_checkpoint: { x: 8, y: 10, world_node_id: "home" },
    });
    const entered = {
      ...current.gameState,
      current_location: { kind: "dungeon", world_node_id: "home" },
    };
    api.dungeonAction.mockResolvedValue(entered);

    await enterDungeon(current);

    expect(api.transitionLocation).toHaveBeenCalledWith(
      "game",
      "arrive-world-node",
      "home",
      { x: 8, y: 10 },
    );
    expect(api.dungeonAction).toHaveBeenCalledWith("game", {
      type: "enter",
      node_id: "home",
      world_position: { x: 8, y: 10 },
    });
    expect(current.scene.start).toHaveBeenCalledWith("Dungeon", {
      gameState: entered,
    });
  });
});
