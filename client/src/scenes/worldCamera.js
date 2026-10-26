// Keep world actors readable on narrow screens while fixed controls retain
// their logical size. Pinch zoom continues to affect only the world camera.
export function installWorldCamera(scene) {
  const layout = scene.gameplayLayout;
  if (!layout.portrait) return;
  const world = scene.cameras.main;
  world.setZoom(2);
  const ui = scene.cameras.add(
    0,
    0,
    layout.width,
    layout.height,
    false,
    "world-ui",
  );
  scene.worldUICamera = ui;
  const sync = () => {
    for (const object of scene.children.list) {
      const fixed = object.scrollFactorX === 0 && object.scrollFactorY === 0;
      object.cameraFilter = fixed
        ? (object.cameraFilter | world.id) & ~ui.id
        : (object.cameraFilter | ui.id) & ~world.id;
    }
  };
  sync();
  scene.events.on("postupdate", sync);
  scene.events.once("shutdown", () => {
    scene.events.off("postupdate", sync);
    scene.worldUICamera = null;
  });
}
