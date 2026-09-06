import { WALK_FRAME_COUNT } from "./walkFrame.js";
// Advance the gait with distance, not a second timer racing the movement tween.
// Three tiles per six-pose cycle keeps poses readable at every walk speed.
export const WALK_CYCLE_TILES = 3;
export const WALK_IDLE_DELAY_MS = 80;

export function beginWalkStep(scene, setFrame, tileSize = 32) {
  let state = scene.walkPlayback;
  if (
    !state ||
    state.player !== scene.player ||
    state.classId !== scene.leaderClass ||
    state.direction !== scene.playerDir
  ) {
    state?.idleTimer?.remove(false);
    state = {
      player: scene.player,
      classId: scene.leaderClass,
      direction: scene.playerDir,
      phase: 0,
    };
    scene.walkPlayback = state;
  }
  state.idleTimer?.remove(false);
  state.idleTimer = null;
  const start = state.phase;
  const startX = scene.player.x;
  const startY = scene.player.y;
  const update = (progress) => {
    state.phase =
      (start + Math.max(0, Math.min(1, progress)) / WALK_CYCLE_TILES) % 1;
    setFrame(
      Math.floor(state.phase * WALK_FRAME_COUNT + 1e-9) % WALK_FRAME_COUNT,
    );
  };
  update(0);
  return {
    update,
    updatePosition() {
      // Tween.progress is updated AFTER its onUpdate callbacks in Phaser.
      // Read the position already applied to the sprite, not last tick's phase.
      update(
        Math.hypot(scene.player.x - startX, scene.player.y - startY) / tileSize,
      );
    },
    complete() {
      update(1);
      // A held key can start the next tile without flashing the idle pose.
      state.idleTimer = scene.time.delayedCall(WALK_IDLE_DELAY_MS, () => {
        if (scene.walkPlayback !== state || scene.player !== state.player)
          return;
        state.phase = 0;
        setFrame(0);
      });
    },
  };
}
