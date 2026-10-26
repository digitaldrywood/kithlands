// A connected dirt core with a broken grass fringe. Coordinates are logical
// 16px terrain pixels; build once into cached textures, never during walking.
function inside(mask, corners, x, y) {
  const middleX = x >= 4 && x < 12;
  const middleY = y >= 4 && y < 12;
  return (
    (x - 8) ** 2 + (y - 8) ** 2 <= 25 ||
    (mask & 1 && middleX && y < 8) ||
    (mask & 2 && middleY && x >= 8) ||
    (mask & 4 && middleX && y >= 8) ||
    (mask & 8 && middleY && x < 8) ||
    (corners & 1 && x < 8 && y < 8) ||
    (corners & 2 && x >= 8 && y < 8) ||
    (corners & 4 && x >= 8 && y >= 8) ||
    (corners & 8 && x < 8 && y >= 8)
  );
}

export function meadowPathPixel(mask, corners, x, y, variant = 0) {
  const core = !!inside(mask, corners, x + 0.5, y + 0.5);
  let distance = 3;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      if (!!inside(mask, corners, x + dx + 0.5, y + dy + 0.5) !== core)
        distance = Math.min(distance, Math.hypot(dx, dy));
  if (distance > 1.5) return core;
  const coverage = core ? 0.84 : 0.22;
  const grain = ((x * 13 + y * 7 + variant * 5) & 15) / 16;
  return grain < coverage;
}

export function drawMeadowPath(ctx, image, mask, corners, variant) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (meadowPathPixel(mask, corners, x, y, variant))
        ctx.drawImage(image, x, y, 1, 1, x, y, 1, 1);
}
