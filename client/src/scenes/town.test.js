import { describe, expect, it } from "vitest";
import { restoreLivingPartyMembers } from "./party_rest.js";
import {
  extraNpcSpritesForTags,
  furnitureDensity,
  minimumNpcSpacing,
  roomDimensions,
} from "./town_layout.js";

describe("roomDimensions", () => {
  it("gives inns noticeably larger interiors for multi-NPC layouts", () => {
    expect(roomDimensions("inn", 1)).toEqual({ w: 20, h: 14 });
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
      "npc_guard",
      "npc_blacksmith",
      "npc_elder",
    ]);
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
