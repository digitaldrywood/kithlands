import { describe, expect, it } from "vitest";
import {
  allRecipes,
  craftableRecipeCount,
  firstOpenSocket,
  gemChangePreview,
  gemEffectForItem,
  gemRecoveryPreview,
  gemWorkshopEnabled,
  knownRecipes,
  ownedGems,
  recipeReadiness,
  recipeCostLabel,
  recipeUpgradePreview,
  recommendedGems,
  recommendedRecipes,
  socketableGear,
  socketPreview,
  statDeltaSummary,
  workshopGear,
} from "./gem_workshop.js";

const state = {
  items: [
    {
      instance_id: "gear_1",
      kind: "weapon",
      name: "Keen Sword",
      power: 5,
      socket_previews: [
        {
          gem_id: "ruby",
          allowed: true,
          before: { power: 5 },
          after: { power: 7 },
        },
        {
          gem_id: "sapphire",
          allowed: true,
          before: { power: 5 },
          after: { power: 6 },
        },
      ],
      sockets: [{ index: 0 }, { index: 1, gem_id: "ruby" }],
    },
    { instance_id: "gear_2", sockets: [{ index: 0, gem_id: "ruby" }] },
    { id: "potion", count: 3 },
  ],
  party: [{ name: "Ayla", level: 5, str: 10 }],
  equipment: [
    {
      weapon_item: {
        id: "wpn_gear_equipped",
        instance_id: "gear_equipped",
        kind: "weapon",
        name: "Equipped Sword",
        power: 999, // The client must use the authoritative preview.
        socket_previews: [
          {
            gem_id: "ruby",
            allowed: true,
            before: { power: 6 },
            after: { power: 8 },
            character_before: { attack: 16 },
            character_after: { attack: 18 },
          },
        ],
        sockets: [{ index: 0 }],
      },
    },
  ],
  gems: [
    {
      id: "ruby",
      name: "Ruby",
      count: 2,
      tier: 1,
      required_level: 1,
      effects: [
        { kind: "weapon", stat: "power", value: 2 },
        { kind: "armor", stat: "absorb", value: 1 },
      ],
    },
    {
      id: "sapphire",
      name: "Sapphire",
      count: 1,
      tier: 1,
      required_level: 1,
      effects: [
        { kind: "weapon", stat: "power", value: 1 },
        { kind: "armor", stat: "absorb", value: 3 },
      ],
    },
  ],
  gem_recipes: [
    {
      id: "cut_ruby",
      name: "Cut Ruby",
      inputs: [
        {
          gem_id: "ruby",
          gem_name: "Ruby",
          count: 2,
          owned: 2,
          effects: [
            { kind: "weapon", stat: "power", value: 2 },
            { kind: "armor", stat: "absorb", value: 1 },
          ],
        },
      ],
      output: {
        gem_id: "flawless_ruby",
        gem_name: "Flawless Ruby",
        count: 1,
        effects: [
          { kind: "weapon", stat: "power", value: 4 },
          { kind: "armor", stat: "absorb", value: 2 },
        ],
      },
      craftable: true,
    },
  ],
};

describe("Gem Workshop selectors", () => {
  it("finds owned gems and gear with open sockets", () => {
    expect(ownedGems(state)).toHaveLength(2);
    expect(workshopGear(state).map((item) => item.instance_id)).toEqual([
      "gear_1",
      "gear_2",
      "gear_equipped",
    ]);
    expect(socketableGear(state).map((item) => item.instance_id)).toEqual([
      "gear_1",
      "gear_equipped",
    ]);
    expect(socketableGear(state)[1]).toMatchObject({
      equipped_by: "Ayla",
      equipped_kind: "Weapon",
    });
    expect(firstOpenSocket(state.items[0])).toBe(0);
  });

  it("ignores legacy equipped records that do not expose socket arrays", () => {
    expect(
      workshopGear({
        party: [{ name: "Ayla" }],
        equipment: [
          {
            weapon_item: {
              instance_id: "legacy_weapon",
              name: "Legacy Sword",
            },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("exposes known recipes and readable costs", () => {
    expect(knownRecipes(state)).toHaveLength(1);
    expect(recipeCostLabel(state.gem_recipes[0], state.gems)).toBe("2x Ruby");
    expect(
      recipeCostLabel(
        {
          inputs: [
            { gem_id: "flawless_ruby", gem_name: "Flawless Ruby", count: 3 },
          ],
        },
        [],
      ),
    ).toBe("3x Flawless Ruby");
  });

  it("previews an equipped character's exact before and after stats", () => {
    const item = socketableGear(state).find(
      (candidate) => candidate.instance_id === "gear_equipped",
    );
    const ruby = state.gems[0];

    expect(gemEffectForItem(ruby, item)).toEqual({
      kind: "weapon",
      stat: "power",
      value: 2,
    });
    expect(socketPreview(item, ruby, state)).toMatchObject({
      stat: "Power",
      current: 6,
      after: 8,
      delta: 2,
      character_before: { attack: 16 },
      character_after: { attack: 18 },
    });
  });

  it("recommends the strongest compatible owned gem for the selected gear", () => {
    const weapon = socketableGear(state)[0];
    expect(recommendedGems(state, weapon).map(({ gem }) => gem.id)).toEqual([
      "ruby",
      "sapphire",
    ]);

    const armor = {
      kind: "armor",
      absorb: 3,
      sockets: [{ index: 0 }],
      socket_previews: [
        {
          gem_id: "ruby",
          allowed: true,
          before: { absorb: 3 },
          after: { absorb: 4 },
        },
        {
          gem_id: "sapphire",
          allowed: true,
          before: { absorb: 3 },
          after: { absorb: 6 },
        },
      ],
    };
    expect(recommendedGems(state, armor)[0].gem.id).toBe("sapphire");
  });

  it("uses authoritative replacement and recovery previews for a filled socket", () => {
    const item = {
      instance_id: "gear_filled",
      kind: "weapon",
      sockets: [{ index: 0, gem_id: "ruby", gem_name: "Ruby" }],
      gem_changes: [
        {
          action: "replace",
          socket: 0,
          gem_id: "sapphire",
          installed_gem_id: "ruby",
          installed_gem_name: "Ruby",
          gold_cost: 10,
          gold_before: 100,
          gold_after: 90,
          allowed: true,
          token: "replace-token",
          before: { power: 7 },
          after: { power: 6 },
        },
        {
          action: "recover",
          socket: 0,
          installed_gem_id: "ruby",
          installed_gem_name: "Ruby",
          gold_cost: 25,
          gold_before: 100,
          gold_after: 75,
          allowed: true,
          token: "recover-token",
          before: { power: 7 },
          after: { power: 5 },
        },
      ],
    };
    expect(gemChangePreview(item, 0, state.gems[1])).toMatchObject({
      action: "replace",
      gold_cost: 10,
      current_value: 7,
      proposed_value: 6,
      after: { power: 6 },
      token: "replace-token",
    });
    expect(gemRecoveryPreview(item, 0)).toMatchObject({
      action: "recover",
      gold_cost: 25,
      gold_after: 75,
      token: "recover-token",
    });
    expect(recommendedGems(state, item, 0).map(({ gem }) => gem.id)).toEqual([
      "sapphire",
    ]);
  });

  it("summarizes authoritative same-stat replacement upgrades and downgrades", () => {
    expect(statDeltaSummary({ power: 7 }, { power: 9 })).toBe("+2 Power");
    expect(statDeltaSummary({ power: 9 }, { power: 7 })).toBe("-2 Power");
    expect(
      statDeltaSummary({ power: 7, hit_pct: 1 }, { power: 6, hit_pct: 3 }),
    ).toBe("+2 Hit chance, -1 Power");
  });

  it("shows recipe readiness and the output improvement before crafting", () => {
    const [recipe] = knownRecipes(state);
    expect(craftableRecipeCount(state)).toBe(1);
    expect(recipeReadiness(recipe, state)).toBe("Ready to transmute");
    expect(recipeUpgradePreview(recipe)).toEqual([
      {
        kind: "weapon",
        stat: "Weapon Power",
        before: 2,
        after: 4,
        delta: 2,
      },
      {
        kind: "armor",
        stat: "Armor Absorb",
        before: 1,
        after: 2,
        delta: 1,
      },
    ]);
    expect(recommendedRecipes(state)[0].recipe.id).toBe("cut_ruby");
  });

  it("enables the workshop for either gems or recipes", () => {
    expect(gemWorkshopEnabled(state)).toBe(true);
    expect(gemWorkshopEnabled({ gems: [], gem_recipes: [] })).toBe(false);
  });
});

describe("Workshop complete catalogs and authoritative restrictions", () => {
  it("includes equipped rings, gloves and every canonical slot", () => {
    const loadout = Array.from({ length: 12 }, (_, index) => ({
      id: `slot_${index}`,
      name: `Slot ${index}`,
      item: { instance_id: `gear_${index}`, kind: "accessory", sockets: [{}] },
    }));
    const gear = workshopGear({
      party: [{ name: "Ayla" }],
      equipment: [{ loadout }],
    });
    expect(gear).toHaveLength(12);
    expect(gear[11]).toMatchObject({
      instance_id: "gear_11",
      equipped_by: "Ayla",
      equipped_kind: "Slot 11",
    });
  });
  it("keeps all recipes inspectable and distinguishes undiscovered from insufficient", () => {
    const recipes = Array.from({ length: 10 }, (_, i) => ({
      id: `recipe_${i}`,
      name: `Recipe ${i}`,
      known: i < 4,
      craftable: i === 0,
      discovery_hint: "Find a Ward gem",
      inputs: [],
    }));
    expect(allRecipes({ gem_recipes: recipes })).toHaveLength(10);
    expect(knownRecipes({ gem_recipes: recipes })).toHaveLength(4);
    expect(recommendedRecipes({ gem_recipes: recipes })).toHaveLength(10);
    expect(recipeReadiness(recipes[9])).toBe("Find a Ward gem");
    expect(
      recipeReadiness({ ...recipes[0], block_reason: "Need 2 Ember Shards" }),
    ).toBe("Need 2 Ember Shards");
  });
  it("uses accessory stat names and never fabricates a blocked preview", () => {
    const gem = {
      id: "ember",
      effects: [{ kind: "accessory", stat: "str", value: 2 }],
    };
    const item = {
      kind: "accessory",
      socket_previews: [
        {
          gem_id: "ember",
          allowed: true,
          before: { str: 4 },
          after: { str: 6 },
        },
      ],
    };
    expect(socketPreview(item, gem)).toMatchObject({
      stat: "Strength",
      current: 4,
      after: 6,
    });
    expect(
      socketPreview(
        { ...item, socket_previews: [{ gem_id: "ember", allowed: false }] },
        gem,
      ),
    ).toBeNull();
    expect(
      socketPreview({ kind: "accessory", stats: { str: 4 } }, gem),
    ).toBeNull();
  });
});
