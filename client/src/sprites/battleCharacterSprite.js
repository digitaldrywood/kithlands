import { createComposedSprite } from "./composedSprite.js";

export const WARRIOR_BATTLE_BODY_KEY = "battle_warrior_sword_attack_body";
export const WARRIOR_BATTLE_FRAME_SIZE = 192;
export const MENDER_BATTLE_BODY_KEY = "battle_mender_staff_cast_body";
export const MENDER_BATTLE_FRAME_SIZE = 192;

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

// Mender keeps the same anatomical staff hand throughout the cast. The staff
// rises from the chest to the hood while the other hand releases the heal.
// All staff poses sit behind the body so the authored glove remains the grip.
export const MENDER_STAFF_CAST_FRAMES = [
  { frame: 0, x: 16, y: -20, angle: 8, front: false, duration: 120 },
  { frame: 1, x: 27, y: -47, angle: 12, front: false, duration: 110 },
  { frame: 2, x: 10, y: -21, angle: 5, front: false, duration: 130 },
  { frame: 3, x: 30, y: -47, angle: 10, front: false, duration: 150 },
  { frame: 4, x: 26, y: -45, angle: 8, front: false, duration: 170 },
  { frame: 5, x: 12, y: -19, angle: 8, front: false, duration: 110 },
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

export function canUseMenderBattleSprite(scene, composition, opts = {}) {
  if (composition?.base_sprite !== "mender") return false;
  if (composition?.weapon_animation_set !== "staff") return false;
  const weaponKey = weaponTextureKey(composition?.weapon_visual_id);
  return (
    !!weaponKey &&
    scene.textures.exists(MENDER_BATTLE_BODY_KEY) &&
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
  const pose = container.battleFrames[index] || container.battleFrames[0];
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
  let definition = null;
  if (canUseWarriorBattleSprite(scene, composition, opts)) {
    definition = {
      bodyKey: WARRIOR_BATTLE_BODY_KEY,
      frameSize: WARRIOR_BATTLE_FRAME_SIZE,
      frames: WARRIOR_SWORD_ATTACK_FRAMES,
      weaponOrigin: [0.5, 0.92],
      actionMethod: "playBattleAttack",
      animationKind: "physical_attack",
    };
  } else if (canUseMenderBattleSprite(scene, composition, opts)) {
    definition = {
      bodyKey: MENDER_BATTLE_BODY_KEY,
      frameSize: MENDER_BATTLE_FRAME_SIZE,
      frames: MENDER_STAFF_CAST_FRAMES,
      weaponOrigin: [0.5, 0.48],
      actionMethod: "playBattleCast",
      animationKind: "cast_class_ability",
    };
  }
  if (!definition) {
    return createComposedSprite(scene, x, y, composition, opts);
  }

  const targetSize = opts.targetSize || 100;
  const weaponKey = weaponTextureKey(composition.weapon_visual_id);
  const weaponBack = scene.add
    .image(0, 0, weaponKey)
    .setOrigin(...definition.weaponOrigin);
  const body = scene.add.sprite(0, 0, definition.bodyKey, 0);
  const weaponFront = scene.add
    .image(0, 0, weaponKey)
    .setOrigin(...definition.weaponOrigin);
  const container = scene.add.container(x, y, [weaponBack, body, weaponFront]);
  container.setSize(definition.frameSize, definition.frameSize);
  container.setScale(targetSize / definition.frameSize);

  container.battleBody = body;
  container.battleWeaponBack = weaponBack;
  container.battleWeaponFront = weaponFront;
  container.battleTextureKey = definition.bodyKey;
  container.battleFrames = definition.frames;
  container.battleAnimationKind = definition.animationKind;
  container.weaponTextureKey = weaponKey;
  container.isBattleCharacter = true;
  container._battleAnimationToken = 0;

  container.applyBattleFrame = (index) => applyFrame(container, index);
  container.resetBattlePose = () => {
    container._battleAnimationToken += 1;
    applyFrame(container, 0);
    return container;
  };
  const playBattleSequence = async ({
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
  container[definition.actionMethod] = playBattleSequence;

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
