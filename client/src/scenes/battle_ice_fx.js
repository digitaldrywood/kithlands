// Original vector effects: hard facets and a short shatter distinguish ice
// from the soft fire trail. The server still owns every target and outcome.
function iceShape(scene, presentation, stage, x, y, tag) {
  const shape = scene.add.graphics().setDepth(20).setPosition(x, y);
  shape._combatFxTag = tag;
  shape._battleEffectFamily = presentation.effectFamily;
  shape._battleEffectStage = stage;
  shape._battleEffectTier = presentation.intensityTier;
  return shape;
}

function crystal(shape, x, y, length, width, style) {
  shape.fillStyle(style.glow, 0.85);
  shape.fillPoints(
    [
      { x: x - length / 2, y },
      { x, y: y - width },
      { x: x + length / 2, y },
      { x, y: y + width },
    ],
    true,
  );
  shape.fillStyle(style.core, 0.95);
  shape.fillTriangle(x - length / 2, y, x, y - width, x + length / 2, y);
  shape.lineStyle(1.5, style.accent, 0.95);
  shape.lineBetween(x - length / 2, y, x + length / 2, y);
  shape.lineBetween(x, y - width, x + length / 2, y);
}

export function playIceRelease(scene, origin, presentation) {
  const reduced = scene.reducedBattleMotion();
  const shape = iceShape(
    scene,
    presentation,
    "release",
    origin.x,
    origin.y,
    "effect-release",
  );
  crystal(shape, 0, 0, 26, 7, presentation);
  shape.lineStyle(2, presentation.accent, 0.85);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    shape.lineBetween(
      Math.cos(angle) * 12,
      Math.sin(angle) * 12,
      Math.cos(angle) * 20,
      Math.sin(angle) * 20,
    );
  }
  shape.setScale(reduced ? 1 : 0.4).setAlpha(0);
  return new Promise((resolve) =>
    scene.tweens.add({
      targets: shape,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: scene.scaledMs(reduced ? 110 : 170),
      ease: "Quad.Out",
      onComplete: () => {
        resolve();
        scene.tweens.add({
          targets: shape,
          alpha: 0,
          duration: scene.scaledMs(120),
          onComplete: () => shape.destroy(),
        });
      },
    }),
  );
}

export function playIceToTarget(scene, origin, target, presentation) {
  const reduced = scene.reducedBattleMotion();
  const x = target.x,
    y = target.y + target.height * 0.12;
  const shard = iceShape(
    scene,
    presentation,
    "travel",
    reduced ? x : origin.x,
    reduced ? y : origin.y,
    "spell-projectile",
  );
  crystal(
    shard,
    0,
    0,
    46 * presentation.scale,
    9 * presentation.scale,
    presentation,
  );
  shard.setRotation(Math.atan2(y - origin.y, x - origin.x));
  let trailStep = -1;
  return new Promise((resolve) =>
    scene.tweens.add({
      targets: shard,
      x,
      y,
      alpha: reduced ? 0.35 : 1,
      duration: scene.scaledMs(reduced ? 120 : 340),
      ease: "Cubic.In",
      onUpdate: (tween) => {
        if (reduced) return;
        const step = Math.floor(tween.progress * 4);
        if (step === trailStep) return;
        trailStep = step;
        const chip = scene.add
          .graphics()
          .setDepth(19)
          .setPosition(shard.x, shard.y);
        chip._combatFxTag = "ice-trail";
        crystal(chip, 0, 0, 10, 3, presentation);
        scene.tweens.add({
          targets: chip,
          alpha: 0,
          duration: scene.scaledMs(150),
          onComplete: () => chip.destroy(),
        });
      },
      onComplete: () => {
        shard.destroy();
        const impact = iceShape(
          scene,
          presentation,
          "impact",
          x,
          y,
          "spell-impact",
        );
        // Leave the target's center readable; crystals frame the contact point.
        for (const sign of [-1, 1]) {
          crystal(impact, sign * 24, 9, 24, 6, presentation);
          impact.lineStyle(2, presentation.accent, 0.9);
          impact.lineBetween(sign * 8, -6, sign * 22, -23);
          impact.lineBetween(sign * 22, -23, sign * 18, -11);
        }
        impact.lineStyle(3, presentation.core, 1);
        impact.lineBetween(-12, 0, 12, 0);
        impact.lineBetween(0, -12, 0, 12);
        if (!reduced)
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const chip = scene.add.graphics().setPosition(x, y).setDepth(21);
            chip._combatFxTag = "ice-shatter";
            crystal(chip, 0, 0, 12, 4, presentation);
            chip.setRotation(angle);
            scene.tweens.add({
              targets: chip,
              x: x + Math.cos(angle) * 38,
              y: y + Math.sin(angle) * 28,
              alpha: 0,
              duration: scene.scaledMs(260),
              ease: "Quad.Out",
              onComplete: () => chip.destroy(),
            });
          }
        resolve(); // Apply authoritative HP/text at contact, before the fade.
        scene.tweens.add({
          targets: impact,
          alpha: 0,
          duration: scene.scaledMs(reduced ? 280 : 420),
          hold: scene.scaledMs(70),
          onComplete: () => impact.destroy(),
        });
      },
    }),
  );
}
