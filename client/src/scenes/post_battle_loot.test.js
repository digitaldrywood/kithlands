import { describe, expect, it } from "vitest";
import {
  comparisonRows,
  equipmentDropDetails,
  itemStatRows,
  pendingEquipmentDrops,
} from "./post_battle_loot.js";

describe("post-battle loot model", () => {
  it("returns only unresolved exact equipment instances", () => {
    expect(
      pendingEquipmentDrops({
        battle_rewards: {
          drops: [
            { kind: "consumable", item_id: "potion", quantity: 2 },
            { kind: "equipment", instance_id: "eq_1", decision: "pending" },
            { kind: "equipment", instance_id: "eq_2", decision: "kept" },
            { kind: "equipment", decision: "pending" },
          ],
        },
      }).map((drop) => drop.instance_id),
    ).toEqual(["eq_1"]);
  });

  it("renders only honest changed stats in stable order", () => {
    expect(
      comparisonRows({
        before: { attack: 12, evade: 7, lck: 4 },
        after: { attack: 18, evade: 7, lck: 3, crit_pct: 2 },
        deltas: { attack: 6, evade: 0, lck: -1, crit_pct: 2 },
      }),
    ).toEqual([
      { key: "attack", label: "Attack", before: 12, after: 18, delta: 6 },
      { key: "lck", label: "Luck", before: 4, after: 3, delta: -1 },
      { key: "crit_pct", label: "Crit", before: 0, after: 2, delta: 2 },
    ]);
  });

  it("describes the resolved roll without inventing metadata", () => {
    expect(
      equipmentDropDetails({
        item: { rarity: "Rare", item_level: 3, category: "main_hand" },
      }),
    ).toEqual(["Rare", "Item level 3", "main hand"]);
    expect(equipmentDropDetails({ item: {} })).toEqual([]);
  });

  it("omits absent and zero item stats", () => {
    expect(
      itemStatRows({ stats: { power: 22, hit_pct: 10, absorb: 0 } }),
    ).toEqual([
      { key: "power", label: "Power", value: 22 },
      { key: "hit_pct", label: "Hit", value: 10 },
    ]);
  });
});
