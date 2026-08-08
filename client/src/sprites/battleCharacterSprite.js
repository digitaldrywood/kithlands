import { createComposedSprite } from "./composedSprite.js";

export const WARRIOR_BATTLE_BODY_KEY = "battle_warrior_sword_attack_body";
export const WARRIOR_BATTLE_FRAME_SIZE = 192;

// Socket positions are local to a bottom-center anchored 192px body frame.
// Two weapon images let an action move the same equipment behind or in front
// of the body without baking that equipment into every pose.
export const WARRIOR_SWORD_ATTACK_FRAMES = [
  { frame: 0, x: -48, y: -7, angle: -135, front: true, duration: 90 },
  { frame: 1, x: 31, y: -7, angle: 55, front: false, duration: 80 },
  { frame: 2, x: 0, y: -57, angle: -18, front: true, duration: 85 },
  { frame: 3, x: -49, y: -13, angle: -90, front: true, duration: 95 },
  { frame: 4, x: -48, y: 2, angle: -132, front: true, duration: 105 },
  { frame: 5, x: -38, y: 1, angle: -52, front: true, duration: 90 },
];

export function weaponTextureKey(visualID) {
  return visualID ? `battle_weapon_${visualID}` : "";
}

export function canUseWarriorBattleSprite(scene, composition, opts = {}) {
  if (composition?.base_sprite !== "warrior") return false;
  if (composition?.weapon_animation_set !== "sword") return false;
  const weaponKey = weaponTextureKey(composition?.weapon_visual_id);
  return (
    !!weaponKey &&
    scene.textures.exists(WARRIOR_BATTLE_BODY_KEY) &&
    scene.textures.exists(weaponKey)
  );
}

export function battleFrameDelay(
  pose,
  reducedMotion = false,
  speedMultiplier = 1,
) {
  const multiplier =
    Number.isFinite(speedMultiplier) && speedMultiplier > 0
      ? speedMultiplier
      : 1;
  return (reducedMotion ? 45 : pose.duration) * multiplier;
}

function applyFrame(container, index) {
  const pose =
    WARRIOR_SWORD_ATTACK_FRAMES[index] || WARRIOR_SWORD_ATTACK_FRAMES[0];
  container.battleBody.setFrame(pose.frame);
  for (const weapon of [
    container.battleWeaponBack,
    container.battleWeaponFront,
  ]) {
    weapon.setPosition(pose.x, pose.y).setAngle(pose.angle);
  }
  container.battleWeaponBack.setVisible(!pose.front);
  container.battleWeaponFront.setVisible(pose.front);
  container.battleFrameIndex = pose.frame;
  return pose;
}

function waitForScene(scene, ms) {
  return new Promise((resolve) =>
    scene.time.delayedCall(Math.max(0, ms), resolve),
  );
}

export function createBattleCharacterSprite(
  scene,
  x,
  y,
  composition,
  opts = {},
) {
  if (!canUseWarriorBattleSprite(scene, composition, opts)) {
    return createComposedSprite(scene, x, y, composition, opts);
  }

  const targetSize = opts.targetSize || 100;
  const weaponKey = weaponTextureKey(composition.weapon_visual_id);
  const weaponBack = scene.add.image(0, 0, weaponKey).setOrigin(0.5, 0.92);
  const body = scene.add.sprite(0, 0, WARRIOR_BATTLE_BODY_KEY, 0);
  const weaponFront = scene.add.image(0, 0, weaponKey).setOrigin(0.5, 0.92);
  const container = scene.add.container(x, y, [weaponBack, body, weaponFront]);
  container.setSize(WARRIOR_BATTLE_FRAME_SIZE, WARRIOR_BATTLE_FRAME_SIZE);
  container.setScale(targetSize / WARRIOR_BATTLE_FRAME_SIZE);

  container.battleBody = body;
  container.battleWeaponBack = weaponBack;
  container.battleWeaponFront = weaponFront;
  container.battleTextureKey = WARRIOR_BATTLE_BODY_KEY;
  container.weaponTextureKey = weaponKey;
  container.isBattleCharacter = true;
  container._battleAnimationToken = 0;

  container.applyBattleFrame = (index) => applyFrame(container, index);
  container.resetBattlePose = () => {
    container._battleAnimationToken += 1;
    applyFrame(container, 0);
    return container;
  };
  container.playBattleAttack = async ({
    reducedMotion = false,
    speedMultiplier = 1,
  } = {}) => {
    const token = ++container._battleAnimationToken;
    const indices = reducedMotion ? [1, 3, 5] : [0, 1, 2, 3, 4, 5];
    for (const index of indices) {
      if (token !== container._battleAnimationToken) return;
      const pose = applyFrame(container, index);
      await waitForScene(
        scene,
        battleFrameDelay(pose, reducedMotion, speedMultiplier),
      );
    }
    if (token === container._battleAnimationToken) applyFrame(container, 0);
  };

  container.setTint = (color) => {
    body.setTint(color);
    weaponBack.setTint(color);
    weaponFront.setTint(color);
    return container;
  };
  container.clearTint = () => {
    body.clearTint();
    weaponBack.clearTint();
    weaponFront.clearTint();
    return container;
  };

  applyFrame(container, 0);
  if (opts.alive === false) container.setTint(0x444444);
  return container;
}
