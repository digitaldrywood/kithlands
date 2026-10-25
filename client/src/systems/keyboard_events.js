// Phaser can replay a queued native event while processing interleaved keys.
// Each distinct browser event should affect a menu only once.
export function oncePerKeyEvent(handler) {
  const seen = new WeakSet();
  return function (event, ...args) {
    if (seen.has(event)) return;
    seen.add(event);
    return handler.call(this, event, ...args);
  };
}
