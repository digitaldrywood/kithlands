import { describe, expect, it } from "vitest";
import classes from "../../../shared/classes.json";
import items from "../../../shared/items.json";
import {
  MENDER_BATTLE_BODY_KEY,
  MENDER_STAFF_CAST_FRAMES,
  WARRIOR_BATTLE_BODY_KEY,
  WARRIOR_SWORD_ATTACK_FRAMES,
  battleFrameDelay,
  canUseBattleCharacterSprite,
  canUseMenderBattleSprite,
  canUseWarriorBattleSprite,
  offHandTextureKey,
  weaponTextureKey,
} from "./battleCharacterSprite.js";
import {
  BATTLE_CHARACTER_CATALOG,
  battleProfileFor,
  battleBodyAssets,
  battleWeaponAssets,
} from "../data/battleCharacters.js";

function sceneWith(keys) {
  const loaded = new Set(keys);
  return { textures: { exists: (key) => loaded.has(key) } };
}

describe("Warrior battle runtime contract", () => {
  it("keeps one readable six-pose sword action", () => {
    expect(WARRIOR_SWORD_ATTACK_FRAMES.map((pose) => pose.frame)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(WARRIOR_SWORD_ATTACK_FRAMES.some((pose) => !pose.front)).toBe(true);
  });

  it("authors every required battle state and holds the final KO pose", () => {
    const warrior = battleProfileFor("warrior");
    expect(Object.keys(warrior.states)).toEqual(
      BATTLE_CHARACTER_CATALOG.required_states,
    );
    expect(warrior.states.hit_reaction.frames[2]).toMatchObject({
      frame: 5,
      body: { x: 13, y: 5, angle: 7 },
    });
    expect(warrior.states.ko_defeated.hold_last_frame).toBe(true);
  });

  it("uses the equipped weapon visual instead of a baked sword", () => {
    expect(weaponTextureKey("mythril_sword")).toBe(
      "battle_weapon_mythril_sword",
    );
    const scene = sceneWith([
      WARRIOR_BATTLE_BODY_KEY,
      "battle_weapon_mythril_sword",
    ]);
    expect(
      canUseWarriorBattleSprite(scene, {
        base_sprite: "warrior",
        weapon_visual_id: "mythril_sword",
        weapon_animation_set: "sword",
      }),
    ).toBe(true);
  });

  it("keeps the approved sword body when an unauthored shield layer is equipped", () => {
    expect(offHandTextureKey("steel_shield")).toBe(
      "battle_off_hand_steel_shield",
    );
    const scene = sceneWith([
      WARRIOR_BATTLE_BODY_KEY,
      "battle_weapon_mythril_sword",
      "battle_off_hand_steel_shield",
    ]);
    expect(
      canUseWarriorBattleSprite(scene, {
        base_sprite: "warrior",
        weapon_visual_id: "mythril_sword",
        weapon_animation_set: "sword",
        shield_visual_id: "steel_shield",
        shield_animation_set: "shield",
      }),
    ).toBe(true);
  });

  it("falls back for unsupported equipment but preserves defeated Warrior identity", () => {
    const scene = sceneWith([WARRIOR_BATTLE_BODY_KEY]);
    expect(
      canUseWarriorBattleSprite(scene, {
        base_sprite: "warrior",
        weapon_animation_set: "sword",
      }),
    ).toBe(false);
    expect(
      canUseWarriorBattleSprite(
        sceneWith([WARRIOR_BATTLE_BODY_KEY, "battle_weapon_iron_sword"]),
        {
          base_sprite: "warrior",
          weapon_visual_id: "iron_sword",
          weapon_animation_set: "sword",
        },
        { alive: false },
      ),
    ).toBe(true);
  });

  it("scales body-frame pacing with the battle-speed preference", () => {
    const pose = WARRIOR_SWORD_ATTACK_FRAMES[0];
    expect(battleFrameDelay(pose, false, 0.33)).toBeCloseTo(29.7);
    expect(battleFrameDelay(pose, false, 3)).toBe(270);
    expect(battleFrameDelay(pose, true, 0.66)).toBeCloseTo(29.7);
    expect(battleFrameDelay(pose, false, 0)).toBe(90);
  });
});

describe("all-class battle state runtime contract", () => {
  it("exposes the complete method-backed state vocabulary for every identity", () => {
    for (const profile of BATTLE_CHARACTER_CATALOG.classes) {
      expect(Object.keys(profile.states), profile.id).toEqual(
        BATTLE_CHARACTER_CATALOG.required_states,
      );
      expect(profile.states.ko_defeated.hold_last_frame, profile.id).toBe(true);
      expect(
        profile.states.ko_defeated.frames.at(-1).body,
        `${profile.id}/ko_defeated`,
      ).toMatchObject({ angle: 90 });
    }
  });
});

describe("Mender battle runtime contract", () => {
  it("keeps one readable six-pose staff-cast action", () => {
    expect(MENDER_STAFF_CAST_FRAMES.map((pose) => pose.frame)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(MENDER_STAFF_CAST_FRAMES.every((pose) => !pose.front)).toBe(true);
  });

  it("uses the equipped staff visual instead of a baked staff", () => {
    const scene = sceneWith([
      MENDER_BATTLE_BODY_KEY,
      "battle_weapon_war_staff",
    ]);
    expect(
      canUseMenderBattleSprite(scene, {
        base_sprite: "mender",
        weapon_visual_id: "war_staff",
        weapon_animation_set: "staff",
      }),
    ).toBe(true);
  });

  it("falls back rather than applying Mender's body to another staff user", () => {
    const scene = sceneWith([
      MENDER_BATTLE_BODY_KEY,
      "battle_weapon_war_staff",
    ]);
    expect(
      canUseMenderBattleSprite(scene, {
        base_sprite: "cinder",
        weapon_visual_id: "war_staff",
        weapon_animation_set: "staff",
      }),
    ).toBe(false);
    expect(
      canUseMenderBattleSprite(scene, {
        base_sprite: "mender",
        weapon_visual_id: "war_staff",
        weapon_animation_set: "sword",
      }),
    ).toBe(false);
  });

  it("uses the same generic content-driven selection path as Warrior", () => {
    const scene = sceneWith([
      MENDER_BATTLE_BODY_KEY,
      "battle_weapon_war_staff",
    ]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "mender",
        weapon_visual_id: "war_staff",
        weapon_animation_set: "staff",
      }),
    ).toBe(true);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "cinder",
        weapon_visual_id: "war_staff",
        weapon_animation_set: "staff",
      }),
    ).toBe(false);
  });
});

describe("Brawler battle runtime contract", () => {
  it("uses the shared compositor without inventing a weapon attachment", () => {
    const scene = sceneWith(["battle_brawler_unarmed_strike_body"]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "brawler",
        weapon_animation_set: "unarmed",
      }),
    ).toBe(true);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "brawler",
        weapon_visual_id: "iron_sword",
        weapon_animation_set: "unarmed",
      }),
    ).toBe(false);
  });
});

describe("Rogue battle runtime contract", () => {
  it("selects the item-driven dagger attachment for the weapon-free body", () => {
    const scene = sceneWith([
      "battle_rogue_dagger_slash_body",
      "battle_weapon_shadow_blade",
    ]);
    expect(weaponTextureKey("shadow_blade")).toBe("battle_weapon_shadow_blade");
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "rogue",
        weapon_visual_id: "shadow_blade",
        weapon_animation_set: "dagger",
      }),
    ).toBe(true);
  });
});

describe("Wayfarer battle runtime contract", () => {
  it("keeps the travel body distinct while sharing equipped staff metadata", () => {
    const scene = sceneWith([
      "battle_wayfarer_staff_inspire_body",
      "battle_weapon_war_staff",
    ]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "wayfarer",
        weapon_visual_id: "war_staff",
        weapon_animation_set: "staff",
      }),
    ).toBe(true);
  });
});

describe("Knight battle runtime contract", () => {
  it("composes independent sword and shield attachments over the closed-visor body", () => {
    const scene = sceneWith([
      "battle_knight_sword_shield_defend_body",
      "battle_weapon_mythril_sword",
      "battle_off_hand_steel_shield",
    ]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "knight",
        weapon_visual_id: "mythril_sword",
        weapon_animation_set: "sword",
        shield_visual_id: "steel_shield",
        shield_animation_set: "shield",
      }),
    ).toBe(true);
  });

  it("does not present the authored Knight body without its required equipment layers", () => {
    const scene = sceneWith(["battle_knight_sword_shield_defend_body"]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "knight",
        weapon_animation_set: "sword",
        shield_animation_set: "shield",
      }),
    ).toBe(false);
  });
});

describe("Champion battle runtime contract", () => {
  it("uses a distinct promoted unarmed body with no invented attachment", () => {
    const scene = sceneWith(["battle_champion_unarmed_palm_burst_body"]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "champion",
      }),
    ).toBe(true);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "champion",
        weapon_visual_id: "iron_sword",
        weapon_animation_set: "sword",
      }),
    ).toBe(false);
  });
});

describe("Shadow battle runtime contract", () => {
  it("keeps the promoted violet body distinct while sharing dagger metadata", () => {
    const scene = sceneWith([
      "battle_shadow_dagger_veil_strike_body",
      "battle_weapon_shadow_blade",
    ]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "shadow",
        weapon_visual_id: "shadow_blade",
        weapon_animation_set: "dagger",
      }),
    ).toBe(true);
  });
});

describe("Sage battle runtime contract", () => {
  it("shares staff item metadata without sharing Mender's body", () => {
    const scene = sceneWith([
      "battle_sage_staff_sanctuary_body",
      "battle_weapon_war_staff",
    ]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "sage",
        weapon_visual_id: "war_staff",
        weapon_animation_set: "staff",
      }),
    ).toBe(true);
  });
});

describe("Pyromancer battle runtime contract", () => {
  it("uses the shared staff over a distinct faceless promoted body", () => {
    const scene = sceneWith([
      "battle_pyromancer_staff_inferno_body",
      "battle_weapon_war_staff",
    ]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "pyromancer",
        weapon_visual_id: "war_staff",
        weapon_animation_set: "staff",
      }),
    ).toBe(true);
  });
});

describe("Wanderer battle runtime contract", () => {
  it("keeps the two-tone explorer body separate from the shared staff", () => {
    const scene = sceneWith([
      "battle_wanderer_staff_waystar_body",
      "battle_weapon_war_staff",
    ]);
    expect(
      canUseBattleCharacterSprite(scene, {
        base_sprite: "wanderer",
        weapon_visual_id: "war_staff",
        weapon_animation_set: "staff",
      }),
    ).toBe(true);
  });
});

describe("starter party battle sprites", () => {
  it.each(["warrior", "brawler", "rogue", "mender", "cinder"])(
    "%s keeps its animated body with its starting equipment",
    (classID) => {
      const character = classes.find(({ id }) => id === classID);
      const weapon = items.weapons.find(
        ({ id }) => id === character.starting_loadout.main_hand,
      );
      const scene = sceneWith([
        ...battleBodyAssets().map(({ key }) => key),
        ...battleWeaponAssets().map(({ key }) => key),
      ]);
      expect(
        canUseBattleCharacterSprite(scene, {
          base_sprite: classID,
          weapon_visual_id: weapon?.visual_id,
          weapon_animation_set: weapon?.animation_set,
        }),
      ).toBe(true);
    },
  );
});
