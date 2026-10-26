import { portraitFontSize } from "../systems/gameplayViewport.js";

// Confirmation text belongs in the quiet upper-left of the battlefield. It
// never follows a moving actor or scales down with the phone's canvas.
export function battleActionTitle(scene, actorName, actionName, color, holdMs) {
  const logicalWidth = scene.scale.gameSize.width;
  const unit = parseInt(portraitFontSize(scene, 100), 10) / 100;
  const margin = 12 * unit;
  const padding = 16 * unit;
  const maxWidth = Math.min(280 * unit, logicalWidth / 2 - margin * 2);
  const innerWidth = maxWidth - padding * 2;
  const actor = String(actorName || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  const action = String(actionName || "")
    .trim()
    .toUpperCase();
  const actorText = scene.add
    .text(0, 0, actor, {
      fontSize: portraitFontSize(scene, 14),
      color: "#d6deef",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    })
    .setDepth(24)
    .setOrigin(0, 0)
    .setAlpha(0);
  actorText._combatFxTag = "title-actor";
  actorText._actionTitleFullText = actor;
  const actionText = scene.add
    .text(0, 0, action, {
      fontSize: portraitFontSize(scene, 18),
      color,
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
      wordWrap: { width: innerWidth, useAdvancedWrap: true },
    })
    .setDepth(24)
    .setOrigin(0, 0)
    .setAlpha(0);
  actionText._combatFxTag = "title-action";
  actionText._actionTitleFullText = action;

  // Keep the actor to one line and the action to two. Names remain available
  // in the party/status UI and the complete action remains in the message log.
  function fit(text, full, fits) {
    if (fits(full)) return;
    const chars = Array.from(full);
    let low = 0,
      high = chars.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fits(chars.slice(0, middle).join("") + "…")) low = middle;
      else high = middle - 1;
    }
    text.setText(chars.slice(0, low).join("").trimEnd() + "…");
  }
  fit(
    actorText,
    actor,
    (value) => actorText.context.measureText(value).width <= innerWidth,
  );
  fit(
    actionText,
    action,
    (value) => actionText.getWrappedText(value).length <= 2,
  );
  const gap = actor ? 4 * unit : 0;
  const width = Math.min(
    maxWidth,
    Math.max(
      140 * unit,
      Math.max(actorText.width, actionText.width) + padding * 2,
    ),
  );
  const height =
    20 * unit + (actor ? actorText.height : 0) + gap + actionText.height;
  const bg = scene.add
    .rectangle(margin, margin, width, height, 0x151e2b, 0.96)
    .setOrigin(0, 0)
    .setDepth(23)
    .setStrokeStyle(Math.max(1, unit), 0x718398)
    .setAlpha(0);
  bg._combatFxTag = "title-card";
  const accent = scene.add
    .rectangle(
      margin + 5 * unit,
      margin + 8 * unit,
      3 * unit,
      height - 16 * unit,
      0xc9b589,
    )
    .setOrigin(0, 0)
    .setDepth(24)
    .setAlpha(0);
  actorText.setPosition(margin + padding, margin + 10 * unit);
  actorText.setVisible(!!actor);
  actionText.setPosition(
    margin + padding,
    margin + 10 * unit + (actor ? actorText.height : 0) + gap,
  );
  const nodes = [bg, accent, actorText, actionText];
  let disposed = false;
  scene.tweens.add({
    targets: nodes,
    alpha: 1,
    duration: 120,
    ease: "Sine.Out",
  });
  const timer = scene.time.delayedCall(Math.max(1100, holdMs || 0), () => {
    scene.tweens.add({
      targets: nodes,
      alpha: 0,
      duration: 160,
      ease: "Sine.In",
      onComplete: dispose,
    });
  });
  scene.events.once("shutdown", dispose);
  function dispose() {
    if (disposed) return;
    disposed = true;
    timer.remove(false);
    scene.events.off("shutdown", dispose);
    scene.tweens.killTweensOf(nodes);
    for (const node of nodes) node.destroy();
  }
  return { dispose, nodes };
}
