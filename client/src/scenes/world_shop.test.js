import { describe, expect, it } from "vitest";
import { pauseWorldFor } from "../systems/modalLock.js";
import {
  buildSpellLearnerChoices,
  groupShopItems,
  shouldHandleShopEscape,
} from "./world_shop.js";

describe("groupShopItems", () => {
  it("keeps spell rows separate from consumables", () => {
    const grouped = groupShopItems([
      { id: "potion", type: "consumable" },
      { id: "heal", type: "spell" },
      { id: "short_bow", type: "weapon" },
      { id: "cloth_robe", type: "armor" },
    ]);

    expect(grouped.consumables.map((item) => item.id)).toEqual(["potion"]);
    expect(grouped.spells.map((item) => item.id)).toEqual(["heal"]);
  });
});

describe("buildSpellLearnerChoices", () => {
  it("maps server learner metadata onto the party in order", () => {
    const party = [
      { name: "Bruno", level: 7, class_name: "Warrior" },
      { name: "Nia", level: 1, class_name: "Mender" },
      { name: "Mira", level: 4, class_name: "Mender" },
      { name: "Tess", level: 4, class_name: "Mender" },
    ];
    const item = {
      id: "heal",
      type: "spell",
      learners: [
        { name: "Bruno", can_learn: false, reason: "wrong class" },
        { name: "Nia", can_learn: false, reason: "level too low" },
        { name: "Mira", can_learn: false, reason: "already known" },
        { name: "Tess", can_learn: true },
      ],
    };

    expect(buildSpellLearnerChoices(item, party)).toEqual([
      {
        slot: 0,
        name: "Bruno",
        className: "Warrior",
        level: 7,
        canLearn: false,
        reason: "wrong class",
        label: "Bruno · Lv.7 Warrior",
      },
      {
        slot: 1,
        name: "Nia",
        className: "Mender",
        level: 1,
        canLearn: false,
        reason: "level too low",
        label: "Nia · Lv.1 Mender",
      },
      {
        slot: 2,
        name: "Mira",
        className: "Mender",
        level: 4,
        canLearn: false,
        reason: "already known",
        label: "Mira · Lv.4 Mender",
      },
      {
        slot: 3,
        name: "Tess",
        className: "Mender",
        level: 4,
        canLearn: true,
        reason: "",
        label: "Tess · Lv.4 Mender",
      },
    ]);
  });
});

describe("shouldHandleShopEscape", () => {
  it("only lets the shop close itself when it is the top modal", () => {
    const scene = {};

    pauseWorldFor(scene, "shop");
    expect(shouldHandleShopEscape(scene)).toBe(true);

    pauseWorldFor(scene, "party_menu");
    expect(shouldHandleShopEscape(scene)).toBe(false);
  });
});
