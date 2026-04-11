// shouldStartBattle is the single source of truth for whether an
// encounter-action response should actually transition the world scene
// into the Battle scene. Kept as a pure function so world.js can defer
// playing the encounter flash/SFX until after the server confirms a
// non-empty combat encounter — see issue #114 for the orphan-flash bug
// this prevents.
export function shouldStartBattle(result) {
  return !!(
    result &&
    result.phase === "combat" &&
    Array.isArray(result.enemies) &&
    result.enemies.length > 0
  );
}
