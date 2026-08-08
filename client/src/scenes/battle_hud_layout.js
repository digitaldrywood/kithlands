const DESKTOP = {
  mode: "desktop",
  gameWidth: 800,
  gameHeight: 600,
  battlefield: { x: 8, y: 8, width: 784, height: 416 },
  strip: { x: 0, y: 432, width: 800, height: 168 },
  command: { x: 8, y: 440, width: 216, height: 152 },
  message: { x: 232, y: 440, width: 292, height: 154 },
  party: { x: 532, y: 440, width: 260, height: 152 },
};

const MOBILE = {
  mode: "mobile",
  gameWidth: 800,
  gameHeight: 1600,
  battlefield: { x: 8, y: 8, width: 784, height: 584 },
  strip: { x: 0, y: 600, width: 800, height: 1000 },
  command: { x: 16, y: 616, width: 376, height: 360 },
  message: { x: 408, y: 616, width: 376, height: 360 },
  party: { x: 16, y: 992, width: 768, height: 592 },
};

function copyRect(rect) {
  return { ...rect };
}

export function battleHudLayout({
  viewportWidth = 800,
  viewportHeight = 600,
} = {}) {
  const source =
    viewportWidth <= 500 && viewportHeight > viewportWidth ? MOBILE : DESKTOP;
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      typeof value === "object" ? copyRect(value) : value,
    ]),
  );
}

export function gameLogicalSizeForViewport({
  viewportWidth = 800,
  viewportHeight = 600,
} = {}) {
  const layout = battleHudLayout({ viewportWidth, viewportHeight });
  return { width: layout.gameWidth, height: layout.gameHeight };
}

export function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}
