import { describe, expect, it } from "vitest";
import {
  AUTOTILE_EDGE_EAST,
  AUTOTILE_EDGE_NORTH,
  AUTOTILE_EDGE_SOUTH,
  AUTOTILE_EDGE_WEST,
  buildTerrainRenderPlan,
} from "./terrainAutotile.js";

describe("buildTerrainRenderPlan", () => {
  it("adds a water-edge mask when a walkable ground tile borders water", () => {
    const tiles = [
      [0, 2, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    const plan = buildTerrainRenderPlan(tiles, 1, 1);

    expect(plan.baseKey).toBe("tile_grass");
    expect(plan.overlay).toEqual(
      expect.objectContaining({
        key: "tile_water",
        mask: AUTOTILE_EDGE_NORTH,
      }),
    );
  });

  it("builds a connected path mask from orthogonal neighbors", () => {
    const tiles = [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ];

    const plan = buildTerrainRenderPlan(tiles, 1, 1);

    expect(plan.baseKey).toBe("tile_grass");
    expect(plan.overlay).toEqual(
      expect.objectContaining({
        key: "tile_path",
        mask:
          AUTOTILE_EDGE_NORTH |
          AUTOTILE_EDGE_EAST |
          AUTOTILE_EDGE_SOUTH |
          AUTOTILE_EDGE_WEST,
      }),
    );
  });

  it("prefers the strongest adjacent terrain for grass-to-forest blending", () => {
    const tiles = [
      [0, 10, 0],
      [10, 0, 10],
      [0, 10, 0],
    ];

    const plan = buildTerrainRenderPlan(tiles, 1, 1);

    expect(plan.baseKey).toBe("tile_grass");
    expect(plan.overlay).toEqual(
      expect.objectContaining({
        key: "tile_forest",
        mask:
          AUTOTILE_EDGE_NORTH |
          AUTOTILE_EDGE_EAST |
          AUTOTILE_EDGE_SOUTH |
          AUTOTILE_EDGE_WEST,
      }),
    );
  });

  it("renders bridges over adjacent river tiles instead of nearby grass", () => {
    const tiles = [
      [0, 15, 0],
      [1, 18, 1],
      [0, 15, 0],
    ];

    const plan = buildTerrainRenderPlan(tiles, 1, 1);

    expect(plan.baseKey).toBe("tile_river");
    expect(plan.overlay).toEqual(
      expect.objectContaining({
        key: "tile_bridge",
        mask: AUTOTILE_EDGE_EAST | AUTOTILE_EDGE_WEST,
      }),
    );
  });
  it.each([0, 9, 11, 12, 13, 16])(
    "connects a footbridge deck to land tile %s",
    (bank) => {
      const horizontal = [
        [15, 15, 15],
        [bank, 18, bank],
        [15, 15, 15],
      ];
      const vertical = [
        [15, bank, 15],
        [15, 18, 15],
        [15, bank, 15],
      ];
      expect(buildTerrainRenderPlan(horizontal, 1, 1).overlay.mask).toBe(
        AUTOTILE_EDGE_EAST | AUTOTILE_EDGE_WEST,
      );
      expect(buildTerrainRenderPlan(vertical, 1, 1).overlay.mask).toBe(
        AUTOTILE_EDGE_NORTH | AUTOTILE_EDGE_SOUTH,
      );
    },
  );
});

describe("joined road surfaces", () => {
  it("fills all four shared corners inside a solid plaza", () => {
    const tiles = Array.from({ length: 3 }, () => [1, 1, 1]);
    expect(buildTerrainRenderPlan(tiles, 1, 1).overlay.corners).toBe(15);
  });
  it("keeps the outside of an unfilled bend as ground", () => {
    expect(
      buildTerrainRenderPlan(
        [
          [0, 1, 0],
          [0, 1, 1],
          [0, 0, 0],
        ],
        1,
        1,
      ).overlay.corners,
    ).toBe(0);
  });
  it("does not bridge a diagonal gap between separate paths", () => {
    expect(
      buildTerrainRenderPlan(
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        1,
        1,
      ).overlay.corners,
    ).toBe(0);
  });
});
