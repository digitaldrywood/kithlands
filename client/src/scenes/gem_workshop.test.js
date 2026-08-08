import { describe, expect, it } from "vitest";
import {
  firstOpenSocket,
  gemWorkshopEnabled,
  knownRecipes,
  ownedGems,
  recipeCostLabel,
  socketableGear,
} from "./gem_workshop.js";

const state = {
  items: [
    {
      instance_id: "gear_1",
      sockets: [{ index: 0 }, { index: 1, gem_id: "ruby" }],
    },
    { instance_id: "gear_2", sockets: [{ index: 0, gem_id: "ruby" }] },
    { id: "potion", count: 3 },
  ],
  gems: [{ id: "ruby", name: "Ruby", count: 2 }],
  gem_recipes: [
    {
      id: "cut_ruby",
      inputs: [{ gem_id: "ruby", gem_name: "Ruby", count: 2 }],
      craftable: true,
    },
  ],
};

describe("Gem Workshop selectors", () => {
  it("finds owned gems and gear with open sockets", () => {
    expect(ownedGems(state)).toHaveLength(1);
    expect(socketableGear(state).map((item) => item.instance_id)).toEqual([
      "gear_1",
    ]);
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

  it("enables the workshop for either gems or recipes", () => {
    expect(gemWorkshopEnabled(state)).toBe(true);
    expect(gemWorkshopEnabled({ gems: [], gem_recipes: [] })).toBe(false);
  });
});
