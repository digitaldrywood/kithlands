import catalog from "../../../shared/battle_characters.json";

function cloneAttachmentPose(pose, visibility) {
  const cloned = { ...(pose || {}) };
  if (typeof visibility === "boolean") cloned.visible = visibility;
  return cloned;
}

function expandRecipeState(profile, recipeState) {
  const signature = profile.states?.[profile.default_state];
  if (!signature || !recipeState?.frames?.length) return null;

  const signatureFrames = new Map(
    signature.frames.map((frame) => [frame.frame, frame]),
  );
  return {
    body_key: signature.body_key,
    body_path: signature.body_path,
    ...(recipeState.cue_frame != null
      ? { cue_frame: recipeState.cue_frame }
      : {}),
    ...(recipeState.hold_last_frame ? { hold_last_frame: true } : {}),
    frames: recipeState.frames.map((recipeFrame) => {
      const sourceFrame = signatureFrames.get(recipeFrame.frame);
      if (!sourceFrame) {
        throw new Error(
          `Battle character ${profile.id} recipe references missing atlas frame ${recipeFrame.frame}`,
        );
      }
      return {
        frame: recipeFrame.frame,
        duration: recipeFrame.duration,
        ...(recipeFrame.body ? { body: { ...recipeFrame.body } } : {}),
        attachments: Object.fromEntries(
          Object.entries(sourceFrame.attachments || {}).map(([id, pose]) => [
            id,
            cloneAttachmentPose(pose, recipeState.attachments_visible),
          ]),
        ),
      };
    }),
  };
}

export function expandBattleCharacterCatalog(source) {
  const requiredStates = source.required_states || [];
  const recipes = source.state_recipes || {};
  return {
    ...source,
    classes: (source.classes || []).map((profile) => {
      const recipe = recipes[profile.state_recipe];
      const authoredStates = profile.states || {};
      const states = {};
      for (const stateID of requiredStates) {
        if (authoredStates[stateID]) {
          states[stateID] = authoredStates[stateID];
          continue;
        }
        const expanded = expandRecipeState(profile, recipe?.states?.[stateID]);
        if (expanded) states[stateID] = expanded;
      }
      for (const [stateID, state] of Object.entries(authoredStates)) {
        if (!states[stateID]) states[stateID] = state;
      }
      return { ...profile, states };
    }),
  };
}

export const BATTLE_CHARACTER_CATALOG = expandBattleCharacterCatalog(catalog);

const profilesByID = new Map(
  BATTLE_CHARACTER_CATALOG.classes.map((profile) => [profile.id, profile]),
);

export function battleProfileFor(id) {
  return profilesByID.get(id) || null;
}

export function battleStateFor(id, stateID) {
  return battleProfileFor(id)?.states?.[stateID] || null;
}

export function battleBodyAssets() {
  const assets = new Map();
  for (const profile of BATTLE_CHARACTER_CATALOG.classes) {
    for (const state of Object.values(profile.states || {})) {
      assets.set(state.body_key, {
        key: state.body_key,
        path: state.body_path,
        frameSize: BATTLE_CHARACTER_CATALOG.frame_size,
      });
    }
  }
  return [...assets.values()];
}

export function battleWeaponAssets() {
  return BATTLE_CHARACTER_CATALOG.weapon_assets.map((asset) => ({ ...asset }));
}

export function battleOffHandAssets() {
  return BATTLE_CHARACTER_CATALOG.off_hand_assets.map((asset) => ({
    ...asset,
  }));
}
