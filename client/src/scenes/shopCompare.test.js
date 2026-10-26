import { describe, expect, it } from "vitest";
import {
  allowedClassIds,
  buildFocusedMemberCompare,
  buildItemStatBlock,
  buildMemberIndicators,
  buyForMemberLabel,
  canPartyMemberEquip,
  cycleMemberIndex,
  indicatorForMember,
  isEquipmentShopItem,
  memberEquipmentStatus,
} from "./shopCompare.js";

describe("shopCompare helpers", () => {
  const weapon = {
    id: "hand_axe",
    type: "weapon",
    name: "Hand Axe",
    power: 8,
    hit_pct: -5,
    crit_pct: 0,
    element: "none",
    class_ids: ["warrior", "wayfarer"],
  };
  const armor = {
    id: "silk_robe",
    type: "armor",
    name: "Silk Robe",
    absorb: 4,
    magic_defense: 5,
    evade_penalty: 0,
    element: "",
    class_ids: ["mender", "cinder", "rogue", "wayfarer"],
  };
  const gloves = {
    id: "training_wraps",
    type: "equipment",
    category: "gloves",
    name: "Hearthbound Wraps",
    stats: { power: 2, hit_pct: 2 },
    class_ids: ["brawler"],
  };

  it("distinguishes class restrictions from an unmet equipment level", () => {
    const advanced = { ...weapon, required_level: 8 };
    const member = { name: "Hero", class_id: "warrior", level: 7 };
    expect(memberEquipmentStatus(advanced, member)).toEqual({
      canEquip: false,
      label: "Requires Lv.8",
      reason: "Requires level 8; Hero is level 7.",
    });
    expect(indicatorForMember(advanced, member).state).toBe("locked");
    expect(canPartyMemberEquip(advanced, { ...member, level: 8 })).toBe(true);
    expect(
      memberEquipmentStatus(advanced, { class_id: "mender", level: 8 }).label,
    ).toBe("Class restricted");
  });

  it("detects equipment rows and parses allowed classes", () => {
    expect(isEquipmentShopItem(weapon)).toBe(true);
    expect(isEquipmentShopItem(gloves)).toBe(true);
    expect(isEquipmentShopItem({ type: "consumable" })).toBe(false);
    expect(allowedClassIds({ classes: "warrior, rogue" })).toEqual([
      "warrior",
      "rogue",
    ]);
  });

  it("compares expanded gear against its matching paper-doll category", () => {
    const compare = buildFocusedMemberCompare(
      gloves,
      { class_id: "brawler" },
      {
        loadout: [
          {
            id: "hands",
            item: {
              name: "Old Wraps",
              category: "gloves",
              stats: { power: 1, hit_pct: 1 },
            },
          },
        ],
      },
    );

    expect(compare.currentName).toBe("Old Wraps");
    expect(compare.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Power",
          currentValue: 1,
          nextValue: 2,
        }),
        expect.objectContaining({
          label: "Hit%",
          currentValue: 1,
          nextValue: 2,
        }),
      ]),
    );
  });

  it("checks class-lock eligibility against class_ids", () => {
    expect(canPartyMemberEquip(weapon, { class_id: "warrior" })).toBe(true);
    expect(canPartyMemberEquip(weapon, { class_id: "mender" })).toBe(false);
  });

  it("builds upgrade / equal / downgrade / locked indicators", () => {
    expect(
      indicatorForMember(weapon, { class_id: "warrior" }, { weapon_power: 6 }),
    ).toMatchObject({ state: "upgrade", symbol: "▲", delta: 2 });
    expect(
      indicatorForMember(weapon, { class_id: "warrior" }, { weapon_power: 8 }),
    ).toMatchObject({ state: "equal", symbol: "=" });
    expect(
      indicatorForMember(weapon, { class_id: "warrior" }, { weapon_power: 10 }),
    ).toMatchObject({ state: "downgrade", symbol: "▼", delta: -2 });
    expect(
      indicatorForMember(weapon, { class_id: "mender" }, { weapon_power: 4 }),
    ).toMatchObject({ state: "locked", symbol: "-", delta: null });
  });

  it("builds one indicator per visible party member", () => {
    const out = buildMemberIndicators(
      armor,
      [
        { name: "Ayla", class_id: "warrior" },
        { name: "Mira", class_id: "mender" },
        { name: "Cato", class_id: "cinder" },
        { name: "Nia", class_id: "rogue" },
      ],
      [
        { armor_absorb: 5 },
        { armor_absorb: 2 },
        { armor_absorb: 2 },
        { armor_absorb: 2 },
      ],
    );

    expect(out.map((entry) => entry.symbol)).toEqual(["-", "▲", "▲", "▲"]);
  });

  it("wraps member cycling in both directions", () => {
    expect(cycleMemberIndex(0, 4, -1)).toBe(3);
    expect(cycleMemberIndex(3, 4, 1)).toBe(0);
  });

  it("builds a stat block plus focused compare lines", () => {
    expect(buildItemStatBlock(weapon)).toEqual(
      expect.arrayContaining([
        { label: "Power", value: "8" },
        { label: "Hit%", value: "-5" },
        { label: "Classes", value: "warrior, wayfarer" },
      ]),
    );

    const compare = buildFocusedMemberCompare(
      armor,
      { class_id: "mender" },
      {
        armor_name: "Cloth Robe",
        armor_absorb: 2,
        armor_magic_defense: 2,
        armor_evade_penalty: 0,
        armor_element: "none",
      },
    );

    expect(compare.canEquip).toBe(true);
    expect(compare.currentName).toBe("Cloth Robe");
    expect(compare.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Absorb",
          currentValue: 2,
          nextValue: 4,
          deltaText: "Abs +2",
        }),
        expect.objectContaining({
          label: "MagicDef",
          currentValue: 2,
          nextValue: 5,
          deltaText: "MDef +3",
        }),
      ]),
    );
  });

  it("formats the buy-for button label from the focused member", () => {
    expect(buyForMemberLabel({ name: "Mira" })).toBe("Buy for Mira");
  });
});
