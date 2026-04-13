import { describe, it, expect } from "vitest";
import { shouldAcceptEnemySpriteClick } from "./battleTargeting.js";

// These tests pin issue #85: PR #70 added party targeting for heal/buff
// spells but left the enemy sprite click handler unguarded, so clicking
// an enemy while Cure was pending would exit party mode and record the
// heal with an enemy target_id. Fix: route enemy sprite clicks through
// shouldAcceptEnemySpriteClick, which only accepts them in enemy mode
// or in party mode when casting a heal on an undead enemy (FF1 canon —
// the server's resolveHealSpell still handles that branch).

describe("shouldAcceptEnemySpriteClick", () => {
  it("accepts any enemy click while in enemy targeting mode", () => {
    expect(shouldAcceptEnemySpriteClick("enemy", null, false)).toBe(true);
    expect(shouldAcceptEnemySpriteClick("enemy", "damage", false)).toBe(true);
    expect(shouldAcceptEnemySpriteClick("enemy", "heal", true)).toBe(true);
  });

  it("accepts heal on an undead enemy while in party targeting mode", () => {
    expect(shouldAcceptEnemySpriteClick("party", "heal", true)).toBe(true);
  });

  it("rejects heal on a non-undead enemy while in party targeting mode", () => {
    expect(shouldAcceptEnemySpriteClick("party", "heal", false)).toBe(false);
  });

  it("rejects buff spells on any enemy while in party targeting mode", () => {
    expect(shouldAcceptEnemySpriteClick("party", "buff", true)).toBe(false);
    expect(shouldAcceptEnemySpriteClick("party", "buff", false)).toBe(false);
  });

  it("rejects cure_status spells on any enemy while in party targeting mode", () => {
    expect(shouldAcceptEnemySpriteClick("party", "cure_status", true)).toBe(
      false,
    );
    expect(shouldAcceptEnemySpriteClick("party", "cure_status", false)).toBe(
      false,
    );
  });

  it("rejects clicks when no targeting mode is active", () => {
    expect(shouldAcceptEnemySpriteClick(false, "heal", true)).toBe(false);
    expect(shouldAcceptEnemySpriteClick(null, "damage", false)).toBe(false);
    expect(shouldAcceptEnemySpriteClick(undefined, null, false)).toBe(false);
  });
});
