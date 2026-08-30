function wrap(index, length) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export function createBattleAuditSelection(catalog = {}) {
  return {
    catalog,
    identityIndex: 0,
    equipmentIndex: 0,
    animationIndex: 0,
    effectIndex: 0,
    familyIndex: 0,
    intensityIndex: 0,
  };
}

export function currentBattleAuditSelection(selection) {
  const catalog = selection?.catalog || {};
  const identities = catalog.identities || [];
  const identity =
    identities[wrap(selection?.identityIndex || 0, identities.length)] || null;
  const equipment = identity?.equipment || [];
  const animationStates = catalog.animation_states || [];
  const effectModes = catalog.effect_modes || [];
  const effectFamilies = catalog.effect_families || [];
  const intensityTiers = catalog.intensity_tiers || [];
  return {
    identity,
    equipment:
      equipment[wrap(selection?.equipmentIndex || 0, equipment.length)] || null,
    animationState:
      animationStates[
        wrap(selection?.animationIndex || 0, animationStates.length)
      ] || null,
    effectMode:
      effectModes[wrap(selection?.effectIndex || 0, effectModes.length)] ||
      null,
    effectFamily:
      effectFamilies[
        wrap(selection?.familyIndex || 0, effectFamilies.length)
      ] || null,
    intensityTier:
      intensityTiers[
        wrap(selection?.intensityIndex || 0, intensityTiers.length)
      ] || null,
  };
}

export function cycleBattleAuditSelection(selection, kind, direction = 1) {
  if (!selection) return selection;
  const delta = direction < 0 ? -1 : 1;
  if (kind === "identity") {
    const count = selection.catalog?.identities?.length || 0;
    selection.identityIndex = wrap(selection.identityIndex + delta, count);
    selection.equipmentIndex = 0;
  } else if (kind === "equipment") {
    const identity = currentBattleAuditSelection(selection).identity;
    const count = identity?.equipment?.length || 0;
    selection.equipmentIndex = wrap(selection.equipmentIndex + delta, count);
  } else if (kind === "animation") {
    const count = selection.catalog?.animation_states?.length || 0;
    selection.animationIndex = wrap(selection.animationIndex + delta, count);
  } else if (kind === "effect") {
    const count = selection.catalog?.effect_modes?.length || 0;
    selection.effectIndex = wrap(selection.effectIndex + delta, count);
  } else if (kind === "family") {
    const count = selection.catalog?.effect_families?.length || 0;
    selection.familyIndex = wrap(selection.familyIndex + delta, count);
  } else if (kind === "intensity") {
    const count = selection.catalog?.intensity_tiers?.length || 0;
    selection.intensityIndex = wrap(selection.intensityIndex + delta, count);
  }
  return selection;
}
