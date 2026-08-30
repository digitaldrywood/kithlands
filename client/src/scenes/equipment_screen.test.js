import { describe, expect, it } from "vitest";
import {
  buildCharacterSummaryResources,
  buildEquipmentCandidates,
  buildEquipmentComparison,
  buildEquipmentComparisonRows,
  buildEquipmentScreenModel,
  itemStats,
} from "./equipment_screen.js";

function slot(id, name, accepts, item = null) {
  return { id, name, accepts, item };
}

function gameState() {
  const weapon = {
    id: "wpn_short_sword",
    instance_id: "gear_weapon",
    kind: "weapon",
    category: "weapon",
    name: "Short Sword",
    rarity: "Common",
    item_level: 1,
    required_level: 1,
    allowed_classes: ["warrior", "wayfarer"],
    stats: { power: 6 },
    power: 6,
    sockets: [{ index: 0 }],
  };
  const armor = {
    id: "arm_leather_armor",
    kind: "armor",
    category: "armor",
    name: "Leather Armor",
    allowed_classes: ["warrior"],
    stats: { absorb: 5 },
    absorb: 5,
  };
  const ring = {
    id: "eqp_copper_ring",
    instance_id: "gear_ring",
    kind: "accessory",
    category: "ring",
    name: "Copper Ring",
    allowed_classes: ["warrior"],
    required_level: 1,
    stats: { lck: 1 },
  };
  const loadout = [
    slot("main_hand", "Weapon", ["weapon"], weapon),
    slot("off_hand", "Off Hand", ["shield", "weapon", "focus"]),
    slot("head", "Head", ["helmet"]),
    slot("shoulders", "Shoulders", ["shoulders"]),
    slot("body", "Body", ["armor"], armor),
    slot("hands", "Hands", ["gloves"]),
    slot("waist", "Waist", ["belt"]),
    slot("legs", "Legs", ["pants"]),
    slot("feet", "Feet", ["boots"]),
    slot("amulet", "Amulet", ["amulet"]),
    slot("ring_1", "Ring I", ["ring"], ring),
    slot("ring_2", "Ring II", ["ring"]),
  ];
  return {
    id: "game_1",
    party: [
      {
        name: "Hero",
        class_id: "warrior",
        class_name: "Warrior",
        level: 1,
        str: 20,
        agi: 5,
        int_stat: 1,
        vit: 10,
        lck: 5,
      },
      { name: "Mage", class_id: "cinder", class_name: "Cinder", level: 1 },
    ],
    equipment: [
      { loadout, bonuses: { power: 6, absorb: 5, lck: 1 } },
      {
        loadout: [
          slot("ring_1", "Ring I", ["ring"], {
            ...ring,
            instance_id: "gear_other_ring",
            name: "Bright Ring",
          }),
        ],
        bonuses: { lck: 1 },
      },
    ],
    items: [
      {
        id: "wpn_iron_sword",
        instance_id: "gear_iron",
        kind: "weapon",
        category: "weapon",
        name: "Keen Iron Sword",
        rarity: "Magic",
        item_level: 2,
        required_level: 1,
        allowed_classes: ["warrior"],
        stats: { power: 9, hit_pct: 2 },
        power: 9,
        affixes: [{ name: "Keen", stat: "power", value: 2 }],
      },
      {
        id: "eqp_warrior_signet",
        instance_id: "gear_signet",
        kind: "accessory",
        category: "ring",
        name: "Warrior's Signet",
        required_level: 3,
        allowed_classes: ["warrior"],
        stats: { str: 2, vit: 1 },
      },
    ],
  };
}

describe("equipment screen model", () => {
  it("makes remaining experience explicit in the character summary", () => {
    expect(
      buildCharacterSummaryResources({
        hp: 18,
        max_hp: 24,
        mp: 4,
        max_mp: 7,
        xp: 26,
        xp_next: 70,
      }),
    ).toEqual([
      {
        label: "HP",
        current: 18,
        maximum: 24,
        tone: "hp",
        note: "",
      },
      {
        label: "MP",
        current: 4,
        maximum: 7,
        tone: "mp",
        note: "",
      },
      {
        label: "XP",
        current: 26,
        maximum: 70,
        tone: "xp",
        note: "Next level in 44",
      },
    ]);
  });

  it("keeps the complete server-authored loadout including repeated rings", () => {
    const model = buildEquipmentScreenModel(gameState(), 0);

    expect(model.slots).toHaveLength(12);
    expect(
      model.slots.filter((entry) => entry.accepts.includes("ring")),
    ).toHaveLength(2);
    expect(model.gearTotals).toEqual({ power: 6, absorb: 5, lck: 1 });
  });

  it("filters candidates by slot while keeping server eligibility reasons", () => {
    const state = gameState();
    const weapons = buildEquipmentCandidates(state, 0, "main_hand");
    const rings = buildEquipmentCandidates(state, 0, "ring_2");

    expect(weapons.map((entry) => entry.item.name)).toEqual([
      "Keen Iron Sword",
    ]);
    expect(rings.map((entry) => entry.item.name)).toEqual([
      "Bright Ring",
      "Copper Ring",
      "Warrior's Signet",
    ]);
    expect(
      rings.find((entry) => entry.item.name === "Warrior's Signet"),
    ).toMatchObject({
      compatible: false,
      disabledReason: "Requires level 3",
    });
  });

  it("shows exact loadout and character impact for a candidate", () => {
    const state = gameState();
    const candidate = state.items[0];
    const comparison = buildEquipmentComparison(
      state,
      0,
      "main_hand",
      candidate,
    );

    expect(comparison.before).toEqual({ power: 6, absorb: 5, lck: 1 });
    expect(comparison.after).toEqual({
      power: 9,
      hit_pct: 2,
      absorb: 5,
      lck: 1,
    });
    expect(comparison.deltas).toMatchObject({
      power: 3,
      hit_pct: 2,
      absorb: 0,
    });
    expect(comparison.character).toContain("Attack 26 → 29");
    expect(buildEquipmentComparisonRows(comparison)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stat: "power",
          current: 6,
          preview: 9,
          delta: 3,
          tone: "positive",
        }),
        expect.objectContaining({
          stat: "absorb",
          current: 5,
          preview: 5,
          delta: 0,
          tone: "neutral",
        }),
      ]),
    );
  });

  it("treats moving one instance between repeated slots as a move, not a duplicate", () => {
    const state = gameState();
    const ring = state.equipment[0].loadout.find(
      (entry) => entry.id === "ring_1",
    ).item;
    const comparison = buildEquipmentComparison(state, 0, "ring_2", ring);

    expect(comparison.after.lck).toBe(1);
    expect(comparison.deltas.lck).toBe(0);
  });

  it("uses resolved stat maps as the comparison source", () => {
    expect(itemStats({ stats: { power: 11, str: 2 }, power: 7 })).toEqual({
      power: 11,
      str: 2,
    });
  });
});
