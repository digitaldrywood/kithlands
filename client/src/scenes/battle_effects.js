const INTENSITY_TIERS = Object.freeze({
  1: Object.freeze({ scale: 0.82, particleCount: 4, strokeWidth: 2 }),
  2: Object.freeze({ scale: 1, particleCount: 6, strokeWidth: 3 }),
  3: Object.freeze({ scale: 1.18, particleCount: 8, strokeWidth: 4 }),
});

const EFFECT_FAMILIES = Object.freeze({
  restorative_light: Object.freeze({
    motion: "field",
    core: 0xb9ffe8,
    glow: 0xe8c86d,
    accent: 0xffffff,
    soundHook: "sfx_heal",
  }),
  fire: Object.freeze({
    motion: "projectile",
    core: 0xff7438,
    glow: 0xa51f12,
    accent: 0xffdc78,
    soundHook: "sfx_fire",
  }),
});

export function battleEffectPresentation(action = {}) {
  const metadata = action.presentation;
  const effectFamily = String(metadata?.effect_family || "");
  const family = EFFECT_FAMILIES[effectFamily];
  if (!family) return null;
  const intensityTier = Number(metadata?.intensity_tier) || 1;
  const tier = INTENSITY_TIERS[intensityTier] || INTENSITY_TIERS[1];
  return { effectFamily, intensityTier, ...family, ...tier };
}

export function battleEffectMotion(presentation, reducedMotion = false) {
  if (!presentation) return null;
  return {
    particleCount: reducedMotion
      ? Math.min(2, presentation.particleCount)
      : presentation.particleCount,
    travelScale: reducedMotion ? 0 : presentation.scale,
    pulseScale: reducedMotion ? 1 : presentation.scale,
  };
}

function tagEffect(object, presentation, stage, legacyTag) {
  object._combatFxTag = legacyTag;
  object._battleEffectFamily = presentation.effectFamily;
  object._battleEffectStage = stage;
  object._battleEffectTier = presentation.intensityTier;
  return object;
}

export function playBattleEffectRelease(scene, actor, presentation) {
  if (!presentation || presentation.motion !== "field" || !actor) return null;
  const reducedMotion = scene.reducedBattleMotion();
  const y = actor.y + actor.height * 0.34;
  const release = tagEffect(
    scene.add.graphics().setDepth(18).setPosition(actor.x, y).setAlpha(0),
    presentation,
    "release",
    "effect-release",
  );
  release.lineStyle(presentation.strokeWidth, presentation.glow, 0.78);
  release.strokeEllipse(0, 0, actor.width * 0.9, 18);
  release.lineStyle(2, presentation.core, 0.82);
  release.strokeEllipse(0, 0, actor.width * 0.54, 10);
  release.lineBetween(-9, 0, 9, 0);
  release.lineBetween(0, -5, 0, 5);
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: release,
      alpha: 0.82,
      scaleX: presentation.scale,
      scaleY: reducedMotion ? 1 : presentation.scale,
      duration: scene.scaledMs(reducedMotion ? 80 : 150),
      yoyo: true,
      hold: scene.scaledMs(80),
      onYoyo: resolve,
      onComplete: () => release.destroy(),
    });
  });
}

export function playBattleEffectToTarget(scene, target, presentation) {
  if (!presentation || presentation.motion !== "field" || !target) return null;
  const reducedMotion = scene.reducedBattleMotion();
  const motion = battleEffectMotion(presentation, reducedMotion);
  const y = target.y + target.height * 0.36;
  const field = tagEffect(
    scene.add.graphics().setDepth(18).setPosition(target.x, y).setAlpha(0),
    presentation,
    "field",
    "spell-projectile",
  );
  const radius = Math.max(24, target.width * 0.46) * presentation.scale;
  field.lineStyle(presentation.strokeWidth, presentation.glow, 0.72);
  field.strokeEllipse(0, 0, radius * 2, 20 * presentation.scale);
  field.lineStyle(2, presentation.core, 0.88);
  for (let index = 0; index < 4; index++) {
    const x = (index - 1.5) * (radius / 2.2);
    field.lineBetween(x - 4, 0, x, -4);
    field.lineBetween(x, -4, x + 4, 0);
    field.lineBetween(x + 4, 0, x, 4);
    field.lineBetween(x, 4, x - 4, 0);
  }

  return new Promise((resolve) => {
    scene.tweens.add({
      targets: field,
      alpha: 0.9,
      scaleX: motion.pulseScale,
      scaleY: reducedMotion ? 1 : motion.pulseScale,
      duration: scene.scaledMs(reducedMotion ? 90 : 190),
      ease: "Sine.Out",
      onComplete: () => {
        field._battleEffectStage = "impact";
        field._combatFxTag = "spell-impact";
        field.clear();
        field.lineStyle(presentation.strokeWidth, presentation.core, 0.82);
        field.strokeEllipse(0, 0, radius * 1.7, 24);
        field.lineStyle(2, presentation.accent, 0.72);
        field.lineBetween(-radius, -4, -radius * 0.72, -34);
        field.lineBetween(radius, -4, radius * 0.72, -34);
        field.lineBetween(-8, -20, 8, -20);
        field.lineBetween(0, -28, 0, -12);
        scene.tweens.add({
          targets: field,
          alpha: 0,
          y: y - (reducedMotion ? 0 : 18),
          duration: scene.scaledMs(reducedMotion ? 120 : 260),
          ease: "Sine.Out",
          onComplete: () => {
            field.destroy();
            resolve();
          },
        });
      },
    });
  });
}
