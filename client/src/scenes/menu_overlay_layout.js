const DESKTOP = {
  mode: "desktop",
  gameWidth: 800,
  gameHeight: 600,
  panel: { x: 400, y: 300, width: 560, height: 420 },
  title: { xInset: 22, yInset: 22, fontSize: 18 },
  count: { xInset: 22, yInset: 22, fontSize: 11 },
  headerDividerInset: 45,
  stage: { xInset: 22, yInset: 57, fontSize: 9 },
  list: {
    xInset: 20,
    startInset: 71,
    labelInset: 34,
    quantityInset: 30,
    labelFontSize: 12,
    metaFontSize: 10,
  },
  detail: {
    dividerBottomInset: 116,
    nameBottomInset: 99,
    descriptionBottomInset: 80,
    nameFontSize: 13,
    metaFontSize: 9,
    descriptionFontSize: 11,
    horizontalInset: 22,
  },
  footer: {
    hintBottomInset: 45,
    hintFontSize: 9,
    buttonYBottomInset: 21,
    buttonWidth: 190,
    buttonHeight: 26,
    buttonFontSize: 12,
  },
  targets: {
    columns: 2,
    horizontalInset: 21,
    columnGap: 12,
    startInset: 103,
    rowGap: 72,
    cardHeight: 62,
    labelInsetX: 12,
    labelOffsetY: -17,
    vitalsOffsetY: 8,
    labelFontSize: 12,
    vitalsFontSize: 10,
  },
};

const MOBILE = {
  mode: "mobile",
  gameWidth: 800,
  gameHeight: 1600,
  panel: { x: 400, y: 800, width: 760, height: 1460 },
  title: { xInset: 30, yInset: 50, fontSize: 38 },
  count: { xInset: 30, yInset: 50, fontSize: 22 },
  headerDividerInset: 110,
  stage: { xInset: 30, yInset: 145, fontSize: 20 },
  list: {
    xInset: 24,
    startInset: 180,
    labelInset: 42,
    quantityInset: 40,
    labelFontSize: 28,
    metaFontSize: 22,
  },
  detail: {
    dividerBottomInset: 420,
    nameBottomInset: 360,
    descriptionBottomInset: 300,
    nameFontSize: 28,
    metaFontSize: 20,
    descriptionFontSize: 24,
    horizontalInset: 34,
  },
  footer: {
    hintBottomInset: 178,
    hintFontSize: 19,
    buttonYBottomInset: 74,
    buttonWidth: 680,
    buttonHeight: 94,
    buttonFontSize: 28,
  },
  targets: {
    columns: 2,
    horizontalInset: 28,
    columnGap: 18,
    startInset: 300,
    rowGap: 210,
    cardHeight: 174,
    labelInsetX: 20,
    labelOffsetY: -42,
    vitalsOffsetY: 24,
    labelFontSize: 28,
    vitalsFontSize: 22,
  },
};

function copyLayout(source, desktopRowHeight, desktopMaxVisible) {
  const mobile = source.mode === "mobile";
  return {
    ...source,
    panel: { ...source.panel },
    title: { ...source.title },
    count: { ...source.count },
    stage: { ...source.stage },
    list: {
      ...source.list,
      rowHeight: mobile ? 88 : desktopRowHeight,
      maxVisible: mobile ? 9 : desktopMaxVisible,
    },
    detail: { ...source.detail },
    footer: { ...source.footer },
    targets: { ...source.targets },
  };
}

export function menuOverlayLayout({
  viewportWidth = 800,
  viewportHeight = 600,
  desktopRowHeight = 28,
  desktopMaxVisible = 7,
} = {}) {
  const source =
    viewportWidth <= 500 && viewportHeight > viewportWidth ? MOBILE : DESKTOP;
  return copyLayout(source, desktopRowHeight, desktopMaxVisible);
}

export function applyMenuOverlayGameSize(scene, layout) {
  const previous = {
    width: scene.scale.gameSize.width,
    height: scene.scale.gameSize.height,
  };
  if (
    previous.width !== layout.gameWidth ||
    previous.height !== layout.gameHeight
  ) {
    scene.scale.setGameSize(layout.gameWidth, layout.gameHeight);
  }
  return previous;
}

export function restoreMenuOverlayGameSize(scene, previous) {
  if (!previous) return;
  if (
    scene.scale.gameSize.width !== previous.width ||
    scene.scale.gameSize.height !== previous.height
  ) {
    scene.scale.setGameSize(previous.width, previous.height);
  }
}
