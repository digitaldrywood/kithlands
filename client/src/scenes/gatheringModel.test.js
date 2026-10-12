import { describe, expect, it } from "vitest";
import { nearbyResource } from "./gatheringModel.js";

describe("resource interaction targeting", () => {
  it("prefers the nearest available resource within one tile", () => {
    const nodes = [
      { id: "adjacent", x: 4, y: 5 },
      { id: "here", x: 4, y: 4 },
      { id: "depleted", x: 4, y: 4, gathered: true },
    ];
    expect(nearbyResource(nodes, 4, 4).id).toBe("here");
    expect(nearbyResource(nodes, 8, 8)).toBeNull();
  });
  it("does not offer depleted or diagonal patches", () => {
    expect(
      nearbyResource(
        [
          { x: 1, y: 1 },
          { x: 0, y: 1, gathered: true },
        ],
        0,
        0,
      ),
    ).toBeNull();
  });
});
