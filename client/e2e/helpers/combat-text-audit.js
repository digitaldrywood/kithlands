import { expect } from "@playwright/test";

// Read-only post-render measurements; no fabricated results or combat state.
export function installCombatTextAudit({ gameKey }) {
  const game = window[gameKey];
  const audit = (window.__combatTextAudit = {
    labels: [],
    pairs: [],
    messages: [],
  });
  const capture = () => {
    const scene = game.scene.getScene("Battle");
    const ratio =
      game.canvas.getBoundingClientRect().width / scene.scale.gameSize.width;
    if (scene.messageWindow?.text?.text)
      audit.messages.push(
        parseFloat(scene.messageWindow.text.style.fontSize) * ratio,
      );
    const labels = (scene.floatingText?.active || []).filter(
      (t) => t.visible && t.alpha > 0.9,
    );
    for (const text of labels) {
      const bounds = text.getBounds();
      const enemy = text._targetKey?.startsWith("enemy_")
        ? scene.enemySprites?.[text._targetKey.slice(6)]
        : null;
      const name = enemy?.nameText;
      audit.labels.push({
        text: text.text,
        type: text._resultType,
        css: parseFloat(text.style.fontSize) * ratio,
        top: bounds.top,
        left: bounds.left,
        right: bounds.right,
        width: scene.scale.gameSize.width,
        nameGap: name?.visible ? name.getBounds().top - bounds.bottom : null,
        nameCSS: name?.visible ? parseFloat(name.style.fontSize) * ratio : null,
      });
      if (text._resultType === "defeated") {
        for (const number of labels.filter(
          (t) =>
            t._targetKey === text._targetKey && t._resultType !== "defeated",
        ))
          audit.pairs.push(bounds.top - number.getBounds().bottom);
      }
    }
  };
  window.__combatTextAuditStop = () => game.events.off("postrender", capture);
  game.events.on("postrender", capture);
}

export async function collectCombatTextAudit(page) {
  return page.evaluate(() => {
    window.__combatTextAuditStop();
    return window.__combatTextAudit;
  });
}

export function expectReadableCombatText(audit) {
  expect(audit.labels.length).toBeGreaterThan(0);
  expect(audit.messages.length).toBeGreaterThan(0);
  expect(Math.min(...audit.messages)).toBeGreaterThanOrEqual(16);
  for (const label of audit.labels) {
    expect(label.css, label.text).toBeGreaterThanOrEqual(
      label.type === "crit" ? 18 : 16,
    );
    expect(label.top, label.text).toBeGreaterThanOrEqual(-0.1);
    expect(label.left, label.text).toBeGreaterThanOrEqual(-0.1);
    expect(label.right, label.text).toBeLessThanOrEqual(label.width + 0.1);
    if (label.nameGap !== null) {
      expect(label.nameGap, label.text).toBeGreaterThan(8);
      expect(label.nameCSS).toBeGreaterThanOrEqual(12);
    }
  }
  for (const gap of audit.pairs) expect(gap).toBeGreaterThan(8);
}
