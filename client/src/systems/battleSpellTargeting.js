const VALID_TARGET_MODES = new Set([
  "single_enemy",
  "all_enemies",
  "single_ally",
  "all_allies",
  "party",
]);

export function spellTargetModes(spell) {
  const declared = Array.isArray(spell?.target_modes)
    ? spell.target_modes.filter((mode) => VALID_TARGET_MODES.has(mode))
    : [];
  const modes = declared.length > 0 ? declared : [spell?.target];
  return [...new Set(modes.filter((mode) => VALID_TARGET_MODES.has(mode)))];
}

export function isGroupTargetMode(mode) {
  return mode === "all_enemies" || mode === "all_allies" || mode === "party";
}

export function targetModeSide(mode) {
  return mode === "single_ally" || mode === "all_allies" || mode === "party"
    ? "party"
    : "enemy";
}

export function targetModeLabel(mode) {
  return (
    {
      single_enemy: "ONE ENEMY",
      all_enemies: "ALL ENEMIES",
      single_ally: "ONE ALLY",
      all_allies: "ALL ALLIES",
      party: "WHOLE PARTY",
    }[mode] || "TARGET"
  );
}

export function spellTargetBadge(spell) {
  const modes = spellTargetModes(spell);
  if (modes.length > 1) return modes.map(targetModeLabel).join(" / ");
  return targetModeLabel(modes[0]);
}
