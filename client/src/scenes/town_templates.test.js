import { describe, expect, it } from "vitest";
import {
  T_CHEST_CLOSED,
  T_SECRET_WALL,
  T_STAIR_UP,
  TILE_WALKABLE,
  buildInteriorFromTemplate,
  interiorPresentationFromTemplate,
} from "./town_layout.js";

describe("buildInteriorFromTemplate", () => {
  it("builds authored floors with stairs, secret walls, and chest anchors", () => {
    const template = {
      id: "inn_2floor_a",
      building_type: "inn",
      floors: [
        {
          floor_id: 0,
          width: 6,
          height: 5,
          rows: ["WWWDWW", "W....W", "W.US.W", "W....W", "WWWWWW"],
          entrance: { x: 3, y: 0 },
          stairs: [{ x: 2, y: 2, to_floor: 1, to_x: 1, to_y: 1, kind: "up" }],
          chest_anchors: [{ id: "c1", x: 4, y: 2 }],
          npc_anchors: [{ role: "innkeeper", x: 1, y: 1 }],
          window_anchors: [{ x: 1, y: 0, side: "north" }],
          light_anchors: [{ x: 4, y: 1, kind: "lantern" }],
          presentation: {
            background_asset: "/interiors/inn/hearthside.png",
            hide_tile_layer: true,
          },
        },
      ],
    };

    const interior = buildInteriorFromTemplate(template, 0);

    expect(interior.roomW).toBe(6);
    expect(interior.roomH).toBe(5);
    expect(interior.tiles[2][2]).toBe(T_STAIR_UP);
    expect(interior.tiles[2][3]).toBe(T_SECRET_WALL);
    expect(interior.tiles[2][4]).toBe(T_CHEST_CLOSED);
    expect(interior.stairsByPosition.get("2,2")).toEqual({
      x: 2,
      y: 2,
      to_floor: 1,
      to_x: 1,
      to_y: 1,
      kind: "up",
    });
    expect(interior.chestAnchors).toEqual([{ id: "c1", x: 4, y: 2 }]);
    expect(interior.windowAnchors).toEqual([{ x: 1, y: 0, side: "north" }]);
    expect(interior.lightAnchors).toEqual([{ x: 4, y: 1, kind: "lantern" }]);
    expect(interior.presentation).toEqual({
      backgroundAsset: "/interiors/inn/hearthside.png",
      hideTileLayer: true,
      textureKey: "interior_background_inn_2floor_a_0",
      foreground: [],
      chestClosedAsset: null,
      chestOpenAsset: null,
    });
    expect(TILE_WALKABLE[T_SECRET_WALL]).toBe(true);
  });

  it("returns no presentation when a floor has no authored background", () => {
    expect(
      interiorPresentationFromTemplate(
        { id: "plain", floors: [{ floor_id: 0 }] },
        0,
      ),
    ).toBeNull();
  });
});
