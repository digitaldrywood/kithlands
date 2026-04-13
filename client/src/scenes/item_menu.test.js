import { describe, it, expect } from "vitest";
import { buildItemList, canUseOnTarget } from "./item_menu.js";

// These tests pin the pure pieces of the FF6-style item menu (issue #144).
// The Phaser overlay scene imports from the same module so unit tests can
// exercise the filtering / grey-out / target-validation logic without
// instantiating Phaser.

function makeGS(overrides = {}) {
  return {
    party: [
      { name: "Hero", hp: 40, max_hp: 40, mp: 0, max_mp: 0, status: "" },
      { name: "Mage", hp: 25, max_hp: 30, mp: 5, max_mp: 20, status: "" },
      { name: "Buddy", hp: 18, max_hp: 30, mp: 0, max_mp: 0, status: "" },
    ],
    items: [],
    ...overrides,
  };
}

describe("buildItemList", () => {
  it("returns only world-usable items in world mode", () => {
    const gs = makeGS({
      items: [
        {
          id: "potion",
          name: "Potion",
          count: 3,
          effect: "heal",
          description: "Heals",
          combat_usable: true,
          world_usable: true,
        },
        {
          id: "tent",
          name: "Tent",
          count: 1,
          effect: "rest",
          description: "Rests",
          combat_usable: false,
          world_usable: true,
        },
      ],
    });
    const list = buildItemList(gs, "world");
    const ids = list.map((i) => i.id);
    expect(ids).toContain("potion");
    expect(ids).toContain("tent");
  });

  it("excludes non-combat items in combat mode", () => {
    const gs = makeGS({
      items: [
        {
          id: "potion",
          name: "Potion",
          count: 3,
          effect: "heal",
          combat_usable: true,
          world_usable: true,
        },
        {
          id: "tent",
          name: "Tent",
          count: 1,
          effect: "rest",
          combat_usable: false,
          world_usable: true,
        },
      ],
    });
    const ids = buildItemList(gs, "combat").map((i) => i.id);
    expect(ids).toContain("potion");
    expect(ids).not.toContain("tent");
  });

  it("skips non-consumable inventory entries (weapons/armor)", () => {
    const gs = makeGS({
      items: [
        { id: "wpn_long_sword", name: "Long Sword", count: 1, power: 10 },
        { id: "arm_chain", name: "Chain Mail", count: 1, absorb: 8 },
        {
          id: "potion",
          name: "Potion",
          count: 3,
          effect: "heal",
          combat_usable: true,
          world_usable: true,
        },
      ],
    });
    const ids = buildItemList(gs, "world").map((i) => i.id);
    expect(ids).toEqual(["potion"]);
  });

  it("skips items with zero count", () => {
    const gs = makeGS({
      items: [
        {
          id: "potion",
          name: "Potion",
          count: 0,
          effect: "heal",
          combat_usable: true,
          world_usable: true,
        },
        {
          id: "ether",
          name: "Ether",
          count: 2,
          effect: "restore_mp",
          combat_usable: true,
          world_usable: true,
        },
      ],
    });
    const ids = buildItemList(gs, "world").map((i) => i.id);
    expect(ids).toEqual(["ether"]);
  });

  it("greys phoenix_down when no party member is KO'd", () => {
    const gs = makeGS({
      items: [
        {
          id: "phoenix_down",
          name: "Phoenix Down",
          count: 1,
          effect: "revive",
          combat_usable: true,
          world_usable: true,
        },
      ],
    });
    const [pd] = buildItemList(gs, "world");
    expect(pd.greyed).toBe(true);
  });

  it("enables phoenix_down when someone is KO'd", () => {
    const gs = makeGS();
    gs.party[2].hp = 0;
    gs.party[2].status = "death";
    gs.items = [
      {
        id: "phoenix_down",
        name: "Phoenix Down",
        count: 1,
        effect: "revive",
        combat_usable: true,
        world_usable: true,
      },
    ];
    const [pd] = buildItemList(gs, "world");
    expect(pd.greyed).toBe(false);
  });

  it("greys ether when no caster has missing MP", () => {
    const gs = makeGS();
    gs.party[1].mp = gs.party[1].max_mp; // Mage at full MP
    gs.items = [
      {
        id: "ether",
        name: "Ether",
        count: 1,
        effect: "restore_mp",
        combat_usable: true,
        world_usable: true,
      },
    ];
    expect(buildItemList(gs, "world")[0].greyed).toBe(true);
  });

  it("enables ether when a caster is missing MP", () => {
    const gs = makeGS(); // mage starts at 5/20
    gs.items = [
      {
        id: "ether",
        name: "Ether",
        count: 1,
        effect: "restore_mp",
        combat_usable: true,
        world_usable: true,
      },
    ];
    expect(buildItemList(gs, "world")[0].greyed).toBe(false);
  });

  it("greys antidote when no one is poisoned", () => {
    const gs = makeGS({
      items: [
        {
          id: "antidote",
          name: "Antidote",
          count: 1,
          effect: "cure_poison",
          combat_usable: true,
          world_usable: true,
        },
      ],
    });
    expect(buildItemList(gs, "world")[0].greyed).toBe(true);
  });

  it("enables antidote when an ally is poisoned", () => {
    const gs = makeGS();
    gs.party[0].status = "poison";
    gs.items = [
      {
        id: "antidote",
        name: "Antidote",
        count: 1,
        effect: "cure_poison",
        combat_usable: true,
        world_usable: true,
      },
    ];
    expect(buildItemList(gs, "world")[0].greyed).toBe(false);
  });

  it("greys potion when everyone is at full HP", () => {
    const gs = makeGS();
    gs.party.forEach((p) => (p.hp = p.max_hp));
    gs.items = [
      {
        id: "potion",
        name: "Potion",
        count: 3,
        effect: "heal",
        combat_usable: true,
        world_usable: true,
      },
    ];
    expect(buildItemList(gs, "world")[0].greyed).toBe(true);
  });

  it("returns [] when gs is null or missing items", () => {
    expect(buildItemList(null, "world")).toEqual([]);
    expect(buildItemList({}, "world")).toEqual([]);
    expect(buildItemList({ items: [] }, "world")).toEqual([]);
  });
});

describe("canUseOnTarget", () => {
  const alive = { hp: 20, max_hp: 30, mp: 5, max_mp: 20, status: "" };
  const dead = { hp: 0, max_hp: 30, mp: 0, max_mp: 0, status: "death" };
  const poisoned = { hp: 20, max_hp: 30, mp: 0, max_mp: 0, status: "poison" };
  const silenced = { hp: 20, max_hp: 30, mp: 0, max_mp: 0, status: "silence" };
  const nonCaster = { hp: 30, max_hp: 30, mp: 0, max_mp: 0, status: "" };

  it("heal: only living members with HP < max", () => {
    expect(canUseOnTarget({ effect: "heal" }, alive)).toBe(true);
    expect(canUseOnTarget({ effect: "heal" }, dead)).toBe(false);
    const full = { ...alive, hp: alive.max_hp };
    expect(canUseOnTarget({ effect: "heal" }, full)).toBe(false);
  });

  it("restore_mp: only living casters with MP < max", () => {
    expect(canUseOnTarget({ effect: "restore_mp" }, alive)).toBe(true);
    expect(canUseOnTarget({ effect: "restore_mp" }, nonCaster)).toBe(false);
    expect(canUseOnTarget({ effect: "restore_mp" }, dead)).toBe(false);
    const fullMP = { ...alive, mp: alive.max_mp };
    expect(canUseOnTarget({ effect: "restore_mp" }, fullMP)).toBe(false);
  });

  it("revive: only KO'd members", () => {
    expect(canUseOnTarget({ effect: "revive" }, dead)).toBe(true);
    expect(canUseOnTarget({ effect: "revive" }, alive)).toBe(false);
  });

  it("cure_poison: only poisoned members", () => {
    expect(canUseOnTarget({ effect: "cure_poison" }, poisoned)).toBe(true);
    expect(canUseOnTarget({ effect: "cure_poison" }, alive)).toBe(false);
  });

  it("cure_silence: only silenced members", () => {
    expect(canUseOnTarget({ effect: "cure_silence" }, silenced)).toBe(true);
    expect(canUseOnTarget({ effect: "cure_silence" }, poisoned)).toBe(false);
  });

  it("rest: no per-target selection (returns false everywhere)", () => {
    // Tent is a party-level effect; target pickers should not call this.
    expect(canUseOnTarget({ effect: "rest" }, alive)).toBe(false);
  });
});
