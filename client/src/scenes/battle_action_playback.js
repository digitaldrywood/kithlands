// Own the hand-off between authored body poses and scene effects. The scene
// displays the server result at the cue, then resumes follow-through/recovery.
export function beginBattleAction(sprite, stateID, options = {}) {
  let release, signalCue;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const cue = new Promise((resolve) => {
    signalCue = resolve;
  });
  const finished = sprite
    .playBattleState(stateID, {
      ...options,
      onCue: async () => {
        signalCue(true);
        await gate;
      },
    })
    .finally(() => signalCue(false));
  return { cue, finished, resume: () => release() };
}
