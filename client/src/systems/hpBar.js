// Pure helpers for battle HP bar math. Kept out of battle.js so the
// arithmetic is trivially unit-testable without Phaser.
//
// Issue #69: earlier revisions reconstructed the enemy's HP from a stored
// float percentage (`maxHP * currentPct - dmg`). For HP values that don't
// divide the max HP cleanly (e.g. 3/7), the product drifts and the
// subtraction produces values like `0.9999999999999998`, which then render
// as a "1 HP" sliver on an enemy the server has already marked dead. These
// helpers work exclusively in integer HP space and clamp everywhere.

// Coerce a value to a finite integer, defaulting to 0. Used at the module
// boundary so a malformed server payload can't poison our math.
function toInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.trunc(x);
}

// Compute the new integer HP after applying damage, clamped at 0.
export function applyDamage(currentHP, dmg) {
  return Math.max(0, toInt(currentHP) - toInt(dmg));
}

// Compute the new integer HP after applying healing, clamped to maxHP.
export function applyHeal(currentHP, amount, maxHP) {
  return Math.min(toInt(maxHP), toInt(currentHP) + toInt(amount));
}

// Format an HP label as "cur/max" with integer-only values.
export function formatHPLabel(currentHP, maxHP) {
  return `${Math.max(0, toInt(currentHP))}/${toInt(maxHP)}`;
}

// Compute a bar fill width (pixels) from integer HP / max HP / total width.
// Returns an integer; a dead bar is exactly 0 pixels wide so there is no
// sub-pixel sliver left behind, but any positive HP renders at least
// 1 pixel so legitimately low-HP combatants (1/100 on a 65px bar would
// floor to 0) don't visually read as dead.
export function hpBarFillWidth(currentHP, maxHP, totalWidth) {
  const hp = toInt(currentHP);
  const max = toInt(maxHP);
  const width = toInt(totalWidth);
  if (max <= 0 || hp <= 0 || width <= 0) return 0;
  const pct = Math.min(1, hp / max);
  return Math.max(1, Math.floor(pct * width));
}

// Proportion of HP remaining, clamped to [0, 1]. Used to pick the fill
// color band. Floats are fine here — we only use the value for threshold
// comparisons, not for display width.
export function hpBarColorPct(currentHP, maxHP) {
  const hp = toInt(currentHP);
  const max = toInt(maxHP);
  if (max <= 0 || hp <= 0) return 0;
  return Math.min(1, hp / max);
}
