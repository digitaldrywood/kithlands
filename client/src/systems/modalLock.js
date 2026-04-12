// Reference-counted modal lock for the World scene. Every overlay that
// opens on top of the overworld calls pauseWorldFor on entry and
// resumeWorldFor on exit, so a single signal (isWorldInputLocked) tells
// input.js and world.js whether the player should be frozen.
//
// Why: pre-#133, each overlay maintained its own ad-hoc boolean flag
// (menuOpen, codexOpen, animating), and overlays that forgot to set one
// leaked pointer / keyboard input through to the player — clicking a
// character-detail button moved the player one tile under the modal.
//
// State lives on the scene (scene._modalLocks) so Battle and World track
// locks independently and a scene restart starts clean.

function locks(scene) {
  if (!scene._modalLocks) scene._modalLocks = new Set();
  return scene._modalLocks;
}

export function pauseWorldFor(scene, name) {
  const set = locks(scene);
  if (set.has(name)) {
    // Idempotent: re-opening the same modal without a matching resume
    // is almost always a caller bug, but we keep the set unchanged so
    // one resume still unlocks it.
    console.warn(`[modalLock] pauseWorldFor("${name}") called twice`);
    return;
  }
  set.add(name);
}

export function resumeWorldFor(scene, name) {
  const set = scene._modalLocks;
  if (!set || !set.has(name)) {
    console.warn(`[modalLock] resumeWorldFor("${name}") with no active lock`);
    return;
  }
  set.delete(name);
}

export function isWorldInputLocked(scene) {
  if (scene._modalLocks && scene._modalLocks.size > 0) return true;
  if (scene.gameOver || scene.animating) return true;
  return false;
}
