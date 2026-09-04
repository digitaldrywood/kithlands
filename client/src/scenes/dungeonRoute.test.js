import { describe, expect, it } from "vitest";
import {
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

  it("detours around an off-route marker before reaching the next waypoint", () => {
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
    expect(path.every((point) => distance(point, spawns[1]) > 3)).toBe(true);
    expect(distance(path.at(-1), spawns[2])).toBeLessThanOrEqual(2);
  });

  it("reports an unavailable route when a small map cannot avoid the off-route marker", () => {
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
    ).toBeNull();
  });
});

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
