import { describe, expect, it } from "vitest";
import { restoreLivingPartyMembers } from "./party_rest.js";

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
