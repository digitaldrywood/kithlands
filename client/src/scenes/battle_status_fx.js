// Original line-art sigils. Outcomes are receipts from Go, never client rolls.
function sigil(shape, style, radius = 14) {
  shape.lineStyle(2.5, style.core, 1);
  if (style.effectFamily === "status_sleep") {
    // Crescent with three small dream stars; no font dependency.
    shape.beginPath();
    shape.arc(0, 0, radius, Math.PI * 0.3, Math.PI * 1.7);
    shape.strokePath();
    for (const [x, y] of [
      [5, -6],
      [11, 0],
      [5, 7],
    ]) {
      shape.lineBetween(x - 2, y, x + 2, y);
      shape.lineBetween(x, y - 2, x, y + 2);
    }
  } else if (style.effectFamily === "status_silence") {
    shape.strokeCircle(0, 0, radius);
    shape.lineBetween(
      -radius * 0.75,
      radius * 0.75,
      radius * 0.75,
      -radius * 0.75,
    );
    shape.lineStyle(2, style.accent, 1);
    for (const [x, height] of [
      [-6, 4],
      [0, 8],
      [6, 4],
    ])
      shape.lineBetween(x, -height, x, height);
  } else {
    // Hourglass: the two triangles remain recognizable without rotation.
    shape.strokePoints([
      { x: -radius, y: -radius },
      { x: radius, y: -radius },
      { x: -radius, y: radius },
      { x: radius, y: radius },
      { x: -radius, y: -radius },
    ]);
    shape.lineStyle(2, style.accent, 1);
    shape.lineBetween(-4, 8, 4, 8);
  }
}

function effect(scene, style, stage, x, y, tag) {
  const shape = scene.add.graphics().setDepth(20).setPosition(x, y);
  shape._battleEffectFamily = style.effectFamily;
  shape._battleEffectTier = style.intensityTier;
  shape._battleEffectStage = stage;
  shape._combatFxTag = tag;
  return shape;
}

export function playStatusRelease(scene, origin, style) {
  const reduced = scene.reducedBattleMotion();
  const cue = effect(
    scene,
    style,
    "release",
    origin.x,
    origin.y,
    "effect-release",
  );
  sigil(cue, style, 10);
  cue.setAlpha(0).setScale(reduced ? 1 : 0.6);
  return new Promise((resolve) =>
    scene.tweens.add({
      targets: cue,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: reduced ? 160 : scene.scaledMs(160),
      ease: "Sine.Out",
      onComplete: () => {
        resolve();
        scene.tweens.add({
          targets: cue,
          alpha: 0,
          duration: scene.scaledMs(120),
          onComplete: () => cue.destroy(),
        });
      },
    }),
  );
}

export function playStatusToTarget(scene, origin, target, style) {
  const reduced = scene.reducedBattleMotion();
  const x = target.x,
    y = target.y;
  const wisp = effect(
    scene,
    style,
    "travel",
    reduced ? x : origin.x,
    reduced ? y : origin.y,
    "spell-projectile",
  );
  sigil(wisp, style, 8);
  wisp.setAlpha(0.8);
  return new Promise((resolve) =>
    scene.tweens.add({
      targets: wisp,
      x,
      y,
      // Stationary cues need visible reading time even at Fast speed.
      duration: reduced ? 150 : scene.scaledMs(390),
      ease: "Sine.InOut",
      onComplete: () => {
        wisp.destroy();
        const applied = style.statusOutcome === "applied";
        const contact = effect(
          scene,
          style,
          "impact",
          x,
          (target.feetY ?? target.y + target.height / 2) - 8,
          "spell-impact",
        );
        contact._statusOutcome = style.statusOutcome;
        if (applied) {
          contact.lineStyle(2, style.glow, 0.85);
          contact.strokeEllipse(0, 0, Math.min(64, target.width * 0.8), 16);
          sigil(contact, style, 13);
        } else {
          // Broken seal: a resisted cast never displays the applied sigil.
          contact.lineStyle(2.5, 0xc1cbd6, 0.9);
          contact.lineBetween(-15, -12, -5, -3);
          contact.lineBetween(5, 3, 15, 12);
          contact.lineBetween(-15, 12, -5, 3);
          contact.lineBetween(5, -3, 15, -12);
        }
        resolve(); // Display the server outcome exactly at contact.
        scene.tweens.add({
          targets: contact,
          alpha: 0,
          duration: reduced ? 340 : scene.scaledMs(340),
          hold: reduced ? 160 : scene.scaledMs(160),
          onComplete: () => contact.destroy(),
        });
      },
    }),
  );
}
