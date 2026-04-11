import { describe, it, expect } from "vitest";
import { shouldStartBattle } from "./encounterFlow.js";

// Pins issue #114: the encounter flash and battle-scene transition must
// agree on when a battle is actually starting. Previously the client
// played the flash optimistically before the server response, so a
// response with phase="combat" but empty enemies (or phase="defeat" from
// overworld poison) left the flash orphaned and the player stuck. The
// pure helper here is the single source of truth — if it says false,
// the client must not play the flash or start the Battle scene.

describe("shouldStartBattle", () => {
  it("returns true for phase=combat with at least one enemy", () => {
    expect(
      shouldStartBattle({ phase: "combat", enemies: [{ id: 1, name: "slime" }] }),
    ).toBe(true);
  });

  it("returns false for phase=combat with an empty enemies array", () => {
    expect(shouldStartBattle({ phase: "combat", enemies: [] })).toBe(false);
  });

  it("returns false for phase=combat with missing enemies field", () => {
    expect(shouldStartBattle({ phase: "combat" })).toBe(false);
  });

  it("returns false for phase=world even with enemies populated", () => {
    expect(
      shouldStartBattle({ phase: "world", enemies: [{ id: 1, name: "slime" }] }),
    ).toBe(false);
  });

  it("returns false for phase=defeat (overworld poison death)", () => {
    expect(shouldStartBattle({ phase: "defeat", enemies: [] })).toBe(false);
  });

  it("returns false for null or undefined result", () => {
    expect(shouldStartBattle(null)).toBe(false);
    expect(shouldStartBattle(undefined)).toBe(false);
  });
});
