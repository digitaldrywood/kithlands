import cadott from "../../../shared/settlements/cadott-town.json";
import { describe, expect, it } from "vitest";
import {
  buildSettlementModel,
  interactionAt,
  objectProperty,
} from "./settlementMap.js";

function testMap() {
  return {
    type: "map",
    orientation: "orthogonal",
    width: 4,
    height: 3,
    tilewidth: 32,
    tileheight: 32,
    properties: [{ name: "id", value: "test-town" }],
    layers: [
      { name: "ground", image: "/maps/test.png" },
      {
        name: "collision",
        objects: [{ name: "wall", x: 0, y: 0, width: 32, height: 32 }],
      },
      {
        name: "interactions",
        objects: [
          {
            name: "shop-door",
            x: 64,
            y: 0,
            width: 32,
            height: 32,
            properties: [{ name: "display_name", value: "Shop" }],
          },
        ],
      },
      {
        name: "npc-spawns",
        objects: [{ name: "neighbor", x: 48, y: 48, point: true }],
      },
      {
        name: "player-spawns",
        objects: [
          {
            name: "world-entry",
            x: 80,
            y: 80,
            point: true,
            properties: [{ name: "direction", value: "up" }],
          },
        ],
      },
    ],
  };
}

describe("buildSettlementModel", () => {
  it("loads the minimal Tiled layers into collision and spawn data", () => {
    const model = buildSettlementModel(testMap(), "world-entry");
    expect(model.id).toBe("test-town");
    expect(model.background).toBe("/maps/test.png");
    expect(model.spawn).toEqual({ x: 2, y: 2, direction: "up" });
    expect(model.tileData[0][0]).toBe(1);
    expect(model.tileData[1][1]).toBe(1);
    expect(model.tileData[2][2]).toBe(0);
  });

  it("finds content-authored interactions in the facing direction", () => {
    const model = buildSettlementModel(testMap(), "world-entry");
    const interaction = interactionAt(model, 2, 1, "up");
    expect(interaction?.name).toBe("shop-door");
    expect(objectProperty(interaction, "display_name")).toBe("Shop");
  });

  it("makes the illustrated gate approach usable without exact exit-cell alignment", () => {
    const model = buildSettlementModel(cadott, "world-entry");
    for (const x of [11, 12, 13]) {
      expect(interactionAt(model, x, 15, "down")?.name).toBe("south-exit");
    }
    expect(interactionAt(model, 14, 14, "down")?.type).not.toBe("exit");
    expect(interactionAt(model, 18, 9, "up")?.name).toBe("general-store-door");
  });

  it("keeps the store roof solid and its illustrated steps reachable", () => {
    const model = buildSettlementModel(cadott, "general-store-return");
    for (const x of [18, 19]) {
      expect(model.tileData[8][x]).toBe(1);
      expect(model.tileData[9][x]).toBe(0);
      expect(model.tileData[10][x]).toBe(0);
      expect(interactionAt(model, x, 9, "up")?.name).toBe("general-store-door");
      expect(interactionAt(model, x, 7, "up")?.name).not.toBe(
        "general-store-door",
      );
    }
    expect(model.spawn).toEqual({ x: 19, y: 10, direction: "down" });
  });

  it("rejects a missing transition anchor", () => {
    expect(() => buildSettlementModel(testMap(), "missing")).toThrow(
      "Settlement spawn missing is missing",
    );
  });
});
