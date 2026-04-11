// Decides whether a click on an enemy sprite should be accepted given
// the current battle targeting state. Extracted as a pure function so
// battle.js's Phaser-bound handlers stay unit-testable — see
// battleTargeting.test.js for the full truth table pinning issue #85.
//
// Rules:
//   - enemy mode: always accept (attack, damage spell, ability, etc.)
//   - party mode + heal spell + undead enemy: accept (FF1 canon — the
//     server's resolveHealSpell damages the undead for the heal amount)
//   - everything else in party mode is rejected, so clicks bleed-through
//     from the old PR #70 bug no longer exit party mode and miscast
//     Cure/Bless/Cure Poison on the wrong target.
export function shouldAcceptEnemySpriteClick(
  targetingMode,
  pendingSpellEffect,
  enemyIsUndead,
) {
  if (targetingMode === "enemy") return true;
  if (
    targetingMode === "party" &&
    pendingSpellEffect === "heal" &&
    enemyIsUndead === true
  ) {
    return true;
  }
  return false;
}
