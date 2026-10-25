import { describe, expect, it } from "vitest";

import { partyStatusRowLayout } from "./battle_party_status.js";
import { battleHudLayout } from "../scenes/battle_hud_layout.js";

describe("partyStatusRowLayout", () => {
  it("gives each desktop member a dedicated full-width row", () => {
    const rows = partyStatusRowLayout(
      { x: 504, y: 440, width: 288, height: 152 },
      4,
      false,
    );
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.x))).toHaveLength(1);
    expect(rows[1].y).toBeGreaterThan(rows[0].y + rows[0].height);
  });

  it("uses two readable columns in the portrait mobile layout", () => {
    const rows = partyStatusRowLayout(
      battleHudLayout({ viewportWidth: 390, viewportHeight: 844 }).party,
      4,
      true,
    );
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.height >= 140)).toBe(true);
    expect(rows[1].x).toBeGreaterThan(rows[0].x + rows[0].width);
    expect(rows[2].y).toBeGreaterThan(rows[0].y + rows[0].height);
  });
});
