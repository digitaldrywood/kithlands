import { describe, expect, it } from "vitest";
import { restoreLivingPartyMembers } from "./party_rest.js";
import {
  extraNpcSpritesForTags,
  furnitureDensity,
  minimumNpcSpacing,
  npcSpriteForRole,
  roomDimensions,
  T_ALTAR,
  T_FLOOR,
  T_SHELF,
  T_WALL,
  tileTextureKey,
} from "./town_layout.js";

describe("roomDimensions", () => {
  it("gives inns noticeably larger interiors for multi-NPC layouts", () => {
    expect(roomDimensions("inn", 1, () => () => 0)).toEqual({ w: 18, h: 12 });
    expect(roomDimensions("inn", 1, () => () => 0.999)).toEqual({
      w: 20,
      h: 14,
    });
  });

  it("expands shops and temples to the FF-style interior footprint", () => {
    expect(roomDimensions("shop", 1, () => () => 0)).toEqual({ w: 14, h: 10 });
    expect(roomDimensions("shop", 1, () => () => 0.999)).toEqual({
      w: 18,
      h: 13,
    });
    expect(roomDimensions("temple", 1, () => () => 0)).toEqual({
      w: 18,
      h: 12,
    });
    expect(roomDimensions("temple", 1, () => () => 0.999)).toEqual({
      w: 20,
      h: 16,
    });
  });

  it("keeps houses at or above the minimum larger-room target", () => {
    const house = roomDimensions("house", 123, () => () => 0);
    const largeHouse = roomDimensions("house", 456, () => () => 0.999);

    expect(house).toEqual({ w: 16, h: 12 });
    expect(largeHouse).toEqual({ w: 20, h: 16 });
  });
});

describe("inn layout tuning", () => {
  it("keeps inn furniture density lower than generic houses", () => {
    expect(furnitureDensity("inn")).toBeLessThan(furnitureDensity("house"));
    expect(furnitureDensity("inn")).toBe(0.05);
  });

  it("requires extra personal space between inn occupants", () => {
    expect(minimumNpcSpacing("inn")).toBe(5);
    expect(minimumNpcSpacing("shop")).toBe(2);
  });
});

describe("extraNpcSpritesForTags", () => {
  it("keeps inn guests visually distinct from the innkeeper", () => {
    expect(extraNpcSpritesForTags(["rest"])).toEqual([
      "npc_flavor_amber",
      "npc_flavor_bram",
      "npc_gossip",
    ]);
  });
});

describe("tileTextureKey", () => {
  it("uses themed walls and floors per building type", () => {
    expect(tileTextureKey(T_WALL, "temple")).toBe("tile_temple_wall");
    expect(tileTextureKey(T_WALL, "shop")).toBe("tile_shop_wall");
    expect(tileTextureKey(T_FLOOR, "shop")).toBe("tile_shop_floor");
    expect(tileTextureKey(T_FLOOR, "inn")).toBe("tile_inn_floor");
  });

  it("maps furniture tiles to interior sprites instead of flat fills", () => {
    expect(tileTextureKey(T_SHELF, "shop")).toBe("tile_bookshelf");
    expect(tileTextureKey(T_ALTAR, "temple")).toBe("tile_altar");
  });

  it("rotates among authored surface variants for floors and walls", () => {
    const floorVariants = new Set([
      tileTextureKey(T_FLOOR, "inn", 1, 1, 77),
      tileTextureKey(T_FLOOR, "inn", 2, 1, 77),
      tileTextureKey(T_FLOOR, "inn", 3, 2, 77),
      tileTextureKey(T_FLOOR, "inn", 4, 3, 77),
    ]);
    const wallVariants = new Set([
      tileTextureKey(T_WALL, "house", 0, 0, 19),
      tileTextureKey(T_WALL, "house", 1, 0, 19),
      tileTextureKey(T_WALL, "house", 2, 0, 19),
    ]);

    expect(floorVariants.size).toBeGreaterThanOrEqual(3);
    expect(wallVariants.size).toBe(3);
  });
});

describe("npcSpriteForRole", () => {
  it("pins authored roles to distinct silhouettes", () => {
    expect(npcSpriteForRole("elder", "house", [], 7, 0)).toBe("npc_elder");
    expect(npcSpriteForRole("gossip", "house", [], 7, 0)).toBe("npc_gossip");
    expect(npcSpriteForRole("quest_giver", "house", [], 7, 0)).toBe(
      "npc_quest_giver",
    );
    expect(npcSpriteForRole("blacksmith", "house", [], 7, 0)).toBe(
      "npc_blacksmith",
    );
  });

  it("keeps flavor villagers within the non-proprietor pool", () => {
    const picks = new Set([
      npcSpriteForRole("flavor", "house", [], 12, 0),
      npcSpriteForRole("flavor", "house", [], 12, 1),
      npcSpriteForRole("flavor", "house", [], 12, 2),
    ]);

    expect([...picks]).toEqual(
      expect.arrayContaining(["npc_flavor_amber", "npc_flavor_bram"]),
    );
    expect(picks.has("npc_innkeeper")).toBe(false);
  });
});

describe("restoreLivingPartyMembers", () => {
  it("fully restores HP and MP for living party members", () => {
    const party = [
      { hp: 1, max_hp: 20, mp: 0, max_mp: 5 },
      { hp: 3, max_hp: 12, mp: 1, max_mp: 8 },
    ];

    restoreLivingPartyMembers(party);

    expect(party).toEqual([
      { hp: 20, max_hp: 20, mp: 5, max_mp: 5 },
      { hp: 12, max_hp: 12, mp: 8, max_mp: 8 },
    ]);
  });

  it("leaves dead party members unchanged", () => {
    const party = [
      { hp: 0, max_hp: 20, mp: 0, max_mp: 5, status: "dead" },
      { hp: -2, max_hp: 12, mp: 0, max_mp: 8, status: "dead" },
    ];

    restoreLivingPartyMembers(party);

    expect(party).toEqual([
      { hp: 0, max_hp: 20, mp: 0, max_mp: 5, status: "dead" },
      { hp: -2, max_hp: 12, mp: 0, max_mp: 8, status: "dead" },
    ]);
  });
});
