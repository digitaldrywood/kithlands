import { describe, expect, it } from "vitest";
import { buildPartyMemberScanContext } from "./world_menu.js";

describe("party menu scan context", () => {
  it("reports remaining experience and suppresses normal status", () => {
    expect(
      buildPartyMemberScanContext({ xp: 26, xp_next: 70, status: "normal" }),
    ).toEqual({ xpRemaining: 44, status: "" });
  });

  it("normalizes abnormal status for compact display", () => {
    expect(
      buildPartyMemberScanContext({
        xp: 70,
        xp_next: 70,
        status: "turned_to_stone",
      }),
    ).toEqual({ xpRemaining: 0, status: "TURNED TO STONE" });
  });
});
