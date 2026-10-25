export const GAMEPLAY_WIDTH = 800;
export const GAMEPLAY_HEIGHT = 600;

export function isPortraitPhone(viewportWidth, viewportHeight) {
  return (
    Number.isFinite(viewportWidth) &&
    Number.isFinite(viewportHeight) &&
    viewportWidth <= 600 &&
    viewportHeight > viewportWidth
  );
}

export function gameplayViewportLayout(viewportWidth, viewportHeight) {
  const portrait = isPortraitPhone(viewportWidth, viewportHeight);
  const height = portrait
    ? Math.max(
        GAMEPLAY_HEIGHT,
        Math.round((GAMEPLAY_WIDTH * viewportHeight) / viewportWidth),
      )
    : GAMEPLAY_HEIGHT;
  const centerX = GAMEPLAY_WIDTH / 2;
  const controlsY = portrait ? height - 310 : 470;
  const dpad = portrait
    ? { x: 138, y: controlsY, size: 90, offset: 94, radius: 126 }
    : { x: 85, y: controlsY, size: 58, offset: 62, radius: 82 };
  const dpadExtent = Math.max(dpad.radius, dpad.offset + dpad.size / 2);
  const action = portrait
    ? { x: 666, y: controlsY, radius: 50 }
    : { x: 715, y: 480, radius: 34 };
  const touchHud = portrait
    ? { x: 724, startY: 126, width: 120, height: 88, gap: 10 }
    : { x: 735, startY: 110, width: 55, height: 44, gap: 4 };
  const footerY = portrait ? height - 22 : 584;
  const playfieldTop = portrait ? 78 : 0;
  const playfieldBottom = portrait ? height - 520 : GAMEPLAY_HEIGHT;

  return {
    mode: portrait ? "portrait" : "landscape",
    portrait,
    width: GAMEPLAY_WIDTH,
    height,
    centerX,
    centerY: height / 2,
    playfieldTop,
    playfieldBottom,
    playfieldCenterY: (playfieldTop + playfieldBottom) / 2,
    messageY: portrait ? (playfieldTop + playfieldBottom) / 2 : 300,
    footerY,
    worldHud: portrait
      ? {
          centerY: height - 96,
          height: 192,
          dividerY: height - 192,
          partyY: height - 176,
          footerY: height - 52,
        }
      : {
          centerY: 580,
          height: 40,
          dividerY: 559,
          partyY: 564,
          footerY: 582,
        },
    dpad,
    action,
    touchHud,
    controlArea: {
      footerTop: portrait ? height - 205 : 565,
      dpadLeft: dpad.x - dpadExtent,
      dpadRight: dpad.x + dpadExtent,
      dpadTop: dpad.y - dpadExtent,
      dpadBottom: dpad.y + dpadExtent,
      actionLeft: action.x - action.radius - 8,
      actionRight: action.x + action.radius + 8,
      actionTop: action.y - action.radius - 8,
      actionBottom: action.y + action.radius + 8,
      touchHudLeft: touchHud.x - touchHud.width / 2 - 8,
      touchHudRight: touchHud.x + touchHud.width / 2 + 8,
      touchHudTop: touchHud.startY - touchHud.height / 2 - 8,
      touchHudBottom:
        touchHud.startY +
        (touchHud.height + touchHud.gap) * 2 +
        touchHud.height / 2 +
        8,
    },
  };
}

export function currentBrowserViewport() {
  return {
    width: globalThis.innerWidth || GAMEPLAY_WIDTH,
    height: globalThis.innerHeight || GAMEPLAY_HEIGHT,
  };
}

export function applyGameplayViewport(
  scene,
  viewport = currentBrowserViewport(),
) {
  const layout = gameplayViewportLayout(viewport.width, viewport.height);
  const current = scene.scale?.gameSize;
  if (
    current &&
    (current.width !== layout.width || current.height !== layout.height)
  ) {
    scene.scale.setGameSize(layout.width, layout.height);
  }
  scene.gameplayLayout = layout;
  return layout;
}

export function centeredPlayfieldOffset(layout, contentWidth, contentHeight) {
  return {
    x: Math.round((layout.width - contentWidth) / 2),
    y: Math.round(layout.playfieldCenterY - contentHeight / 2),
  };
}
