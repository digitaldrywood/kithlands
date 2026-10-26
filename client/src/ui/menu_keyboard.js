import "../styles/menu-keyboard.css";

const keys = [..."123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const isTyping = (target) =>
  target?.closest?.("input, textarea, select, [contenteditable='true']");
export const visibleControls = (root) =>
  [
    ...root.querySelectorAll(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex='0']",
    ),
  ].filter(
    (node) =>
      !node.hidden && node.getClientRects().length && node.tabIndex !== -1,
  );

export function shortcutBadge(button, key, label = key) {
  button.setAttribute("aria-keyshortcuts", key);
  let badge = button.querySelector(".menu-shortcut");
  if (!badge) {
    badge = document.createElement("kbd");
    badge.className = "menu-shortcut";
    badge.setAttribute("aria-hidden", "true");
    button.append(badge);
  }
  if (badge.textContent !== label) badge.textContent = label;
}

// Alt shortcuts avoid collisions with existing letter commands and text entry.
// The observer covers menus that rebuild after purchases, selection or crafting.
export function menuKeyboard(root, { scope = () => root } = {}) {
  let shortcuts = new Map();
  function refresh() {
    shortcuts = new Map();
    let index = 0;
    for (const button of root.querySelectorAll("button")) {
      if (!button.getClientRects().length) continue;
      const existing = button.querySelector("kbd:not(.menu-shortcut)");
      if (existing) {
        const key = existing.textContent.trim();
        button.setAttribute(
          "aria-keyshortcuts",
          key === "Esc" ? "Escape" : key,
        );
        continue;
      }
      const label =
        button.getAttribute("aria-label") ||
        button.childNodes[0]?.textContent ||
        "";
      if (/^(Back|Close|Cancel|Leave)(\s|$)/i.test(label)) {
        shortcutBadge(button, "Escape", "Esc");
        continue;
      }
      const key = keys[index++];
      if (!key) continue; // Long inventories remain reachable with Tab.
      shortcutBadge(button, `Alt+${key}`);
      shortcuts.set(key.toLowerCase(), button);
    }
  }
  const observer = new MutationObserver(refresh);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden", "open"],
  });
  refresh();
  function handle(event) {
    const current = scope();
    if (event.key === "Escape") {
      const back = [
        ...current.querySelectorAll("button[aria-keyshortcuts=Escape]"),
      ].find((node) => !node.disabled && node.getClientRects().length);
      if (!back) return false;
      event.preventDefault();
      if (!event.repeat) back.click();
      return true;
    }
    if (event.key === "Tab") {
      const controls = visibleControls(current);
      const index = controls.indexOf(document.activeElement);
      if (
        index < 0 ||
        (event.shiftKey && index === 0) ||
        (!event.shiftKey && index === controls.length - 1)
      ) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0])?.focus({
          preventScroll: false,
        });
      }
      return true;
    }
    if (["Enter", " "].includes(event.key)) {
      const button = event.target?.closest?.("button");
      // Phaser captures Space's keyup even while its input is paused. Own
      // button activation on keydown so native menus work consistently, and
      // prevent the browser's later default click from submitting twice.
      if (button && current.contains(button)) {
        event.preventDefault();
        if (!event.repeat && !button.disabled) button.click();
        return true;
      }
      if (event.repeat) {
        event.preventDefault();
        return true;
      }
    }
    // Only opt-in button groups own arrows. Native fields keep their editing
    // and selection keys, and browsing never activates a costly action.
    if (
      !isTyping(event.target) &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      const group = event.target?.closest?.("[data-menu-arrows]");
      if (group && current.contains(group)) {
        const style = getComputedStyle(group);
        // Responsive lists may switch from grid/block to a horizontal flex
        // strip. grid-template-columns still has a computed value in flex;
        // only use it when the browser is actually laying out a grid.
        const bounded = group.dataset.menuArrows === "grid";
        const grid = bounded && ["grid", "inline-grid"].includes(style.display);
        const horizontal =
          group.dataset.menuArrows === "horizontal" ||
          (bounded &&
            style.display === "flex" &&
            !style.flexDirection.startsWith("column"));
        const columns = grid
          ? Math.max(1, style.gridTemplateColumns.split(/\s+/).length)
          : 1;
        const steps = grid
          ? {
              ArrowUp: -columns,
              ArrowDown: columns,
              ArrowLeft: -1,
              ArrowRight: 1,
            }
          : horizontal
            ? { ArrowLeft: -1, ArrowRight: 1 }
            : { ArrowUp: -1, ArrowDown: 1 };
        if (event.key in steps || ["Home", "End"].includes(event.key)) {
          const controls = visibleControls(group).filter(
            (node) => node.closest("[data-menu-arrows]") === group,
          );
          const index = controls.indexOf(document.activeElement);
          if (index >= 0 && controls.length) {
            let target =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? controls.length - 1
                  : index + steps[event.key];
            if (bounded) {
              const crossesRow =
                grid &&
                ["ArrowLeft", "ArrowRight"].includes(event.key) &&
                Math.floor(target / columns) !== Math.floor(index / columns);
              if (target < 0 || target >= controls.length || crossesRow)
                target = index;
            } else target = (target + controls.length) % controls.length;
            event.preventDefault();
            controls[target].focus();
            return true;
          }
        }
      }
    }
    if (
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      isTyping(event.target)
    )
      return false;
    refresh();
    const button = shortcuts.get(
      (/^(Key[A-Z]|Digit[0-9])$/.test(event.code)
        ? event.code.replace(/^(Key|Digit)/, "")
        : event.key
      ).toLowerCase(),
    );
    if (!button || !current.contains(button)) return false;
    event.preventDefault();
    if (!event.repeat && !button.disabled) {
      button.focus({ preventScroll: false });
      button.click();
    }
    return true;
  }
  return { handle, refresh, destroy: () => observer.disconnect() };
}
