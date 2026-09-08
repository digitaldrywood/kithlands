import { describe, expect, it, vi } from "vitest";
import {
  cancelDungeonRoute,
  dungeonRouteForScene,
  planDungeonWaypointPath,
} from "./dungeonRoute.js";

function openMap(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(0));
}

describe("Forgotten Shrine world route", () => {
  it("selects the authored remote route without exposing it as an entrance", () => {
    const scene = {
      gameState: {
        phase: "world",
        current_location: { kind: "world", world_node_id: "central" },
        dungeon_entries: [
          { id: "mill", title: "Old Mill", node_id: "central" },
          {
            id: "shrine",
            title: "Forgotten Shrine",
            node_id: "person_1",
            route_node_ids: ["place_1", "person_1"],
          },
        ],
      },
      spawns: [{ node_id: "person_1", x: 13, y: 5 }],
    };
    expect(dungeonRouteForScene(scene)?.id).toBe("shrine");
  });

  it("walks through unrelated landmarks on the way to the entrance", () => {
    const spawns = [
      { node_id: "central", x: 1, y: 5 },
      { node_id: "person_0", x: 7, y: 5 },
      { node_id: "place_1", x: 13, y: 5 },
    ];
    const path = planDungeonWaypointPath({
      tileData: openMap(16, 12),
      start: { x: 1, y: 5 },
      target: spawns[2],
      spawns,
      currentNodeID: "central",
      canWalk: () => true,
    });
    expect(path).not.toBeNull();
    expect(path.some((point) => distance(point, spawns[1]) === 0)).toBe(true);
    expect(distance(path.at(-1), spawns[2])).toBeLessThanOrEqual(2);
  });

  it("keeps a crowded narrow route available", () => {
    const spawns = [
      { node_id: "central", x: 0, y: 1 },
      { node_id: "person_0", x: 4, y: 1 },
      { node_id: "place_1", x: 8, y: 1 },
    ];
    expect(
      planDungeonWaypointPath({
        tileData: openMap(9, 3),
        start: { x: 0, y: 1 },
        target: spawns[2],
        spawns,
        currentNodeID: "central",
        canWalk: () => true,
      }),
    ).not.toBeNull();
  });

  it("does not route through impassable water", () => {
    const tiles = openMap(9, 3);
    for (const row of tiles) row[4] = 1;
    const target = { node_id: "shrine", x: 8, y: 1 };
    expect(
      planDungeonWaypointPath({
        tileData: tiles,
        start: { x: 0, y: 1 },
        target,
        spawns: [target],
        canWalk: (tile) => tile === 0,
      }),
    ).toBeNull();
  });

  it("finishes inside the target's nearest-location area when entrances overlap", () => {
    const spawns = [
      { node_id: "other", x: 5, y: 1 },
      { node_id: "shrine", x: 7, y: 1 },
    ];
    const path = planDungeonWaypointPath({
      tileData: openMap(10, 3),
      start: { x: 0, y: 1 },
      target: spawns[1],
      spawns,
      canWalk: () => true,
    });
    expect(distance(path.at(-1), spawns[1])).toBeLessThan(
      distance(path.at(-1), spawns[0]),
    );
  });

  it("cancels an interrupted route and clears its guide", () => {
    const marker = { destroy: vi.fn() };
    const token = { cancelled: false };
    const scene = {
      dungeonRouteToken: token,
      dungeonRouteRunning: true,
      currentDungeonRouteID: "forgotten-shrine",
      dungeonRouteGuide: [marker],
    };

    cancelDungeonRoute(scene);

    expect(token.cancelled).toBe(true);
    expect(scene.dungeonRouteRunning).toBe(false);
    expect(scene.currentDungeonRouteID).toBeNull();
    expect(scene.dungeonRouteGuide).toEqual([]);
    expect(marker.destroy).toHaveBeenCalledOnce();
  });
});

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
