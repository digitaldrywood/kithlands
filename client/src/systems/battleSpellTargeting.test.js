import { describe, expect, it } from "vitest";
import {
  isGroupTargetMode,
  spellTargetBadge,
  spellTargetModes,
  targetModeSide,
} from "./battleSpellTargeting.js";

describe("battle spell targeting", () => {
  it("keeps a fixed all-target spell fixed", () => {
    const spell = { target: "all_allies" };
    expect(spellTargetModes(spell)).toEqual(["all_allies"]);
    expect(spellTargetBadge(spell)).toBe("ALL ALLIES");
    expect(isGroupTargetMode(spellTargetModes(spell)[0])).toBe(true);
  });

  it("offers explicit one-or-all modes when content allows both", () => {
    const spell = {
      target: "single_enemy",
      target_modes: ["single_enemy", "all_enemies"],
    };
    expect(spellTargetModes(spell)).toEqual(["single_enemy", "all_enemies"]);
    expect(spellTargetBadge(spell)).toBe("ONE ENEMY / ALL ENEMIES");
  });

  it("maps ally groups to the party formation", () => {
    expect(targetModeSide("all_allies")).toBe("party");
    expect(targetModeSide("all_enemies")).toBe("enemy");
  });
});
