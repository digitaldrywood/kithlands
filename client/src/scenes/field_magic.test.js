import { describe, it, expect } from "vitest";
import {
  buildFieldSpellList,
  canTargetFieldSpell,
  collectFieldSpellTargets,
  hasCastableFieldSpell,
  isFieldCastableSpell,
  spellNeedsFieldTarget,
} from "./field_magic.js";

function makeParty() {
  return [
    { name: "Mira", hp: 18, max_hp: 30, mp: 8, max_mp: 10, status: "" },
    { name: "Tank", hp: 26, max_hp: 40, mp: 0, max_mp: 0, status: "poison" },
    { name: "Scout", hp: 0, max_hp: 24, mp: 0, max_mp: 0, status: "death" },
  ];
}

describe("isFieldCastableSpell", () => {
  it("accepts heal, cure-status, and resurrect", () => {
    expect(
      isFieldCastableSpell({
        id: "cure",
        effect: "heal",
        target: "single_ally",
      }),
    ).toBe(true);
    expect(
      isFieldCastableSpell({
        id: "dispel",
        effect: "cure_status",
        target: "all_allies",
      }),
    ).toBe(true);
    expect(
      isFieldCastableSpell({
        id: "resurrect",
        effect: "utility",
        target: "single_ally",
      }),
    ).toBe(true);
  });

  it("rejects combat-only and unsupported utility spells", () => {
    expect(
      isFieldCastableSpell({
        id: "spark",
        effect: "damage",
        target: "single_enemy",
      }),
    ).toBe(false);
    expect(
      isFieldCastableSpell({
        id: "bless",
        effect: "buff",
        target: "single_ally",
      }),
    ).toBe(false);
    expect(
      isFieldCastableSpell({ id: "light", effect: "utility", target: "party" }),
    ).toBe(false);
  });
});

describe("buildFieldSpellList", () => {
  it("filters to field-usable spells and greys rows with no valid cast", () => {
    const party = makeParty();
    const caster = {
      name: "Mira",
      hp: 18,
      max_hp: 30,
      mp: 4,
      max_mp: 10,
      spells: [
        {
          id: "cure",
          name: "Cure",
          effect: "heal",
          target: "single_ally",
          mp_cost: 2,
        },
        {
          id: "heal",
          name: "Heal",
          effect: "heal",
          target: "all_allies",
          mp_cost: 4,
        },
        {
          id: "cure_poison",
          name: "Cure Poison",
          effect: "cure_status",
          target: "single_ally",
          cures_status: "poison",
          mp_cost: 4,
        },
        {
          id: "resurrect",
          name: "Resurrect",
          effect: "utility",
          target: "single_ally",
          mp_cost: 6,
        },
        {
          id: "spark",
          name: "Spark",
          effect: "damage",
          target: "single_enemy",
          mp_cost: 2,
        },
        {
          id: "light",
          name: "Light",
          effect: "utility",
          target: "party",
          mp_cost: 2,
        },
      ],
    };

    const list = buildFieldSpellList(caster, party);
    expect(list.map((spell) => spell.id)).toEqual([
      "cure",
      "heal",
      "cure_poison",
      "resurrect",
    ]);
    expect(list.find((spell) => spell.id === "cure").greyed).toBe(false);
    expect(list.find((spell) => spell.id === "resurrect").greyed).toBe(true);
    expect(list.find((spell) => spell.id === "resurrect").disabledReason).toBe(
      "low MP",
    );
  });

  it("keeps healing spells selectable even when nobody needs healing", () => {
    const party = [
      { name: "Mira", hp: 30, max_hp: 30, mp: 8, max_mp: 10, status: "" },
      { name: "Tank", hp: 40, max_hp: 40, mp: 0, max_mp: 0, status: "" },
    ];
    const caster = {
      name: "Mira",
      hp: 30,
      max_hp: 30,
      mp: 8,
      max_mp: 10,
      spells: [
        {
          id: "cure",
          name: "Cure",
          effect: "heal",
          target: "single_ally",
          mp_cost: 2,
        },
      ],
    };

    const [cure] = buildFieldSpellList(caster, party);
    expect(cure.greyed).toBe(false);
    expect(cure.hasValidTarget).toBe(false);
    expect(cure.disabledReason).toBeNull();
    expect(hasCastableFieldSpell(caster, party)).toBe(true);
  });
});

describe("field target helpers", () => {
  it("routes only single-ally spells through the target picker", () => {
    expect(
      spellNeedsFieldTarget({
        id: "cure",
        effect: "heal",
        target: "single_ally",
      }),
    ).toBe(true);
    expect(
      spellNeedsFieldTarget({
        id: "heal",
        effect: "heal",
        target: "all_allies",
      }),
    ).toBe(false);
  });

  it("pins target validity for heal, cure-status, and resurrect", () => {
    const [mira, tank, scout] = makeParty();

    expect(
      canTargetFieldSpell(
        { id: "cure", effect: "heal", target: "single_ally" },
        mira,
      ),
    ).toBe(true);
    expect(
      canTargetFieldSpell(
        {
          id: "cure_poison",
          effect: "cure_status",
          target: "single_ally",
          cures_status: "poison",
        },
        tank,
      ),
    ).toBe(true);
    expect(
      canTargetFieldSpell(
        { id: "resurrect", effect: "utility", target: "single_ally" },
        scout,
      ),
    ).toBe(true);
    expect(
      canTargetFieldSpell(
        { id: "resurrect", effect: "utility", target: "single_ally" },
        mira,
      ),
    ).toBe(false);
  });

  it("collects only valid party targets for the selected spell", () => {
    const party = makeParty();
    expect(
      collectFieldSpellTargets(
        { id: "cure", effect: "heal", target: "single_ally" },
        party,
      ).map((target) => target.name),
    ).toEqual(["Mira", "Tank"]);
    expect(
      collectFieldSpellTargets(
        {
          id: "cure_poison",
          effect: "cure_status",
          target: "single_ally",
          cures_status: "poison",
        },
        party,
      ).map((target) => target.name),
    ).toEqual(["Tank"]);
    expect(
      collectFieldSpellTargets(
        { id: "resurrect", effect: "utility", target: "single_ally" },
        party,
      ).map((target) => target.name),
    ).toEqual(["Scout"]);
  });
});
