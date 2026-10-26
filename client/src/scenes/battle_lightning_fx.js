// Original vector lightning: a held wand charge, a single branching discharge,
// then localized residual arcs. No strobe, camera flash or random re-flicker.
function shape(scene, presentation, stage, x, y, tag) {
  const object = scene.add.graphics().setDepth(20).setPosition(x, y);
  object._combatFxTag = tag;
  object._battleEffectFamily = presentation.effectFamily;
  object._battleEffectStage = stage;
  object._battleEffectTier = presentation.intensityTier;
  return object;
}

function arc(graphics, points, presentation) {
  for (const [width, color, alpha] of [
    [10, presentation.glow, 0.18],
    [3, presentation.core, 0.95],
    [1, presentation.accent, 0.95],
  ]) {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.strokePath();
  }
}

export function playLightningRelease(
  scene,
  origin,
  presentation,
  currentOrigin = () => origin,
) {
  const reduced = scene.reducedBattleMotion();
  const charge = shape(
    scene,
    presentation,
    "release",
    origin.x,
    origin.y,
    "effect-release",
  );
  for (const side of [-1, 1])
    arc(
      charge,
      [
        { x: side * 18, y: -7 },
        { x: side * 7, y: -3 },
        { x: side * 12, y: 5 },
        { x: 0, y: 0 },
      ],
      presentation,
    );
  charge.fillStyle(presentation.core, 0.7);
  charge.fillCircle(0, 0, 4);
  charge.setAlpha(0);
  const followWand = () => {
    const point = currentOrigin();
    charge.setPosition(point.x, point.y);
  };
  return new Promise((resolve) =>
    scene.tweens.add({
      targets: charge,
      alpha: 1,
      duration: scene.scaledMs(reduced ? 130 : 210),
      ease: "Sine.Out",
      onUpdate: followWand,
      onComplete: () => {
        resolve();
        scene.tweens.add({
          targets: charge,
          alpha: 0,
          duration: scene.scaledMs(120),
          onUpdate: followWand,
          onComplete: () => charge.destroy(),
        });
      },
    }),
  );
}

export function playLightningToTarget(
  scene,
  origin,
  target,
  presentation,
  currentOrigin = () => origin,
) {
  const reduced = scene.reducedBattleMotion();
  const destination = { x: target.x, y: target.y + target.height * 0.12 };
  let start = reduced ? destination : currentOrigin();
  const bolt = shape(
    scene,
    presentation,
    "travel",
    start.x,
    start.y,
    "spell-projectile",
  );
  bolt._lightningReduced = reduced;
  bolt.lightningProgress = 0;
  const draw = (progress) => {
    bolt.clear();
    if (reduced) {
      // A small, still charge at the target replaces the cross-field beam.
      arc(
        bolt,
        [
          { x: -14, y: -9 },
          { x: -5, y: -4 },
          { x: -9, y: 3 },
          { x: 3, y: 8 },
        ],
        presentation,
      );
      return;
    }
    start = currentOrigin();
    bolt.setPosition(start.x, start.y);
    const dx = destination.x - start.x,
      dy = destination.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const points = Array.from({ length: 9 }, (_, index) => {
      const t = index / 8,
        offset =
          index === 0 || index === 8
            ? 0
            : (index % 2 ? 32 : -24) * presentation.scale;
      return { x: dx * t, y: dy * t + offset };
    });
    // Reveal one stable bolt along its length; never redraw random geometry.
    const cursor = progress * 8,
      whole = Math.min(7, Math.floor(cursor));
    const visible = points.slice(0, whole + 1);
    const fraction = cursor - whole;
    visible.push({
      x: points[whole].x + (points[whole + 1].x - points[whole].x) * fraction,
      y: points[whole].y + (points[whole + 1].y - points[whole].y) * fraction,
    });
    arc(bolt, visible, presentation);
    for (const [index, side] of [
      [3, -1],
      [5, 1],
    ]) {
      if (progress < (index + 0.2) / 8) continue;
      const base = points[index];
      arc(
        bolt,
        [
          base,
          { x: base.x + (dx / length) * 13, y: base.y + side * 27 },
          { x: base.x + (dx / length) * 30, y: base.y + side * 19 },
        ],
        presentation,
      );
    }
  };
  draw(0);
  return new Promise((resolve) =>
    scene.tweens.add({
      targets: bolt,
      lightningProgress: 1,
      duration: scene.scaledMs(reduced ? 140 : 260),
      ease: "Sine.In",
      onUpdate: () => draw(bolt.lightningProgress),
      onComplete: () => {
        bolt.destroy();
        const contact = shape(
          scene,
          presentation,
          "impact",
          destination.x,
          destination.y,
          "spell-impact",
        );
        // Frame the body instead of filling it with a bright disc.
        for (const side of [-1, 1])
          arc(
            contact,
            [
              { x: side * 10, y: -16 },
              { x: side * 23, y: -7 },
              { x: side * 15, y: 3 },
              { x: side * 27, y: 13 },
            ],
            presentation,
          );
        contact.lineStyle(2, presentation.core, 0.65);
        contact.strokeEllipse(
          0,
          target.height * 0.35,
          Math.max(30, target.width * 0.7),
          12,
        );
        resolve(); // Go's HP/text result lands on this frame, before the fade.
        scene.tweens.add({
          targets: contact,
          alpha: 0,
          hold: scene.scaledMs(70),
          duration: scene.scaledMs(reduced ? 260 : 400),
          ease: "Sine.In",
          onComplete: () => contact.destroy(),
        });
      },
    }),
  );
}
