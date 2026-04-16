import { describe, it, expect } from "vitest";
import {
  filterEquippableItems,
  computeEquipDelta,
  formatDeltaLabel,
} from "./equipPicker.js";

// These tests pin issue #96: after closing the equip picker (success or
// cancel) the party menu used to vanish, and the picker gave no feedback
// about how an item compared to what the hero already had. The helpers
// under test are the pure pieces that the scene reuses so the Phaser code
// stays thin.

describe("filterEquippableItems", () => {
  const items = [
    { id: "wpn_long_sword", name: "Long Sword", count: 1, power: 10 },
    { id: "wpn_dagger", name: "Dagger", count: 2, power: 5 },
    { id: "arm_chain", name: "Chain Mail", count: 1, absorb: 8 },
    { id: "potion", name: "Potion", count: 3 },
  ];

  it("returns only wpn_-prefixed items for type=weapon and strips the prefix", () => {
    const out = filterEquippableItems(items, "weapon");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "long_sword",
      name: "Long Sword",
      count: 1,
      power: 10,
    });
    expect(out[1]).toMatchObject({
      id: "dagger",
      name: "Dagger",
      count: 2,
      power: 5,
    });
  });

  it("returns only arm_-prefixed items for type=armor and strips the prefix", () => {
    const out = filterEquippableItems(items, "armor");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "chain",
      name: "Chain Mail",
      count: 1,
      absorb: 8,
    });
  });

  it("returns an empty array when items is missing or empty", () => {
    expect(filterEquippableItems(null, "weapon")).toEqual([]);
    expect(filterEquippableItems(undefined, "armor")).toEqual([]);
    expect(filterEquippableItems([], "weapon")).toEqual([]);
  });

  it("ignores items without a matching prefix", () => {
    expect(
      filterEquippableItems(
        [{ id: "elixir", name: "Elixir", count: 1 }],
        "weapon",
      ),
    ).toEqual([]);
  });
});

describe("computeEquipDelta", () => {
  it("returns item.power minus the equipped weapon_power for weapons", () => {
    const item = { power: 10 };
    const eq = { weapon_power: 4 };
    expect(computeEquipDelta(item, eq, "weapon")).toBe(6);
  });

  it("returns item.absorb minus the equipped armor_absorb for armor", () => {
    const item = { absorb: 8 };
    const eq = { armor_absorb: 2 };
    expect(computeEquipDelta(item, eq, "armor")).toBe(6);
  });

  it("can compare weapon secondary stats", () => {
    const item = { hit_pct: 5, crit_pct: 3 };
    const eq = { weapon_hit_pct: 1, weapon_crit_pct: 0 };
    expect(computeEquipDelta(item, eq, "weapon", "hit_pct")).toBe(4);
    expect(computeEquipDelta(item, eq, "weapon", "crit_pct")).toBe(3);
  });

  it("can compare armor secondary stats", () => {
    const item = { magic_defense: 7, evade_penalty: -3 };
    const eq = { armor_magic_defense: 2, armor_evade_penalty: 0 };
    expect(computeEquipDelta(item, eq, "armor", "magic_defense")).toBe(5);
    expect(computeEquipDelta(item, eq, "armor", "evade_penalty")).toBe(-3);
  });

  it("treats missing equipped stat as 0", () => {
    expect(computeEquipDelta({ power: 5 }, {}, "weapon")).toBe(5);
    expect(computeEquipDelta({ absorb: 3 }, {}, "armor")).toBe(3);
    expect(computeEquipDelta({ power: 5 }, null, "weapon")).toBe(5);
  });

  it("treats missing item stat as 0", () => {
    expect(computeEquipDelta({}, { weapon_power: 4 }, "weapon")).toBe(-4);
    expect(computeEquipDelta({}, { armor_absorb: 2 }, "armor")).toBe(-2);
  });

  it("can return a negative delta when the new item is worse", () => {
    expect(
      computeEquipDelta({ power: 2 }, { weapon_power: 10 }, "weapon"),
    ).toBe(-8);
  });
});

describe("formatDeltaLabel", () => {
  it("prefixes + and uses green for a positive weapon delta", () => {
    const out = formatDeltaLabel(3, "weapon");
    expect(out.text).toBe("Pow +3");
    expect(out.color).toBe("#44ff44");
  });

  it("prefixes - (no double sign) and uses red for a negative armor delta", () => {
    const out = formatDeltaLabel(-2, "armor");
    expect(out.text).toBe("Abs -2");
    expect(out.color).toBe("#ff6666");
  });

  it("uses zero with grey for a wash", () => {
    const out = formatDeltaLabel(0, "weapon");
    expect(out.text).toBe("Pow 0");
    expect(out.color).toBe("#888888");
  });

  it("uses Abs for armor and Pow for weapon", () => {
    expect(formatDeltaLabel(1, "weapon").text.startsWith("Pow")).toBe(true);
    expect(formatDeltaLabel(1, "armor").text.startsWith("Abs")).toBe(true);
  });

  it("uses stat-specific labels for secondary compare lines", () => {
    expect(formatDeltaLabel(5, "weapon", "hit_pct").text).toBe("Hit% +5");
    expect(formatDeltaLabel(-2, "armor", "magic_defense").text).toBe("MDef -2");
    expect(formatDeltaLabel(0, "armor", "evade_penalty").text).toBe("Eva 0");
  });
});
