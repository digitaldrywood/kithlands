import { describe, it, expect } from "vitest";
import { resolveAction, buildAutoBattleActions } from "./auto_battle.js";

// Shared test fixtures — minimal game state objects that satisfy the resolver.

function makeEnemy(id, hp, maxHp = 100) {
  return { id, name: `Enemy${id}`, hp, max_hp: maxHp };
}

function makeMember(slot, hp, maxHp = 100, mp = 0, maxMp = 0, spells = []) {
  return {
    name: `Member${slot}`,
    class_id: "warrior",
    hp,
    max_hp: maxHp,
    mp,
    max_mp: maxMp,
    spells,
  };
}

function makeState(overrides = {}) {
  return {
    enemies: [makeEnemy(1, 50), makeEnemy(2, 80)],
    party: [
      makeMember(0, 80, 100, 20, 50, [
        {
          id: "fire",
          name: "Fire",
          target: "single_enemy",
          effect: "damage",
          mp_cost: 5,
        },
        {
          id: "cure",
          name: "Cure",
          target: "single_ally",
          effect: "heal",
          mp_cost: 8,
        },
      ]),
      makeMember(1, 60, 100),
      makeMember(2, 100, 100),
      makeMember(3, 40, 100),
    ],
    potions: 3,
    ethers: 1,
    items: [{ id: "phoenix_down", name: "Phoenix Down", count: 1 }],
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// Actor dead — always null
// -----------------------------------------------------------------------
describe("actor dead", () => {
  it("returns null when actor has 0 hp", () => {
    const gs = makeState();
    const actor = makeMember(0, 0);
    const action = { slot: 0, type: "attack", target_id: 1 };
    expect(resolveAction(action, actor, gs)).toBeNull();
  });
});

// -----------------------------------------------------------------------
// No living enemies — always null
// -----------------------------------------------------------------------
describe("no living enemies", () => {
  it("returns null when all enemies are dead", () => {
    const gs = makeState({
      enemies: [makeEnemy(1, 0), makeEnemy(2, 0)],
    });
    const actor = makeMember(0, 80);
    const action = { slot: 0, type: "attack", target_id: 1 };
    expect(resolveAction(action, actor, gs)).toBeNull();
  });
});

// -----------------------------------------------------------------------
// Attack
// -----------------------------------------------------------------------
describe("attack", () => {
  it("keeps original target if alive", () => {
    const gs = makeState();
    const actor = gs.party[0];
    const action = { slot: 0, type: "attack", target_id: 1 };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });

  it("retargets to closest living enemy if original is dead", () => {
    const gs = makeState({
      enemies: [makeEnemy(1, 0), makeEnemy(2, 50)],
    });
    const actor = gs.party[0];
    const action = { slot: 0, type: "attack", target_id: 1 };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 2 });
  });

  it("returns null if target dead and no living enemies", () => {
    const gs = makeState({
      enemies: [makeEnemy(1, 0), makeEnemy(2, 0)],
    });
    const actor = makeMember(0, 80);
    const action = { slot: 0, type: "attack", target_id: 1 };
    expect(resolveAction(action, actor, gs)).toBeNull();
  });
});

// -----------------------------------------------------------------------
// Heal spell on ally
// -----------------------------------------------------------------------
describe("heal spell on ally", () => {
  it("keeps original target if alive and enough MP", () => {
    const gs = makeState();
    const actor = gs.party[0]; // mp=20, cure costs 8
    const action = { slot: 0, type: "spell", target_id: 1, spell_id: "cure" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({
      slot: 0,
      type: "spell",
      target_id: 1,
      spell_id: "cure",
    });
  });

  it("retargets to most-damaged ally if original target is dead", () => {
    const gs = makeState();
    // Kill member at slot 1 (the original target)
    gs.party[1] = makeMember(1, 0, 100);
    // Member 3 is most damaged (40/100)
    const actor = gs.party[0];
    const action = { slot: 0, type: "spell", target_id: 1, spell_id: "cure" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({
      slot: 0,
      type: "spell",
      target_id: 3,
      spell_id: "cure",
    });
  });

  it("falls back to attack if not enough MP", () => {
    const gs = makeState();
    // Set MP to 0
    gs.party[0] = makeMember(0, 80, 100, 0, 50, [
      {
        id: "cure",
        name: "Cure",
        target: "single_ally",
        effect: "heal",
        mp_cost: 8,
      },
    ]);
    const actor = gs.party[0];
    const action = { slot: 0, type: "spell", target_id: 1, spell_id: "cure" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });
});

// -----------------------------------------------------------------------
// Damage spell on enemy
// -----------------------------------------------------------------------
describe("damage spell on enemy", () => {
  it("keeps original target if alive and enough MP", () => {
    const gs = makeState();
    const actor = gs.party[0]; // mp=20, fire costs 5
    const action = { slot: 0, type: "spell", target_id: 2, spell_id: "fire" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({
      slot: 0,
      type: "spell",
      target_id: 2,
      spell_id: "fire",
    });
  });

  it("retargets to closest living enemy if original is dead", () => {
    const gs = makeState({
      enemies: [makeEnemy(1, 50), makeEnemy(2, 0)],
    });
    const actor = gs.party[0];
    const action = { slot: 0, type: "spell", target_id: 2, spell_id: "fire" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({
      slot: 0,
      type: "spell",
      target_id: 1,
      spell_id: "fire",
    });
  });

  it("falls back to attack if not enough MP (original target alive)", () => {
    const gs = makeState();
    gs.party[0] = makeMember(0, 80, 100, 2, 50, [
      {
        id: "fire",
        name: "Fire",
        target: "single_enemy",
        effect: "damage",
        mp_cost: 5,
      },
    ]);
    const actor = gs.party[0];
    const action = { slot: 0, type: "spell", target_id: 1, spell_id: "fire" };
    const result = resolveAction(action, actor, gs);
    // Falls back to attack on closest living enemy
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });

  it("falls back to attack if not enough MP (original target dead)", () => {
    const gs = makeState({
      enemies: [makeEnemy(1, 0), makeEnemy(2, 50)],
    });
    gs.party[0] = makeMember(0, 80, 100, 2, 50, [
      {
        id: "fire",
        name: "Fire",
        target: "single_enemy",
        effect: "damage",
        mp_cost: 5,
      },
    ]);
    const actor = gs.party[0];
    const action = { slot: 0, type: "spell", target_id: 1, spell_id: "fire" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 2 });
  });
});

// -----------------------------------------------------------------------
// Unknown spell (spell no longer known)
// -----------------------------------------------------------------------
describe("spell no longer known", () => {
  it("falls back to attack if spell is not in actor spells", () => {
    const gs = makeState();
    const actor = makeMember(0, 80, 100, 20, 50, []); // no spells
    const action = { slot: 0, type: "spell", target_id: 1, spell_id: "cure" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });
});

// -----------------------------------------------------------------------
// Use potion on ally
// -----------------------------------------------------------------------
describe("use potion on ally", () => {
  it("keeps original if target alive, not full HP, potions available", () => {
    const gs = makeState(); // potions: 3, member 1 at 60/100
    const actor = gs.party[0];
    const action = { slot: 0, type: "item", target_id: 1, item_id: "potion" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({
      slot: 0,
      type: "item",
      target_id: 1,
      item_id: "potion",
    });
  });

  it("falls back to attack if no potions left", () => {
    const gs = makeState({ potions: 0 });
    const actor = gs.party[0];
    const action = { slot: 0, type: "item", target_id: 1, item_id: "potion" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });

  it("falls back to attack if target is dead", () => {
    const gs = makeState();
    gs.party[1] = makeMember(1, 0, 100);
    const actor = gs.party[0];
    const action = { slot: 0, type: "item", target_id: 1, item_id: "potion" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });

  it("falls back to attack if target is at full HP", () => {
    const gs = makeState();
    gs.party[1] = makeMember(1, 100, 100); // full HP
    const actor = gs.party[0];
    const action = { slot: 0, type: "item", target_id: 1, item_id: "potion" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });
});

// -----------------------------------------------------------------------
// Use ether on ally
// -----------------------------------------------------------------------
describe("use ether on ally", () => {
  it("falls back to attack if no ethers left", () => {
    const gs = makeState({ ethers: 0 });
    // Member at less than full HP so the item target check passes
    const actor = gs.party[0];
    const action = { slot: 0, type: "item", target_id: 1, item_id: "ether" };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });
});

// -----------------------------------------------------------------------
// Revive (phoenix down)
// -----------------------------------------------------------------------
describe("revive", () => {
  it("keeps revive if target is still dead and phoenix down available", () => {
    const gs = makeState();
    gs.party[2] = makeMember(2, 0, 100); // dead
    const actor = gs.party[0];
    const action = {
      slot: 0,
      type: "revive",
      target_id: 2,
      item_id: "phoenix_down",
    };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({
      slot: 0,
      type: "revive",
      target_id: 2,
      item_id: "phoenix_down",
    });
  });

  it("falls back to attack if no phoenix down left", () => {
    const gs = makeState({ items: [] });
    gs.party[2] = makeMember(2, 0, 100);
    const actor = gs.party[0];
    const action = {
      slot: 0,
      type: "revive",
      target_id: 2,
      item_id: "phoenix_down",
    };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });

  it("falls back to attack if target is no longer dead", () => {
    const gs = makeState();
    // Member 2 is alive (100 HP)
    const actor = gs.party[0];
    const action = {
      slot: 0,
      type: "revive",
      target_id: 2,
      item_id: "phoenix_down",
    };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });
});

// -----------------------------------------------------------------------
// Ability
// -----------------------------------------------------------------------
describe("ability", () => {
  it("keeps original target if alive", () => {
    const gs = makeState();
    const actor = gs.party[0];
    const action = {
      slot: 0,
      type: "ability",
      target_id: 1,
      ability_id: "focus",
    };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({
      slot: 0,
      type: "ability",
      target_id: 1,
      ability_id: "focus",
    });
  });

  it("retargets to closest living enemy if original is dead", () => {
    const gs = makeState({
      enemies: [makeEnemy(1, 0), makeEnemy(2, 80)],
    });
    const actor = gs.party[0];
    const action = {
      slot: 0,
      type: "ability",
      target_id: 1,
      ability_id: "backstab",
    };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({
      slot: 0,
      type: "ability",
      target_id: 2,
      ability_id: "backstab",
    });
  });
});

// -----------------------------------------------------------------------
// Edge cases
// -----------------------------------------------------------------------
describe("edge cases", () => {
  it("handles single enemy that is alive", () => {
    const gs = makeState({ enemies: [makeEnemy(5, 30)] });
    const actor = gs.party[0];
    const action = { slot: 0, type: "attack", target_id: 5 };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 5 });
  });

  it("preserves slot from original action", () => {
    const gs = makeState();
    const actor = gs.party[2];
    const action = { slot: 2, type: "attack", target_id: 1 };
    const result = resolveAction(action, actor, gs);
    expect(result.slot).toBe(2);
  });

  it("falls back to attack for unknown action type", () => {
    const gs = makeState();
    const actor = gs.party[0];
    const action = { slot: 0, type: "unknown_thing", target_id: 1 };
    const result = resolveAction(action, actor, gs);
    expect(result).toEqual({ slot: 0, type: "attack", target_id: 1 });
  });

  it("retargets heal to most-damaged ally by hp ratio", () => {
    const gs = makeState();
    // Slot 0: 80/100 = 80%, Slot 1: dead, Slot 2: 30/200 = 15%, Slot 3: 40/100 = 40%
    gs.party[1] = makeMember(1, 0, 100);
    gs.party[2] = makeMember(2, 30, 200);
    gs.party[0] = makeMember(0, 80, 100, 20, 50, [
      {
        id: "cure",
        name: "Cure",
        target: "single_ally",
        effect: "heal",
        mp_cost: 8,
      },
    ]);
    const actor = gs.party[0];
    const action = { slot: 0, type: "spell", target_id: 1, spell_id: "cure" };
    const result = resolveAction(action, actor, gs);
    // Should pick slot 2 (15% ratio — most damaged living ally)
    expect(result).toEqual({
      slot: 0,
      type: "spell",
      target_id: 2,
      spell_id: "cure",
    });
  });
});

describe("buildAutoBattleActions", () => {
  it("defaults to basic attacks when no remembered round exists", () => {
    const gs = makeState();
    const actions = buildAutoBattleActions(null, gs, [0, 1, 2, 3]);
    expect(actions).toEqual([
      { slot: 0, type: "attack", target_id: 1 },
      { slot: 1, type: "attack", target_id: 1 },
      { slot: 2, type: "attack", target_id: 1 },
      { slot: 3, type: "attack", target_id: 1 },
    ]);
  });

  it("reuses remembered actions when available and falls back per slot otherwise", () => {
    const gs = makeState({
      enemies: [makeEnemy(1, 0), makeEnemy(2, 50)],
    });
    const actions = buildAutoBattleActions(
      [
        { slot: 0, type: "spell", target_id: 1, spell_id: "fire" },
        { slot: 2, type: "attack", target_id: 1 },
      ],
      gs,
      [0, 1, 2, 3],
    );
    expect(actions).toEqual([
      { slot: 0, type: "spell", target_id: 2, spell_id: "fire" },
      { slot: 1, type: "attack", target_id: 2 },
      { slot: 2, type: "attack", target_id: 2 },
      { slot: 3, type: "attack", target_id: 2 },
    ]);
  });
});
