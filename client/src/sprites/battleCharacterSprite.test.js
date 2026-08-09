import { describe, expect, it } from "vitest";
import {
  MENDER_BATTLE_BODY_KEY,
  MENDER_STAFF_CAST_FRAMES,
  WARRIOR_BATTLE_BODY_KEY,
  WARRIOR_SWORD_ATTACK_FRAMES,
  battleFrameDelay,
  canUseBattleCharacterSprite,
  canUseMenderBattleSprite,
  canUseWarriorBattleSprite,
  weaponTextureKey,
} from "./battleCharacterSprite.js";

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
