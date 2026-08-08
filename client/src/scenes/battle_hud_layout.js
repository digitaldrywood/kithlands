const DESKTOP = {
  mode: "desktop",
  battlefield: { x: 8, y: 8, width: 784, height: 416 },
  strip: { x: 0, y: 432, width: 800, height: 168 },
  command: { x: 8, y: 440, width: 216, height: 152 },
  message: { x: 232, y: 456, width: 264, height: 120 },
  party: { x: 504, y: 440, width: 288, height: 152 },
};

const MOBILE = {
  mode: "mobile",
  battlefield: { x: 8, y: 8, width: 784, height: 312 },
  strip: { x: 0, y: 320, width: 800, height: 280 },
  command: { x: 8, y: 328, width: 384, height: 126 },
  message: { x: 408, y: 328, width: 384, height: 126 },
  party: { x: 8, y: 462, width: 784, height: 130 },
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

export function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}
