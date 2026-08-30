const DESKTOP = {
  mode: "desktop",
  gameWidth: 800,
  gameHeight: 600,
  shell: { x: 400, y: 300, width: 760, height: 540 },
  title: { x: 82, y: 60, fontSize: 24 },
  hint: { x: 400, y: 88, fontSize: 10, width: 680 },
  preview: {
    panel: { x: 184, y: 312, width: 280, height: 340 },
    title: { x: 62, y: 122, fontSize: 14 },
    frontHelp: { x: 62, y: 142, fontSize: 10 },
    backHelp: { x: 190, y: 142, fontSize: 10 },
    pane: { left: 54, top: 156, width: 256, height: 286 },
    card: { width: 108, height: 52 },
    slotBadge: { x: 16, y: 12, width: 22, height: 18, fontSize: 10 },
    portrait: { x: 38, size: 30 },
    name: { x: 56, y: 10, fontSize: 10 },
    rowLabel: { x: 56, y: 26, fontSize: 9 },
    moved: { x: 56, y: 38, fontSize: 8 },
  },
  list: {
    panel: { x: 561, y: 312, width: 430, height: 340 },
    title: { x: 364, y: 122, fontSize: 14 },
    left: 356,
    rowTop: 156,
    rowHeight: 68,
    rowWidth: 394,
    rowBodyHeight: 58,
    portrait: { x: 30, y: 28, size: 42, imageSize: 30 },
    name: { x: 60, y: 8, fontSize: 13 },
    className: { x: 60, y: 24, fontSize: 10 },
    stats: { x: 210, y: 8, fontSize: 10 },
    badge: { x: 338, y: 28, width: 76, height: 22, fontSize: 10 },
    picked: { x: 338, y: 8, fontSize: 8 },
  },
  save: { x: 400, y: 532, width: 204, height: 34, fontSize: 12 },
};

const MOBILE = {
  mode: "mobile",
  gameWidth: 800,
  gameHeight: 1600,
  shell: { x: 400, y: 800, width: 760, height: 1460 },
  title: { x: 60, y: 120, fontSize: 38 },
  hint: { x: 400, y: 174, fontSize: 19, width: 680 },
  preview: {
    panel: { x: 400, y: 410, width: 680, height: 390 },
    title: { x: 74, y: 232, fontSize: 26 },
    frontHelp: { x: 78, y: 270, fontSize: 18 },
    backHelp: { x: 580, y: 270, fontSize: 18 },
    pane: { left: 70, top: 282, width: 660, height: 300 },
    card: { width: 260, height: 64 },
    slotBadge: { x: 24, y: 18, width: 36, height: 30, fontSize: 17 },
    portrait: { x: 66, size: 46 },
    name: { x: 98, y: 10, fontSize: 20 },
    rowLabel: { x: 98, y: 34, fontSize: 17 },
    moved: { x: 98, y: 50, fontSize: 13 },
  },
  list: {
    panel: { x: 400, y: 1000, width: 680, height: 680 },
    title: { x: 74, y: 632, fontSize: 26 },
    left: 75,
    rowTop: 680,
    rowHeight: 150,
    rowWidth: 650,
    rowBodyHeight: 138,
    portrait: { x: 54, y: 69, size: 84, imageSize: 64 },
    name: { x: 112, y: 22, fontSize: 27 },
    className: { x: 112, y: 58, fontSize: 20 },
    stats: { x: 112, y: 98, fontSize: 20 },
    badge: { x: 570, y: 70, width: 122, height: 58, fontSize: 20 },
    picked: { x: 570, y: 28, fontSize: 15 },
  },
  save: { x: 400, y: 1452, width: 680, height: 94, fontSize: 28 },
};

function cloneLayout(source) {
  return {
    ...source,
    shell: { ...source.shell },
    title: { ...source.title },
    hint: { ...source.hint },
    preview: {
      ...source.preview,
      panel: { ...source.preview.panel },
      title: { ...source.preview.title },
      frontHelp: { ...source.preview.frontHelp },
      backHelp: { ...source.preview.backHelp },
      pane: { ...source.preview.pane },
      card: { ...source.preview.card },
      slotBadge: { ...source.preview.slotBadge },
      portrait: { ...source.preview.portrait },
      name: { ...source.preview.name },
      rowLabel: { ...source.preview.rowLabel },
      moved: { ...source.preview.moved },
    },
    list: {
      ...source.list,
      panel: { ...source.list.panel },
      title: { ...source.list.title },
      portrait: { ...source.list.portrait },
      name: { ...source.list.name },
      className: { ...source.list.className },
      stats: { ...source.list.stats },
      badge: { ...source.list.badge },
      picked: { ...source.list.picked },
    },
    save: { ...source.save },
  };
}

export function formationMenuLayout({
  viewportWidth = 800,
  viewportHeight = 600,
} = {}) {
  const source =
    viewportWidth <= 500 && viewportHeight > viewportWidth ? MOBILE : DESKTOP;
  return cloneLayout(source);
}
