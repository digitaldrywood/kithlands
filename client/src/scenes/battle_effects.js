import { playIceRelease, playIceToTarget } from "./battle_ice_fx.js";
import { drawFirebolt, fireContactDetails } from "./battle_contact_fx.js";
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
  ice: Object.freeze({
    motion: "projectile",
    core: 0xb7ecff,
    glow: 0x426baf,
    accent: 0xffffff,
    soundHook: "sfx_ice",
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
  if (!presentation || !actor) return null;
  scene.continueCastMotion?.(actor);
  const origin = battleCastOrigin(actor);
  const reducedMotion = scene.reducedBattleMotion();
  if (presentation.effectFamily === "ice")
    return playIceRelease(scene, origin, presentation);
  if (presentation.motion === "projectile") {
    const direction = actor.x > 400 ? -1 : 1;
    const release = tagEffect(
      scene.add
        .graphics()
        .setDepth(19)
        .setPosition(origin.x, origin.y)
        .setAlpha(0),
      presentation,
      "release",
      "effect-release",
    );
    release.fillStyle(presentation.glow, 0.54);
    release.fillTriangle(-direction * 16, -9, -direction * 16, 9, 0, 0);
    release.fillStyle(presentation.core, 0.9);
    release.fillCircle(0, 0, 7);
    release.lineStyle(2, presentation.accent, 0.72);
    release.lineBetween(0, -8, direction * 10, 0);
    release.lineBetween(direction * 10, 0, 0, 8);
    return new Promise((resolve) => {
      scene.tweens.add({
        targets: release,
        alpha: 0.9,
        x: release.x + direction * (reducedMotion ? 0 : 12),
        duration: scene.scaledMs(reducedMotion ? 80 : 140),
        yoyo: true,
        onYoyo: resolve,
        onComplete: () => release.destroy(),
      });
    });
  }
  if (presentation.motion !== "field") return null;
  const y = actor.feetY ?? actor.y + actor.height * 0.34;
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

export function playBattleEffectToTarget(scene, actor, target, presentation) {
  if (!presentation || !target) return null;
  const reducedMotion = scene.reducedBattleMotion();
  if (presentation.effectFamily === "ice") {
    if (!actor) return null;
    scene.continueCastMotion?.(actor);
    return playIceToTarget(
      scene,
      battleCastOrigin(actor),
      target,
      presentation,
    );
  }
  const motion = battleEffectMotion(presentation, reducedMotion);
  if (presentation.motion === "projectile") {
    if (!actor) return null;
    const origin = battleCastOrigin(actor);
    scene.continueCastMotion?.(actor);
    const destinationY = target.y + target.height * 0.2;
    const projectile = tagEffect(
      scene.add
        .container(
          reducedMotion ? target.x : origin.x,
          reducedMotion ? destinationY : origin.y,
        )
        .setDepth(20),
      presentation,
      "travel",
      "spell-projectile",
    );
    const flame = scene.add.graphics();
    drawFirebolt(flame, presentation, presentation.scale);
    projectile.add(flame);
    projectile.setRotation(
      Math.atan2(destinationY - origin.y, target.x - origin.x),
    );
    const duration = reducedMotion ? 90 : 230 + presentation.intensityTier * 35;
    let lastEmber = -1;
    return new Promise((resolve) => {
      scene.tweens.add({
        targets: projectile,
        x: target.x,
        y: destinationY,
        alpha: reducedMotion ? 0 : 1,
        duration: scene.scaledMs(duration),
        ease: "Sine.In",
        onUpdate: (tween) => {
          if (reducedMotion) return;
          const step = Math.floor(tween.progress * 7);
          flame.setScale(1, 1 + Math.sin(tween.progress * Math.PI * 8) * 0.08);
          if (step === lastEmber) return;
          lastEmber = step;
          const ember = scene.add
            .graphics()
            .setDepth(19)
            .setPosition(projectile.x, projectile.y);
          ember._combatFxTag = "fire-trail";
          ember.fillStyle(presentation.core, 0.6);
          ember.fillCircle(0, 0, 3 + (step % 2));
          scene.tweens.add({
            targets: ember,
            alpha: 0,
            scaleX: 0.2,
            scaleY: 0.2,
            y: ember.y - 10,
            duration: scene.scaledMs(180),
            onComplete: () => ember.destroy(),
          });
        },
        onComplete: () => {
          projectile.destroy();
          const impact = tagEffect(
            scene.add
              .graphics()
              .setDepth(21)
              .setPosition(target.x, destinationY),
            presentation,
            "impact",
            "spell-impact",
          );
          const radius = Math.max(22, target.width * 0.38) * presentation.scale;
          impact.lineStyle(presentation.strokeWidth, presentation.glow, 0.76);
          impact.strokeCircle(0, 8, radius);
          impact.fillStyle(presentation.core, 0.62);
          impact.fillTriangle(
            -radius,
            18,
            -radius * 0.55,
            -18,
            -radius * 0.1,
            18,
          );
          impact.fillTriangle(radius * 0.1, 18, radius * 0.55, -24, radius, 18);
          impact.lineStyle(2, presentation.accent, 0.72);
          impact.lineBetween(-radius * 0.45, 8, 0, -radius * 0.65);
          impact.lineBetween(0, -radius * 0.65, radius * 0.45, 8);
          fireContactDetails(
            scene,
            { x: target.x, y: destinationY },
            presentation,
            presentation.scale,
          );
          resolve();
          scene.tweens.add({
            targets: impact,
            alpha: 0,
            scaleX: reducedMotion ? 1 : 1.14,
            scaleY: reducedMotion ? 1 : 1.08,
            duration: scene.scaledMs(reducedMotion ? 130 : 270),
            ease: "Quad.Out",
            onComplete: () => {
              impact.destroy();
            },
          });
        },
      });
    });
  }
  if (presentation.motion !== "field") return null;
  const y = target.feetY ?? target.y + target.height * 0.36;
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
        resolve();
        scene.tweens.add({
          targets: field,
          alpha: 0,
          y: y - (reducedMotion ? 0 : 18),
          duration: scene.scaledMs(reducedMotion ? 120 : 260),
          ease: "Sine.Out",
          onComplete: () => {
            field.destroy();
          },
        });
      },
    });
  });
}
import { battleCastOrigin } from "./battle_cinematics.js";
