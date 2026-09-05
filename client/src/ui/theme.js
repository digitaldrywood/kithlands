// Shared canvas palette. Browser menus use the same values in menu-theme.css.
export const MENU_THEME = Object.freeze({
  panel: 0x151e2b,
  card: 0x1c2736,
  hover: 0x283748,
  line: 0x384859,
  text: 0xe9eef7,
  muted: 0x94a8bd,
  accent: 0xc9b589,
  health: 0x8ac7aa,
  magic: 0x8faee9,
});

function roundedPoints(width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const points = [];
  for (const [cx, cy, angle] of [
    [width - r, r, -90],
    [width - r, height - r, 0],
    [r, height - r, 90],
    [r, r, 180],
  ]) {
    for (let step = 0; step <= 6; step++) {
      const a = ((angle + step * 15) * Math.PI) / 180;
      points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }
  return points;
}

// Polygon is a native Shape, including fill/stroke and rectangular hit testing.
// Rebuild its geometry when a menu resizes, keeping origin and hit area aligned.
export function roundedRectangle(
  scene,
  x,
  y,
  width,
  height,
  fill,
  alpha = 1,
  radius = 12,
) {
  if (!scene.add.polygon)
    return scene.add.rectangle(x, y, width, height, fill, alpha);
  const shape = scene.add.polygon(
    x,
    y,
    roundedPoints(width, height, radius),
    fill,
    alpha,
  );
  const setSize = shape.setSize;
  shape.setSize = function (w, h) {
    this.geom.setTo(roundedPoints(w, h, radius));
    this.updateData();
    setSize.call(this, w, h);
    this.updateDisplayOrigin();
    if (this.input && !this.input.customHitArea)
      this.input.hitArea.setSize(w, h);
    return this;
  };
  return shape;
}
