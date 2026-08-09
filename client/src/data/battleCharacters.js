import catalog from "../../../shared/battle_characters.json";

export const BATTLE_CHARACTER_CATALOG = catalog;

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
