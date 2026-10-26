import { isWorldInputLocked } from "../systems/modalLock.js";

// Frame the room independently of fixed UI. Tall rooms pan with the player;
// shrinking the entire room to a short phone screen would shrink its actors.
export function interiorFraming(layout, width, height, uiBottom = 280) {
  if (!layout.portrait) return { zoom: 1, viewport: null };
  const zoom = Math.min(1.65, (layout.width - 24) / (width + 36));
  const bottom = layout.controlArea.dpadTop - 96;
  const top = Math.max(120, Math.min(uiBottom + 20, bottom - 64));
  return {
    zoom,
    viewport: {
      x: 12,
      y: top,
      width: layout.width - 24,
      height: Math.min((height + 36) * zoom, bottom - top),
    },
  };
}

export function installInteriorCamera(scene, width, height) {
  const layout = scene.gameplayLayout;
  if (!layout.portrait) return;
  const camera = scene.cameras.main;
  const uiBottom = () =>
    Math.max(
      ...scene.labelBar.map((o) => o.getBounds().bottom),
      scene.objectiveText?.getBounds().bottom || 0,
    );
  const { zoom, viewport: v } = interiorFraming(
    layout,
    width,
    height,
    uiBottom(),
  );
  camera.setViewport(v.x, v.y, v.width, v.height).setZoom(zoom);
  camera.setBounds(
    scene.offsetX - 18,
    scene.offsetY - 18,
    width + 36,
    height + 36,
  );
  camera.startFollow(scene.player, true, 1, 1);
  const ui = scene.cameras.add(
    0,
    0,
    layout.width,
    layout.height,
    false,
    "interior-ui",
  );
  scene.interiorUICamera = ui;
  const placePrompts = () => {
    for (const prompt of [scene.interactPrompt, scene.searchPrompt]) {
      if (!prompt?.active || !scene.player?.active) continue;
      prompt.setVisible(!isWorldInputLocked(scene));
      prompt.setPosition(
        layout.centerX,
        camera.y + camera.height + prompt.height / 2 + 16,
      );
    }
  };
  let reservedBottom = uiBottom();
  const sync = () => {
    const nextBottom = uiBottom();
    // Reserve growth after collecting/reporting, without moving the room when
    // a modal temporarily hides the objective or when the new text is shorter.
    if (nextBottom > reservedBottom + 1) {
      reservedBottom = nextBottom;
      const next = interiorFraming(
        layout,
        width,
        height,
        reservedBottom,
      ).viewport;
      camera.setViewport(next.x, next.y, next.width, next.height);
    }
    for (const object of scene.children.list) {
      const fixed = object.scrollFactorX === 0 && object.scrollFactorY === 0;
      object.cameraFilter = fixed
        ? (object.cameraFilter | camera.id) & ~ui.id
        : (object.cameraFilter | ui.id) & ~camera.id;
    }
  };
  scene.events.on("postupdate", sync);
  camera.on("followupdate", placePrompts);
  scene.events.once("shutdown", () => {
    scene.events.off("postupdate", sync);
    camera.off("followupdate", placePrompts);
    scene.interiorUICamera = null;
  });
}
