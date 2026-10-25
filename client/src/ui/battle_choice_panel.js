import { element } from "./viewport_dialog.js";
import "../styles/battle-choice-panel.css";
import { shortcutBadge, visibleControls } from "./menu_keyboard.js";

// Contextual battle UI occupies only the existing command/message strip.
export function battleChoicePanel(scene, { title, choices, onBack }) {
  const root = element("section", "battle-choice-panel");
  root.setAttribute("aria-label", title);
  const header = element("header");
  const heading = element("strong", "", title);
  const back = element("button", "battle-choice-back", "Back");
  back.type = "button";
  back.onclick = onBack;
  shortcutBadge(back, "Escape", "Esc");
  header.append(heading, back);
  const list = element("div", "battle-choice-list");
  const detail = element("p", "battle-choice-detail");
  detail.setAttribute("aria-live", "polite");
  let selected = Math.max(
    0,
    choices.findIndex((choice) => !choice.disabled),
  );
  const buttons = choices.map((choice, index) => {
    const button = element("button", "battle-choice", choice.label);
    button.type = "button";
    button.disabled = !!choice.disabled;
    button.onclick = choice.action;
    if (index < 9) {
      shortcutBadge(button, String(index + 1));
      button.prepend(button.querySelector(".menu-shortcut"));
    }
    const inspect = () => {
      selected = index;
      choice.onInspect?.();
      detail.textContent = choice.detail || "";
      buttons.forEach((row, i) =>
        row.classList.toggle("is-selected", i === index),
      );
    };
    button.onfocus = inspect;
    button.onpointerenter = () => {
      if (!button.disabled) button.focus({ preventScroll: true });
    };
    list.append(button);
    return button;
  });
  detail.textContent = choices[selected]?.detail || "No choices available.";
  root.append(header, list, detail);
  document.body.append(root);
  for (const event of ["pointerdown", "pointerup", "click", "wheel"])
    root.addEventListener(event, (e) => e.stopPropagation());
  const position = () => {
    const canvas = scene.game.canvas.getBoundingClientRect();
    const layout = scene.hudLayout;
    const x = Math.min(layout.command.x, layout.message.x);
    const y = Math.min(layout.command.y, layout.message.y);
    const width =
      Math.max(
        layout.command.x + layout.command.width,
        layout.message.x + layout.message.width,
      ) - x;
    const height =
      Math.max(
        layout.command.y + layout.command.height,
        layout.message.y + layout.message.height,
      ) - y;
    Object.assign(root.style, {
      left: `${canvas.left + (x * canvas.width) / layout.gameWidth}px`,
      top: `${canvas.top + (y * canvas.height) / layout.gameHeight}px`,
      width: `${(width * canvas.width) / layout.gameWidth}px`,
      height: `${(height * canvas.height) / layout.gameHeight}px`,
    });
  };
  const observer = new ResizeObserver(position);
  observer.observe(scene.game.canvas);
  window.addEventListener("resize", position);
  position();
  const keydown = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (
      ![
        "Escape",
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
        " ",
        "Tab",
        ..."123456789",
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat && !e.key.startsWith("Arrow")) return;
    if (e.key === "Tab") {
      const controls = visibleControls(root);
      const index = controls.indexOf(document.activeElement);
      const next =
        index < 0
          ? e.shiftKey
            ? controls.length - 1
            : 0
          : (index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
      return controls[next]?.focus({ preventScroll: false });
    }
    if (e.key === "Escape") return onBack();
    if (["Enter", " "].includes(e.key)) {
      const focused = document.activeElement;
      return root.contains(focused) && focused.tagName === "BUTTON"
        ? focused.click()
        : buttons[selected]?.click();
    }
    if (/^[1-9]$/.test(e.key)) {
      const choice = choices[Number(e.key) - 1];
      return choice && !choice.disabled && choice.action();
    }
    const step = ["ArrowUp", "ArrowLeft"].includes(e.key) ? -1 : 1;
    for (let i = 0; i < choices.length; i++) {
      selected = (selected + step + choices.length) % choices.length;
      if (!choices[selected].disabled) {
        buttons[selected].focus();
        break;
      }
    }
  };
  window.addEventListener("keydown", keydown, true);
  buttons[selected]?.classList.add("is-selected");
  // Preserve input continuity without scrolling the page on creation.
  if (!buttons[selected]?.disabled)
    buttons[selected]?.focus({ preventScroll: true });
  else back.focus({ preventScroll: true });
  let disposed = false;
  return {
    destroy() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("keydown", keydown, true);
      root.remove();
    },
  };
}
