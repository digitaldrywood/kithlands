import {
  BATTLE_CHARACTER_CATALOG,
  battleOffHandAssets,
  battleProfileFor,
  battleStateFor,
  battleWeaponAssets,
} from "../data/battleCharacters.js";
import { createComposedSprite } from "./composedSprite.js";

const weaponAssetsByVisualID = new Map(
  battleWeaponAssets().map((asset) => [asset.visual_id, asset]),
);
const offHandAssetsByVisualID = new Map(
  battleOffHandAssets().map((asset) => [asset.visual_id, asset]),
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

export function offHandTextureKey(visualID) {
  if (!visualID) return "";
  return (
    offHandAssetsByVisualID.get(visualID)?.key || `battle_off_hand_${visualID}`
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

  const attachmentCount = Object.keys(profile.attachments || {}).length;
  const attachmentLayers = [];

  if (composition?.weapon_visual_id) {
    const attachmentID = composition.weapon_animation_set || "";
    const attachment = profile.attachments?.[attachmentID] || null;
    if (!attachment) return null;
    const textureKey = weaponTextureKey(composition.weapon_visual_id);
    if (!textureKey || !scene.textures.exists(textureKey)) return null;
    attachmentLayers.push({
      channel: "weapon",
      attachmentID,
      attachment,
      textureKey,
    });
  }

  if (composition?.shield_visual_id) {
    const attachmentID = composition.shield_animation_set || "";
    const attachment = profile.attachments?.[attachmentID] || null;
    if (attachment) {
      const textureKey = offHandTextureKey(composition.shield_visual_id);
      if (!textureKey || !scene.textures.exists(textureKey)) return null;
      attachmentLayers.push({
        channel: "shield",
        attachmentID,
        attachment,
        textureKey,
      });
    }
  }

  if (attachmentCount > 0 && attachmentLayers.length === 0) {
    return null;
  }
  if (attachmentCount === 0 && composition?.weapon_visual_id) {
    return null;
  }

  return {
    profile,
    signatureState,
    attachmentLayers,
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
  if (!manifestFrame) return null;

  if (container.battleTextureKey !== state.body_key) {
    container.battleBody.setTexture(state.body_key, manifestFrame.frame);
    container.battleTextureKey = state.body_key;
  } else {
    container.battleBody.setFrame(manifestFrame.frame);
  }

  const bodyPose = {
    x: manifestFrame.body?.x || 0,
    y: manifestFrame.body?.y || 0,
    angle: manifestFrame.body?.angle || 0,
  };
  container.battleBody
    .setPosition(bodyPose.x, bodyPose.y)
    .setAngle(bodyPose.angle);
  const radians = (bodyPose.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  for (const layer of container.battleAttachmentLayers) {
    const pose =
      stateFrames(container.battleProfile, stateID, layer.attachmentID)[
        index
      ] || stateFrames(container.battleProfile, stateID, layer.attachmentID)[0];
    const attachmentX = bodyPose.x + pose.x * cos - pose.y * sin;
    const attachmentY = bodyPose.y + pose.x * sin + pose.y * cos;
    for (const image of [layer.back, layer.front]) {
      image
        .setPosition(attachmentX, attachmentY)
        .setAngle(pose.angle + bodyPose.angle);
    }
    const visible = pose.visible !== false;
    layer.back.setVisible(visible && !pose.front);
    layer.front.setVisible(visible && pose.front);
  }

  container.battleState = stateID;
  container.battleFrameIndex = manifestFrame.frame;
  return { duration: manifestFrame.duration };
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
  const attachmentLayers = definition.attachmentLayers.map((layer) => ({
    ...layer,
    back: scene.add
      .image(0, 0, layer.textureKey)
      .setOrigin(...(layer.attachment.origin || [0.5, 0.5])),
    front: scene.add
      .image(0, 0, layer.textureKey)
      .setOrigin(...(layer.attachment.origin || [0.5, 0.5])),
  }));
  const body = scene.add.sprite(
    0,
    0,
    definition.signatureState.body_key,
    definition.signatureState.frames[0].frame,
  );
  const children = [
    ...attachmentLayers.map((layer) => layer.back),
    body,
    ...attachmentLayers.map((layer) => layer.front),
  ];

  const container = scene.add.container(x, y, children);
  container.setSize(frameSize, frameSize);
  container.setScale(targetSize / frameSize);

  container.battleBody = body;
  container.battleAttachmentLayers = attachmentLayers;
  const weaponLayer = attachmentLayers.find(
    (layer) => layer.channel === "weapon",
  );
  const shieldLayer = attachmentLayers.find(
    (layer) => layer.channel === "shield",
  );
  container.battleWeaponBack = weaponLayer?.back || null;
  container.battleWeaponFront = weaponLayer?.front || null;
  container.battleShieldBack = shieldLayer?.back || null;
  container.battleShieldFront = shieldLayer?.front || null;
  container.battleTextureKey = definition.signatureState.body_key;
  container.battleProfile = definition.profile;
  container.battleStates = definition.profile.states;
  container.battleDefaultState = definition.profile.default_state;
  container.battleFrames = stateFrames(
    definition.profile,
    definition.profile.default_state,
    attachmentLayers[0]?.attachmentID || "",
  );
  container.battleAvailableStates = Object.keys(definition.profile.states);
  container.battleAnimationKind = definition.profile.default_state;
  container.weaponTextureKey = weaponLayer?.textureKey || null;
  container.shieldTextureKey = shieldLayer?.textureKey || null;
  container.attachmentID = attachmentLayers[0]?.attachmentID || "";
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
    if (token === container._battleAnimationToken && !state.hold_last_frame) {
      container.resetBattlePose();
    }
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
    for (const layer of attachmentLayers) {
      layer.back.setTint(color);
      layer.front.setTint(color);
    }
    return container;
  };
  container.clearTint = () => {
    body.clearTint();
    for (const layer of attachmentLayers) {
      layer.back.clearTint();
      layer.front.clearTint();
    }
    return container;
  };

  container.resetBattlePose();
  if (opts.alive === false) {
    const koState = container.battleStates.ko_defeated;
    if (koState) {
      applyStateFrame(container, "ko_defeated", koState.frames.length - 1);
    }
    container.setTint(0x555b66);
  }
  return container;
}
