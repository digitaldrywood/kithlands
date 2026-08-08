import { describe, expect, it } from "vitest";

import {
  buildEnemyBattleLayout,
  buildPartyBattleLayout,
  floatingTextAnchorForEntry,
  inferPartyRow,
} from "./battle_layout.js";

describe("inferPartyRow", () => {
  it("prefers an explicit saved row when present", () => {
    expect(inferPartyRow({ row: "back", class_id: "warrior" })).toBe("back");
    expect(inferPartyRow({ battle_row: "front", class_id: "cinder" })).toBe(
      "front",
    );
  });

  it("falls back to MP-vs-HP ratio so casters land in the back row", () => {
    expect(
      inferPartyRow({
        class_id: "warrior",
        max_hp: 90,
        max_mp: 0,
      }),
    ).toBe("front");
    expect(
      inferPartyRow({
        class_id: "mender",
        max_hp: 28,
        max_mp: 10,
      }),
    ).toBe("back");
    expect(
      inferPartyRow({
        class_id: "wayfarer",
        max_hp: 30,
        max_mp: 5,
      }),
    ).toBe("front");
  });
});

describe("buildPartyBattleLayout", () => {
  it("creates staggered front/back columns for a four-member party", () => {
    const layout = buildPartyBattleLayout([
      { name: "Ayla", class_id: "warrior", max_hp: 100, max_mp: 0 },
      { name: "Mira", class_id: "mender", max_hp: 28, max_mp: 10 },
      { name: "Cato", class_id: "cinder", max_hp: 25, max_mp: 10 },
      { name: "Nia", class_id: "rogue", max_hp: 30, max_mp: 0 },
    ]);

    expect(layout).toHaveLength(4);
    expect(layout[0].row).toBe("front");
    expect(layout[1].row).toBe("back");
    expect(layout[2].row).toBe("back");
    expect(layout[3].row).toBe("front");

    expect(layout[0].x).toBeLessThan(layout[1].x);
    expect(layout[3].x).toBeLessThan(layout[2].x);
    expect(Math.abs(layout[0].y - layout[1].y)).toBe(88);
    expect(Math.abs(layout[2].y - layout[3].y)).toBe(88);
    expect(layout[2].y).toBeGreaterThan(layout[1].y);
    expect(layout[3].y).toBeGreaterThan(layout[0].y);
  });

  it("reserves a non-overlapping lane for every party member", () => {
    const layout = buildPartyBattleLayout([{}, {}, {}, {}]);
    for (let i = 1; i < layout.length; i++) {
      expect(layout[i].lane.y).toBeGreaterThanOrEqual(
        layout[i - 1].lane.y + layout[i - 1].lane.height,
      );
    }
  });
});

describe("buildEnemyBattleLayout", () => {
  it("allocates a bounded 3x3 grid for the maximum encounter", () => {
    const layout = buildEnemyBattleLayout(
      Array.from({ length: 9 }, () => ({})),
    );
    expect(layout).toHaveLength(9);
    expect(new Set(layout.map((entry) => entry.x))).toHaveLength(3);
    expect(new Set(layout.map((entry) => entry.y))).toHaveLength(3);
    for (const entry of layout) {
      expect(entry.lane.x + entry.lane.width).toBeLessThanOrEqual(454);
      expect(entry.lane.y + entry.lane.height).toBeLessThanOrEqual(405);
    }
  });
});

describe("floatingTextAnchorForEntry", () => {
  it("lifts the anchor above the sprite top edge", () => {
    const anchor = floatingTextAnchorForEntry({
      x: 540,
      y: 220,
      sprite: { x: 540, y: 220, displayHeight: 100 },
    });

    expect(anchor).toEqual({ x: 540, y: 158 });
  });
});
