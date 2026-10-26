import { describe, expect, it } from "vitest";
import { pauseWorldFor } from "../systems/modalLock.js";
import {
  buildSpellLearnerChoices,
  groupShopItems,
  resolveShopCatalog,
  shouldHandleShopEscape,
  shopItemInformation,
} from "./world_shop.js";

describe("shop item explanations", () => {
  it("explains a consumable even when stock only supplies its ID and price", () => {
    const info = shopItemInformation({
      id: "hi_potion",
      type: "consumable",
      price: 100,
    });
    expect(info.description).toContain("120 HP");
    expect(info.description).toContain("cannot revive");
    expect(info.context).toBe("Use in battle or while exploring.");
    expect(
      shopItemInformation({ id: "tent", type: "consumable" }).context,
    ).toBe("Use while exploring; cannot be used in battle.");
  });
  it("preserves explicit and mysterious descriptions without inventing effects", () => {
    expect(
      shopItemInformation({
        id: "potion",
        type: "consumable",
        description: "An authored explanation.",
      }).description,
    ).toBe("An authored explanation.");
    const mystery = shopItemInformation({
      id: "strange_coin",
      type: "key_item",
    });
    expect(mystery.description).toContain("unknown origin");
    expect(mystery.context).toBe("");
    expect(shopItemInformation({ id: "unknown", type: "key_item" })).toEqual({
      description: "",
      context: "",
    });
  });
  it("explains purchased crafting supplies without treating them as consumables", () => {
    const info = shopItemInformation({ id: "charcoal", type: "material" });
    expect(info.description).toContain("smelting fuel");
    expect(info.context).toContain("Crafting in the party menu");
    expect(info.context).not.toContain("battle");
  });
});

describe("groupShopItems", () => {
  it("keeps spell rows separate from consumables", () => {
    const grouped = groupShopItems([
      { id: "potion", type: "consumable" },
      { id: "charcoal", type: "material" },
      { id: "airship_pass", type: "key_item" },
      { id: "heal", type: "spell" },
      { id: "short_bow", type: "weapon" },
      { id: "cloth_robe", type: "armor" },
    ]);

    expect(grouped.consumables.map((item) => item.id)).toEqual([
      "potion",
      "airship_pass",
    ]);
    expect(grouped.supplies.map((item) => item.id)).toEqual(["charcoal"]);
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

describe("resolveShopCatalog", () => {
  it("uses the server offers when refresh succeeds", () => {
    const offer = { stock_id: "offer_current", name: "Current Wraps" };

    expect(resolveShopCatalog({ shop_items: [offer] })).toEqual({
      items: [offer],
      error: "",
    });
  });

  it("clears stale offers and exposes the server error", () => {
    expect(resolveShopCatalog({ error: "temporary catalog outage" })).toEqual({
      items: [],
      error: "Stock unavailable: temporary catalog outage",
    });
  });
});
