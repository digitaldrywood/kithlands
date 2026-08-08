import { describe, expect, it } from "vitest";
import {
  defaultSpellTargetMode,
  isGroupTargetMode,
  targetModeSide,
} from "./battleSpellTargeting.js";

describe("battle spell targeting", () => {
  it("uses an all-target spell's authored default without another menu", () => {
    const spell = {
      target: "all_allies",
      target_modes: ["all_allies", "single_ally"],
    };
    expect(defaultSpellTargetMode(spell)).toBe("all_allies");
    expect(isGroupTargetMode(defaultSpellTargetMode(spell))).toBe(true);
  });

  it("uses a single-target spell's authored default without another menu", () => {
    const spell = {
      target: "single_enemy",
      target_modes: ["single_enemy", "all_enemies"],
    };
    expect(defaultSpellTargetMode(spell)).toBe("single_enemy");
    expect(isGroupTargetMode(defaultSpellTargetMode(spell))).toBe(false);
  });

  it("maps ally groups to the party formation", () => {
    expect(targetModeSide("all_allies")).toBe("party");
    expect(targetModeSide("all_enemies")).toBe("enemy");
  });
});
