import { describe, expect, it } from "vitest";
import {
  craftableRecipeCount,
  firstOpenSocket,
  gemEffectForItem,
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
  workshopGear,
} from "./gem_workshop.js";

const state = {
  items: [
    {
      instance_id: "gear_1",
      kind: "weapon",
      name: "Keen Sword",
      power: 5,
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
        power: 6,
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
      characterLabel: "Ayla ATK",
      characterCurrent: 16,
      characterAfter: 18,
    });
  });

  it("recommends the strongest compatible owned gem for the selected gear", () => {
    const weapon = socketableGear(state)[0];
    expect(recommendedGems(state, weapon).map(({ gem }) => gem.id)).toEqual([
      "ruby",
      "sapphire",
    ]);

    const armor = { kind: "armor", absorb: 3, sockets: [{ index: 0 }] };
    expect(recommendedGems(state, armor)[0].gem.id).toBe("sapphire");
  });

  it("shows recipe readiness and the output improvement before crafting", () => {
    const [recipe] = knownRecipes(state);
    expect(craftableRecipeCount(state)).toBe(1);
    expect(recipeReadiness(recipe, state)).toBe("Ready to refine");
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
