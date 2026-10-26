// Own the hand-off between authored body poses and scene effects. The scene
// displays the server result at the cue, then resumes follow-through/recovery.
export function physicalHitPresentations(action, damage, defeated) {
  const hits = action.hits?.length
    ? action.hits
    : [{ damage, crit: action.crit, missed: action.missed }];
  return hits.map((hit, index) => ({
    damage: hit.damage,
    crit: !!hit.crit,
    missed: !!hit.missed,
    defeated: !!defeated && index === hits.length - 1,
  }));
}

export function physicalAttackState(sprite, critical) {
  return critical && sprite?.battleStates?.critical_attack
    ? "critical_attack"
    : "physical_attack";
}

export function physicalContactFamily(sprite, critical = false) {
  return sprite?.battleStates?.[physicalAttackState(sprite, critical)]
    ?.contact_family === "blunt"
    ? "blunt"
    : "slash";
}

export function beginBattleAction(sprite, stateID, options = {}) {
  let release, releaseRecovery, signalCue;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const cue = new Promise((resolve) => {
    signalCue = resolve;
  });
  const recovery = new Promise((resolve) => {
    releaseRecovery = resolve;
  });
  const finished = sprite
    .playBattleState(stateID, {
      ...options,
      onFrame: async (frame) => {
        const lastIndex = sprite.battleStates?.[stateID]?.frames.length - 1;
        if (options.holdRecovery && frame.index === lastIndex) await recovery;
        return options.onFrame?.(frame);
      },
      onCue: async () => {
        signalCue(true);
        await gate;
      },
    })
    .finally(() => signalCue(false));
  return {
    cue,
    finished,
    followThrough: () => release(),
    resume: () => {
      release();
      releaseRecovery();
    },
  };
}

// New authored item states can reveal the result at a cue. Legacy states
// without a cue keep their existing completion timing. Never reveal twice.
export async function playItemPresentation(sprite, options, present) {
  let presented = false;
  const presentOnce = () => {
    if (presented) return;
    presented = true;
    return present();
  };
  await sprite?.playBattleItemUse?.({ ...options, onCue: presentOnce });
  presentOnce();
}
