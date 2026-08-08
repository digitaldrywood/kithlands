const VALID_TARGET_MODES = new Set([
  "single_enemy",
  "all_enemies",
  "single_ally",
  "all_allies",
  "party",
]);

export function defaultSpellTargetMode(spell) {
  if (VALID_TARGET_MODES.has(spell?.target)) return spell.target;
  return (
    (spell?.target_modes || []).find((mode) => VALID_TARGET_MODES.has(mode)) ||
    ""
  );
}

export function isGroupTargetMode(mode) {
  return mode === "all_enemies" || mode === "all_allies" || mode === "party";
}

export function targetModeSide(mode) {
  return mode === "single_ally" || mode === "all_allies" || mode === "party"
    ? "party"
    : "enemy";
}
