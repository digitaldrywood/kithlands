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
    attributeFilter: ["disabled", "hidden"],
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
    if (["Enter", " "].includes(event.key) && event.repeat) {
      event.preventDefault();
      return true;
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
