const DESKTOP = {
  mode: "desktop",
  gameWidth: 800,
  gameHeight: 600,
  panel: { x: 400, y: 300, width: 760, height: 540 },
  exit: { x: 380, y: 62, width: 112, height: 32 },
  title: { x: 82, y: 59, fontSize: 24, originX: 0 },
  resources: {
    y: 64,
    right: 752,
    widths: [86, 84, 84],
    gap: 10,
    height: 24,
    fontSize: 12,
  },
  dividerY: 94,
  body: { x: 40, y: 100, width: 720, height: 362 },
  actions: {
    mode: "rows",
    primaryY: 478,
    secondaryY: 520,
  },
};

const MOBILE = {
  mode: "mobile",
  gameWidth: 800,
  gameHeight: 1600,
  panel: { x: 400, y: 800, width: 760, height: 1540 },
  exit: { x: 692, y: 78, width: 132, height: 64 },
  title: { x: 400, y: 78, fontSize: 40, originX: 0.5 },
  resources: {
    y: 142,
    right: 685,
    widths: [170, 170, 170],
    gap: 18,
    height: 52,
    fontSize: 24,
  },
  dividerY: 190,
  body: { x: 40, y: 210, width: 720, height: 710 },
  actions: {
    mode: "grid",
    columns: 2,
    buttonWidth: 334,
    columnGap: 18,
    rowGap: 104,
    primaryY: 980,
    secondaryY: 1300,
  },
};

function copyLayout(source, partyCount) {
  const count = Math.max(1, Number(partyCount) || 1);
  return {
    ...source,
    panel: { ...source.panel },
    title: { ...source.title },
    exit: { ...source.exit },
    resources: {
      ...source.resources,
      widths: [...source.resources.widths],
    },
    body: {
      ...source.body,
      rowHeight: Math.floor(source.body.height / count),
    },
    actions: { ...source.actions },
  };
}

export function partyMenuLayout({
  viewportWidth = 800,
  viewportHeight = 600,
  partyCount = 4,
} = {}) {
  const source =
    viewportWidth <= 500 && viewportHeight > viewportWidth ? MOBILE : DESKTOP;
  return copyLayout(source, partyCount);
}
