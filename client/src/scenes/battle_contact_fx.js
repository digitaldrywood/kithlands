// Bounded presentation layers. Damage, targeting and result timing stay in Go.
// Paths are authored here so the same effect works on Canvas and WebGL.
export function drawFirebolt(graphics, style, scale = 1) {
  const path = (points, color, alpha) => {
    graphics.fillStyle(color, alpha);
    graphics.fillPoints(
      points.map(([x, y]) => ({ x: x * scale, y: y * scale })),
      true,
    );
  };
  path(
    [
      [-38, -5],
      [-22, -10],
      [-28, -17],
      [-9, -10],
      [4, -13],
      [16, -6],
      [21, 0],
      [14, 9],
      [0, 13],
      [-16, 8],
      [-34, 12],
      [-24, 3],
    ],
    style.glow,
    0.8,
  );
  path(
    [
      [-31, -3],
      [-15, -6],
      [-18, -11],
      [2, -8],
      [14, -3],
      [17, 1],
      [9, 7],
      [-3, 8],
      [-20, 5],
    ],
    style.core,
    1,
  );
  path(
    [
      [-15, -1],
      [-4, -5],
      [9, -3],
      [14, 1],
      [5, 5],
      [-3, 4],
    ],
    style.accent,
    1,
  );
  graphics.fillStyle(0xfff8df, 1);
  graphics.fillEllipse(8 * scale, 0, 9 * scale, 5 * scale);
}

function transient(scene, object, config) {
  object._combatFxTag = "contact-detail";
  scene.tweens.add({
    ...config,
    targets: object,
    onComplete: () => object.destroy(),
  });
  return object;
}

export function fireContactDetails(scene, target, style, scale = 1) {
  const reduced = scene.reducedBattleMotion();
  const count = reduced ? 2 : 8;
  const objects = [];
  // Asymmetric tongues and cinders disperse outward; no full-screen flash.
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.35;
    const spark = scene.add
      .graphics()
      .setDepth(22)
      .setPosition(target.x, target.y);
    spark.fillStyle(i % 2 ? style.accent : style.core, 0.95);
    spark.fillPoints(
      [
        { x: -3, y: 0 },
        { x: 0, y: -7 },
        { x: 3, y: 0 },
        { x: 0, y: 4 },
      ],
      true,
    );
    objects.push(
      transient(scene, spark, {
        x: target.x + (reduced ? 0 : Math.cos(angle) * (22 + i * 3) * scale),
        y: target.y + (reduced ? 0 : Math.sin(angle) * 24 * scale - 12),
        alpha: 0,
        angle: reduced ? 0 : i * 28,
        duration: scene.scaledMs(reduced ? 140 : 240 + i * 16),
        ease: "Quad.Out",
      }),
    );
  }
  return objects;
}

export function meleeContactDetails(scene, x, y, { crit = false } = {}) {
  const reduced = scene.reducedBattleMotion();
  const slash = scene.add.graphics().setDepth(21).setPosition(x, y);
  slash._combatFxTag = "melee-contact";
  // Broad leading edge, tapering tip and short counterstroke read as a cut.
  slash.fillStyle(crit ? 0xffd781 : 0xb4dcf0, 0.65);
  slash.fillPoints(
    [
      { x: -34, y: 27 },
      { x: -17, y: 5 },
      { x: 32, y: -25 },
      { x: 17, y: -5 },
      { x: -6, y: 12 },
    ],
    true,
  );
  slash.fillStyle(0xfff9e7, 1);
  slash.fillPoints(
    [
      { x: -27, y: 22 },
      { x: -10, y: 2 },
      { x: 29, y: -23 },
      { x: 8, y: -3 },
    ],
    true,
  );
  slash.lineStyle(2, 0xffe3a1, 0.8);
  slash.lineBetween(-15, -10, 16, 13);
  scene.tweens.add({
    targets: slash,
    alpha: 0,
    scaleX: reduced ? 1 : 1.22,
    scaleY: reduced ? 1 : 1.22,
    duration: scene.scaledMs(reduced ? 110 : 190),
    onComplete: () => slash.destroy(),
  });
  if (!reduced) {
    for (let i = 0; i < (crit ? 7 : 4); i++) {
      const angle = i * 2.399;
      const spark = scene.add.graphics().setDepth(22).setPosition(x, y);
      spark.lineStyle(2, crit ? 0xffce6a : 0xffedc6, 1);
      spark.lineBetween(0, 0, Math.cos(angle) * 7, Math.sin(angle) * 7);
      transient(scene, spark, {
        x: x + Math.cos(angle) * 32,
        y: y + Math.sin(angle) * 22,
        alpha: 0,
        duration: scene.scaledMs(160 + i * 15),
        ease: "Quad.Out",
      });
    }
  }
  return slash;
}
