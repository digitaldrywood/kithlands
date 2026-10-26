import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import authoredCatalog from "../../../shared/battle_characters.json";

import {
  BATTLE_CHARACTER_CATALOG,
  battleBodyAssets,
  battleOffHandAssets,
  battleProfileFor,
  battleStateFor,
  expandBattleCharacterCatalog,
} from "./battleCharacters.js";

describe("shared battle character catalog", () => {
  it("keeps casting emission points inside the shipped weapon image", () => {
    for (const asset of BATTLE_CHARACTER_CATALOG.weapon_assets) {
      if (!asset.emission_point) continue;
      const png = readFileSync(
        new URL(`../../public${asset.path}`, import.meta.url),
      );
      expect(png.subarray(1, 4).toString(), asset.visual_id).toBe("PNG");
      const width = png.readUInt32BE(16),
        height = png.readUInt32BE(20);
      const [x, y] = asset.emission_point;
      expect(Number.isFinite(x) && Number.isFinite(y), asset.visual_id).toBe(
        true,
      );
      expect(x, asset.visual_id).toBeGreaterThanOrEqual(0);
      expect(x, asset.visual_id).toBeLessThan(width);
      expect(y, asset.visual_id).toBeGreaterThanOrEqual(0);
      expect(y, asset.visual_id).toBeLessThan(height);
    }
  });
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
    for (const profile of BATTLE_CHARACTER_CATALOG.classes) {
      expect(profile.state_recipe, profile.id).toBeTruthy();
      expect(Object.keys(profile.states), profile.id).toEqual(
        profile.id === "warrior"
          ? [...BATTLE_CHARACTER_CATALOG.required_states, "critical_attack"]
          : BATTLE_CHARACTER_CATALOG.required_states,
      );
      const signature = profile.states[profile.default_state];
      const authored = authoredCatalog.classes.find(
        ({ id }) => id === profile.id,
      );
      for (const stateID of BATTLE_CHARACTER_CATALOG.required_states) {
        const state = profile.states[stateID];
        expect(state.frames.length, `${profile.id}/${stateID}`).toBeGreaterThan(
          0,
        );
        const expected = authored.states[stateID] || signature;
        expect(state.body_key, `${profile.id}/${stateID}`).toBe(
          expected.body_key,
        );
        expect(state.body_path, `${profile.id}/${stateID}`).toBe(
          expected.body_path,
        );
      }
      expect(profile.states.ko_defeated.hold_last_frame, profile.id).toBe(true);
      if (Object.keys(profile.attachments).length > 0) {
        const itemPoses = profile.states.item_use.frames.flatMap((frame) =>
          Object.values(frame.attachments),
        );
        if (profile.id === "warrior") {
          expect(
            itemPoses.some((pose) => pose.visible === false),
            "warrior/item_use",
          ).toBe(true);
        } else {
          expect(
            itemPoses.every((pose) => pose.visible === false),
            `${profile.id}/item_use`,
          ).toBe(true);
        }
      }
    }
    expect(battleStateFor("warrior", "ko_defeated")).toMatchObject({
      hold_last_frame: true,
      body_key: "battle_warrior_sword_ko_body",
      frames: expect.arrayContaining([expect.objectContaining({ frame: 2 })]),
    });
    expect(
      battleStateFor("warrior", "item_use").frames.some(
        (frame) => frame.attachments.sword.visible === false,
      ),
    ).toBe(true);
  });

  it("keeps explicitly authored and optional states ahead of recipes", () => {
    const source = {
      required_states: ["idle_guard", "physical_attack"],
      state_recipes: {
        test: {
          states: {
            physical_attack: {
              frames: [{ frame: 0, duration: 999 }],
            },
          },
        },
      },
      classes: [
        {
          id: "test",
          state_recipe: "test",
          default_state: "physical_attack",
          states: {
            idle_guard: {
              body_key: "test_body",
              body_path: "/test.png",
              frames: [{ frame: 0, duration: 80, attachments: {} }],
            },
            physical_attack: {
              body_key: "test_body",
              body_path: "/test.png",
              frames: [{ frame: 0, duration: 123, attachments: {} }],
            },
            optional_flourish: {
              body_key: "test_body",
              body_path: "/test.png",
              frames: [{ frame: 0, duration: 456, attachments: {} }],
            },
          },
        },
      ],
    };

    const expanded = expandBattleCharacterCatalog(source);
    expect(expanded.classes[0].states.physical_attack.frames[0].duration).toBe(
      123,
    );
    expect(
      expanded.classes[0].states.optional_flourish.frames[0].duration,
    ).toBe(456);
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
      "battle_warrior_sword_defend_body",
      "battle_warrior_sword_hit_body",
      "battle_warrior_sword_item_body",
      "battle_warrior_sword_victory_body",
      "battle_warrior_sword_ko_body",
      "battle_brawler_unarmed_strike_body",
      "battle_rogue_dagger_slash_body",
      "battle_mender_staff_cast_body",
      "battle_cinder_staff_cast_body",
      "battle_cinder_staff_hit_body",
      "battle_wayfarer_staff_inspire_body",
      "battle_knight_sword_shield_defend_body",
      "battle_champion_unarmed_palm_burst_body",
      "battle_shadow_dagger_veil_strike_body",
      "battle_sage_staff_sanctuary_body",
      "battle_pyromancer_staff_inferno_body",
      "battle_wanderer_staff_waystar_body",
    ]);
    expect(battleProfileFor("brawler").status).toBe("approved_runtime");
    expect(battleStateFor("brawler", "physical_attack").frames).toHaveLength(6);
    expect(battleStateFor("rogue", "physical_attack").frames).toHaveLength(6);
    expect(battleStateFor("mender", "cast_class_ability").frames).toHaveLength(
      6,
    );
    expect(battleProfileFor("cinder").status).toBe("approved_runtime");
    expect(battleStateFor("cinder", "cast_class_ability").frames).toHaveLength(
      6,
    );
    expect(
      battleStateFor("wayfarer", "cast_class_ability").frames,
    ).toHaveLength(6);
    expect(battleProfileFor("knight").status).toBe("approved_runtime");
    expect(battleStateFor("knight", "defend").frames).toHaveLength(6);
    expect(battleProfileFor("champion").status).toBe("approved_runtime");
    expect(battleStateFor("champion", "physical_attack").frames).toHaveLength(
      6,
    );
    expect(battleProfileFor("shadow").status).toBe("approved_runtime");
    expect(battleStateFor("shadow", "physical_attack").frames).toHaveLength(6);
    expect(battleProfileFor("sage").status).toBe("approved_runtime");
    expect(battleStateFor("sage", "cast_class_ability").frames).toHaveLength(6);
    expect(battleProfileFor("pyromancer").status).toBe("approved_runtime");
    expect(
      battleStateFor("pyromancer", "cast_class_ability").frames,
    ).toHaveLength(6);
    expect(battleProfileFor("wanderer").status).toBe("approved_runtime");
    expect(
      battleStateFor("wanderer", "cast_class_ability").frames,
    ).toHaveLength(6);
  });
});
