import { topWorldLock } from "../systems/modalLock.js";

const SHORTCUTS = [..."123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
export function registerCanvasButton(
  scene,
  {
    bg,
    label,
    activate,
    enabled,
    focus,
    blur,
    width,
    height,
    inline = false,
    shortcut = null,
  },
) {
  // Unit shims do not own a browser or Phaser scene lifecycle.
  if (typeof window === "undefined" || !scene.sys?.events) return;
  let manager = scene.canvasMenuKeyboard;
  if (!manager) {
    const entries = [];
    let focused = null;
    const active = () => {
      if (
        !scene.sys.isActive() ||
        scene.input?.enabled === false ||
        (scene.animating && !topWorldLock(scene))
      )
        return [];
      if (
        document.querySelector(
          ".kith-viewport-dialog, .kith-equipment-screen, .kith-gem-workshop, .kith-title-screen, .battle-choice-panel",
        )
      )
        return [];
      const lock = topWorldLock(scene);
      if (!lock && !["Battle", "Wizard"].includes(scene.sys.settings.key))
        return [];
      return entries.filter(
        (e) =>
          e.lock === lock &&
          e.bg.active &&
          e.bg.visible &&
          e.label.visible &&
          e.enabled(),
      );
    };
    const keydown = (event) => {
      if (event.ctrlKey || event.metaKey) return;
      const editing = event.target?.closest?.(
        "input, textarea, select, [contenteditable='true']",
      );
      if (editing && event.key !== "Tab") return;
      const controls = active();
      if (!controls.length) return;
      const fields = [
        ...(scene.game.domContainer?.querySelectorAll(
          "input, select, textarea",
        ) || []),
      ].filter((node) => !node.disabled && node.getClientRects().length);
      if (event.key === "Tab" && fields.length) {
        const fieldIndex = fields.indexOf(document.activeElement);
        if (
          editing &&
          ((event.shiftKey && fieldIndex > 0) ||
            (!event.shiftKey && fieldIndex < fields.length - 1))
        )
          return;
        if (
          !editing &&
          ((event.shiftKey && focused === controls[0]) ||
            (!event.shiftKey && focused === controls.at(-1)))
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          focused?.blur();
          focused = null;
          (event.shiftKey ? fields.at(-1) : fields[0]).focus();
          return;
        }
        if (editing) {
          document.activeElement.blur();
          focused = null;
        }
      }
      let next;
      if (
        event.key === "Tab" &&
        ["item_menu", "field_magic", "formation_menu"].includes(
          topWorldLock(scene),
        )
      )
        return;
      if (event.key === "Tab") {
        const index = controls.indexOf(focused);
        next =
          controls[
            index < 0
              ? event.shiftKey
                ? controls.length - 1
                : 0
              : (index + (event.shiftKey ? -1 : 1) + controls.length) %
                controls.length
          ];
      } else if (event.altKey && !event.shiftKey) {
        next = controls.find(
          (e) =>
            e.alt &&
            e.key.toLowerCase() ===
              (/^(Key[A-Z]|Digit[0-9])$/.test(event.code)
                ? event.code.replace(/^(Key|Digit)/, "")
                : event.key
              ).toLowerCase(),
        );
      } else if (
        ["Enter", " "].includes(event.key) &&
        controls.includes(focused)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) focused.activate();
        return;
      }
      if (!next) {
        if (event.altKey) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      focused?.blur();
      focused = next;
      next.focus();
      if (event.altKey && !event.repeat) next.activate();
    };
    const update = () => {
      for (const entry of entries) {
        entry.badge.setVisible(entry.bg.visible && entry.label.visible);
        entry.badge.setPosition(
          entry.inline ? entry.bg.x - entry.width / 2 + 6 : entry.bg.x,
          entry.bg.y + (entry.inline ? 0 : entry.height * 0.27),
        );
        entry.badge.setDepth(entry.label.depth + 1);
      }
    };
    window.addEventListener("keydown", keydown, true);
    scene.events.on("postupdate", update);
    scene.events.once("shutdown", () => {
      window.removeEventListener("keydown", keydown, true);
      scene.events.off("postupdate", update);
      scene.canvasMenuKeyboard = null;
    });
    manager = scene.canvasMenuKeyboard = {
      entries,
      forget: (entry) => {
        if (focused === entry) focused = null;
      },
    };
  }
  const lock = topWorldLock(scene);
  const used = new Set(
    manager.entries.filter((e) => e.lock === lock).map((e) => e.key),
  );
  const key = shortcut || SHORTCUTS.find((k) => !used.has(k));
  if (!key) return;
  const badge = scene.add
    .text(bg.x, bg.y + height * 0.27, shortcut ? key : `Alt+${key}`, {
      fontFamily: "Arial, sans-serif",
      fontSize: `${Math.max(8, Math.min(20, height * 0.2))}px`,
      color: "#c9b589",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(label.depth + 1);
  // Separate the label and hint into two lines within the original hitbox.
  if (inline) {
    badge.setOrigin(0, 0.5);
    label.x += 36;
  } else label.y -= height * 0.13;
  const entry = {
    bg,
    label,
    activate,
    enabled,
    focus,
    blur,
    badge,
    lock,
    key,
    height,
    width,
    inline,
    alt: !shortcut,
  };
  bg.__kithlandsKeyboard = { shortcut: shortcut || `Alt+${key}` };
  manager.entries.push(entry);
  bg.once("destroy", () => {
    manager.forget(entry);
    manager.entries.splice(manager.entries.indexOf(entry), 1);
    badge.destroy();
  });
}
