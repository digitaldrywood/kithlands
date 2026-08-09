import {
  BATTLE_CHARACTER_CATALOG,
  battleProfileFor,
  battleStateFor,
  battleWeaponAssets,
} from "../data/battleCharacters.js";
import { createComposedSprite } from "./composedSprite.js";

const weaponAssetsByVisualID = new Map(
  battleWeaponAssets().map((asset) => [asset.visual_id, asset]),
);

const STATE_METHODS = {
  physical_attack: "playBattleAttack",
  cast_class_ability: "playBattleCast",
  defend: "playBattleDefend",
  hit_reaction: "playBattleHitReaction",
  item_use: "playBattleItemUse",
  victory: "playBattleVictory",
  ko_defeated: "playBattleKO",
};

export function weaponTextureKey(visualID) {
  if (!visualID) return "";
  return (
    weaponAssetsByVisualID.get(visualID)?.key || `battle_weapon_${visualID}`
  );
}

function stateFrames(profile, stateID, attachmentID) {
  const state = profile?.states?.[stateID];
  if (!state) return [];
  return state.frames.map((frame) => ({
    frame: frame.frame,
    duration: frame.duration,
    ...(frame.attachments?.[attachmentID] || {
      x: 0,
      y: 0,
      angle: 0,
      front: false,
    }),
  }));
}

export const WARRIOR_BATTLE_BODY_KEY = battleStateFor(
  "warrior",
  "physical_attack",
).body_key;
export const WARRIOR_BATTLE_FRAME_SIZE = BATTLE_CHARACTER_CATALOG.frame_size;
export const WARRIOR_SWORD_ATTACK_FRAMES = stateFrames(
  battleProfileFor("warrior"),
  "physical_attack",
  "sword",
);
export const MENDER_BATTLE_BODY_KEY = battleStateFor(
  "mender",
  "cast_class_ability",
).body_key;
export const MENDER_BATTLE_FRAME_SIZE = BATTLE_CHARACTER_CATALOG.frame_size;
export const MENDER_STAFF_CAST_FRAMES = stateFrames(
  battleProfileFor("mender"),
  "cast_class_ability",
  "staff",
);

function runtimeDefinition(scene, composition) {
  const profile = battleProfileFor(composition?.base_sprite);
  const signatureState = profile?.states?.[profile?.default_state];
  if (!profile || !signatureState) return null;
  if (!scene.textures.exists(signatureState.body_key)) return null;

  const attachmentID = composition?.weapon_animation_set || "";
  const attachment = profile.attachments?.[attachmentID] || null;
  const attachmentCount = Object.keys(profile.attachments || {}).length;
  let weaponKey = "";
  if (attachmentCount > 0) {
    if (!attachment || !composition?.weapon_visual_id) return null;
    weaponKey = weaponTextureKey(composition.weapon_visual_id);
    if (!weaponKey || !scene.textures.exists(weaponKey)) return null;
  } else if (composition?.weapon_visual_id) {
    return null;
  }

  return {
    profile,
    signatureState,
    attachmentID,
    attachment,
    weaponKey,
  };
}

export function canUseBattleCharacterSprite(scene, composition) {
  return runtimeDefinition(scene, composition) !== null;
}

export function canUseWarriorBattleSprite(scene, composition) {
  return (
    composition?.base_sprite === "warrior" &&
    canUseBattleCharacterSprite(scene, composition)
  );
}

export function canUseMenderBattleSprite(scene, composition) {
  return (
    composition?.base_sprite === "mender" &&
    canUseBattleCharacterSprite(scene, composition)
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

function waitForScene(scene, ms) {
  return new Promise((resolve) =>
    scene.time.delayedCall(Math.max(0, ms), resolve),
  );
}

function frameIndices(frameCount, reducedMotion) {
  if (!reducedMotion || frameCount <= 3) {
    return Array.from({ length: frameCount }, (_, index) => index);
  }
  return [...new Set([1, Math.floor(frameCount / 2), frameCount - 1])].filter(
    (index) => index >= 0 && index < frameCount,
  );
}

function applyStateFrame(container, stateID, index) {
  const state = container.battleStates[stateID];
  if (!state) return null;
  const manifestFrame = state.frames[index] || state.frames[0];
  const pose =
    stateFrames(container.battleProfile, stateID, container.attachmentID)[
      index
    ] ||
    stateFrames(container.battleProfile, stateID, container.attachmentID)[0];
  if (!manifestFrame || !pose) return null;

  if (container.battleTextureKey !== state.body_key) {
    container.battleBody.setTexture(state.body_key, manifestFrame.frame);
    container.battleTextureKey = state.body_key;
  } else {
    container.battleBody.setFrame(manifestFrame.frame);
  }

  if (container.battleWeaponBack && container.battleWeaponFront) {
    for (const weapon of [
      container.battleWeaponBack,
      container.battleWeaponFront,
    ]) {
      weapon.setPosition(pose.x, pose.y).setAngle(pose.angle);
    }
    container.battleWeaponBack.setVisible(!pose.front);
    container.battleWeaponFront.setVisible(pose.front);
  }

  container.battleState = stateID;
  container.battleFrameIndex = manifestFrame.frame;
  return pose;
}

export function createBattleCharacterSprite(
  scene,
  x,
  y,
  composition,
  opts = {},
) {
  const definition = runtimeDefinition(scene, composition);
  if (!definition) {
    return createComposedSprite(scene, x, y, composition, opts);
  }

  const frameSize = BATTLE_CHARACTER_CATALOG.frame_size;
  const targetSize = opts.targetSize || 100;
  const origin = definition.attachment?.origin || [0.5, 0.5];
  const children = [];
  let weaponBack = null;
  let weaponFront = null;
  if (definition.weaponKey) {
    weaponBack = scene.add
      .image(0, 0, definition.weaponKey)
      .setOrigin(...origin);
    children.push(weaponBack);
  }
  const body = scene.add.sprite(
    0,
    0,
    definition.signatureState.body_key,
    definition.signatureState.frames[0].frame,
  );
  children.push(body);
  if (definition.weaponKey) {
    weaponFront = scene.add
      .image(0, 0, definition.weaponKey)
      .setOrigin(...origin);
    children.push(weaponFront);
  }

  const container = scene.add.container(x, y, children);
  container.setSize(frameSize, frameSize);
  container.setScale(targetSize / frameSize);

  container.battleBody = body;
  container.battleWeaponBack = weaponBack;
  container.battleWeaponFront = weaponFront;
  container.battleTextureKey = definition.signatureState.body_key;
  container.battleProfile = definition.profile;
  container.battleStates = definition.profile.states;
  container.battleDefaultState = definition.profile.default_state;
  container.battleFrames = stateFrames(
    definition.profile,
    definition.profile.default_state,
    definition.attachmentID,
  );
  container.battleAvailableStates = Object.keys(definition.profile.states);
  container.battleAnimationKind = definition.profile.default_state;
  container.weaponTextureKey = definition.weaponKey || null;
  container.attachmentID = definition.attachmentID;
  container.isBattleCharacter = true;
  container._battleAnimationToken = 0;

  container.applyBattleFrame = (
    index,
    stateID = container.battleDefaultState,
  ) => applyStateFrame(container, stateID, index);
  container.resetBattlePose = () => {
    container._battleAnimationToken += 1;
    const resetState = container.battleStates.idle_guard
      ? "idle_guard"
      : container.battleDefaultState;
    applyStateFrame(container, resetState, 0);
    return container;
  };
  container.playBattleState = async (
    stateID,
    { reducedMotion = false, speedMultiplier = 1 } = {},
  ) => {
    const state = container.battleStates[stateID];
    if (!state) return false;
    const token = ++container._battleAnimationToken;
    for (const index of frameIndices(state.frames.length, reducedMotion)) {
      if (token !== container._battleAnimationToken) return false;
      const pose = applyStateFrame(container, stateID, index);
      await waitForScene(
        scene,
        battleFrameDelay(pose, reducedMotion, speedMultiplier),
      );
    }
    if (token === container._battleAnimationToken) container.resetBattlePose();
    return true;
  };

  for (const [stateID, method] of Object.entries(STATE_METHODS)) {
    if (container.battleStates[stateID]) {
      container[method] = (options = {}) =>
        container.playBattleState(stateID, options);
    }
  }

  container.setTint = (color) => {
    body.setTint(color);
    weaponBack?.setTint(color);
    weaponFront?.setTint(color);
    return container;
  };
  container.clearTint = () => {
    body.clearTint();
    weaponBack?.clearTint();
    weaponFront?.clearTint();
    return container;
  };

  container.resetBattlePose();
  if (opts.alive === false) container.setTint(0x444444);
  return container;
}
