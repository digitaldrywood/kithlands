import { describe, expect, it } from "vitest";

import {
  BATTLE_CHARACTER_CATALOG,
  battleBodyAssets,
  battleOffHandAssets,
  battleProfileFor,
  battleStateFor,
} from "./battleCharacters.js";

describe("shared battle character catalog", () => {
  it("covers every runtime identity and required state name", () => {
    expect(BATTLE_CHARACTER_CATALOG.classes.map(({ id }) => id)).toEqual([
      "warrior",
      "brawler",
      "rogue",
      "mender",
      "cinder",
      "wayfarer",
      "knight",
      "champion",
      "shadow",
      "sage",
      "pyromancer",
      "wanderer",
    ]);
    expect(BATTLE_CHARACTER_CATALOG.required_states).toHaveLength(8);
  });

  it("deduplicates shared atlases while preserving state lookup", () => {
    expect(battleOffHandAssets()).toEqual([
      {
        visual_id: "steel_shield",
        key: "battle_off_hand_steel_shield",
        path: "/sprites/battle/off-hand/steel-shield.png",
      },
    ]);
    expect(battleBodyAssets().map(({ key }) => key)).toEqual([
      "battle_warrior_sword_attack_body",
      "battle_brawler_unarmed_strike_body",
      "battle_rogue_dagger_slash_body",
      "battle_mender_staff_cast_body",
      "battle_cinder_staff_cast_body",
      "battle_wayfarer_staff_inspire_body",
      "battle_knight_sword_shield_defend_body",
      "battle_champion_unarmed_palm_burst_body",
      "battle_shadow_dagger_veil_strike_body",
      "battle_sage_staff_sanctuary_body",
    ]);
    expect(battleProfileFor("brawler").status).toBe("visual_approval_pending");
    expect(battleStateFor("brawler", "physical_attack").frames).toHaveLength(6);
    expect(battleStateFor("rogue", "physical_attack").frames).toHaveLength(6);
    expect(battleStateFor("mender", "cast_class_ability").frames).toHaveLength(
      6,
    );
    expect(battleProfileFor("cinder").status).toBe("visual_approval_pending");
    expect(battleStateFor("cinder", "cast_class_ability").frames).toHaveLength(
      6,
    );
    expect(
      battleStateFor("wayfarer", "cast_class_ability").frames,
    ).toHaveLength(6);
    expect(battleProfileFor("knight").status).toBe("visual_approval_pending");
    expect(battleStateFor("knight", "defend").frames).toHaveLength(6);
    expect(battleProfileFor("champion").status).toBe("visual_approval_pending");
    expect(battleStateFor("champion", "physical_attack").frames).toHaveLength(
      6,
    );
    expect(battleProfileFor("shadow").status).toBe("visual_approval_pending");
    expect(battleStateFor("shadow", "physical_attack").frames).toHaveLength(6);
    expect(battleProfileFor("sage").status).toBe("visual_approval_pending");
    expect(battleStateFor("sage", "cast_class_ability").frames).toHaveLength(6);
  });
});
