import { describe, expect, it } from "vitest";

import {
  createBattleAuditSelection,
  currentBattleAuditSelection,
  cycleBattleAuditSelection,
} from "./battle_character_audit.js";

const catalog = {
  identities: [
    { id: "warrior", equipment: [{ type: "sword" }, { type: "axe" }] },
    { id: "mender", equipment: [{ type: "staff" }] },
  ],
  animation_states: ["idle_guard", "physical_attack"],
  effect_modes: ["single_target", "all_allies"],
  effect_families: ["restorative_light", "fire"],
  intensity_tiers: [1, 2, 3],
};

describe("battle character audit selection", () => {
  it("cycles identities and resets equipment to a valid option", () => {
    const selection = createBattleAuditSelection(catalog);
    cycleBattleAuditSelection(selection, "equipment");
    expect(currentBattleAuditSelection(selection).equipment.type).toBe("axe");

    cycleBattleAuditSelection(selection, "identity");
    const current = currentBattleAuditSelection(selection);
    expect(current.identity.id).toBe("mender");
    expect(current.equipment.type).toBe("staff");
  });

  it("wraps every audit axis in both directions", () => {
    const selection = createBattleAuditSelection(catalog);
    cycleBattleAuditSelection(selection, "identity", -1);
    cycleBattleAuditSelection(selection, "animation", -1);
    cycleBattleAuditSelection(selection, "effect", -1);
    cycleBattleAuditSelection(selection, "family", -1);
    cycleBattleAuditSelection(selection, "intensity", -1);

    expect(currentBattleAuditSelection(selection)).toMatchObject({
      identity: { id: "mender" },
      animationState: "physical_attack",
      effectMode: "all_allies",
      effectFamily: "fire",
      intensityTier: 3,
    });
  });
});
