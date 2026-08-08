import { describe, expect, it } from "vitest";
import {
  WARRIOR_BATTLE_BODY_KEY,
  WARRIOR_SWORD_ATTACK_FRAMES,
  canUseWarriorBattleCandidate,
  weaponTextureKey,
} from "./battleCharacterSprite.js";

function sceneWith(keys) {
  const loaded = new Set(keys);
  return { textures: { exists: (key) => loaded.has(key) } };
}

describe("Warrior battle candidate contract", () => {
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
      canUseWarriorBattleCandidate(
        scene,
        {
          base_sprite: "warrior",
          weapon_visual_id: "mythril_sword",
          weapon_animation_set: "sword",
        },
        { enableBattleCandidate: true },
      ),
    ).toBe(true);
  });

  it("falls back outside the preview and for unsupported equipment", () => {
    const scene = sceneWith([WARRIOR_BATTLE_BODY_KEY]);
    expect(
      canUseWarriorBattleCandidate(
        scene,
        { base_sprite: "warrior", weapon_animation_set: "sword" },
        { enableBattleCandidate: false },
      ),
    ).toBe(false);
  });
});
