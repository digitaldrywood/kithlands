// Presentation only. World still awaits each authoritative arrival before unlocking.
export function startWalkMotion(
  scene,
  destination,
  duration,
  walk,
  onComplete,
) {
  const start = { x: scene.player.x, y: scene.player.y };
  let elapsed = 0;
  let previous = performance.now();
  const tick = () => {
    const now = performance.now();
    elapsed += (now - previous) * scene.tweens.timeScale;
    previous = now;
    const progress = Math.min(1, elapsed / duration);
    scene.player.setPosition(
      start.x + (destination.x - start.x) * progress,
      start.y + (destination.y - start.y) * progress,
    );
    walk.updatePosition();
    if (progress === 1) {
      dispose();
      onComplete();
    }
  };
  const dispose = () => {
    scene.events.off("update", tick);
    scene.events.off("shutdown", dispose);
  };
  scene.events.on("update", tick);
  scene.events.once("shutdown", dispose);
  return dispose;
}
