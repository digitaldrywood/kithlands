import { element } from "./viewport_dialog.js";
import "../styles/battle-choice-panel.css";

// Contextual battle UI occupies only the existing command/message strip.
export function battleChoicePanel(scene, { title, choices, onBack }) {
  const root = element("section", "battle-choice-panel");
  root.setAttribute("aria-label", title);
  const header = element("header");
  const heading = element("strong", "", title);
  const back = element("button", "battle-choice-back", "Back");
  back.type = "button";
  back.onclick = onBack;
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
    const inspect = () => {
      selected = index;
      choice.onInspect?.();
      detail.textContent = choice.detail || "";
      buttons.forEach((row, i) =>
        row.classList.toggle("is-selected", i === index),
      );
    };
    button.onfocus = inspect;
    button.onpointerenter = inspect;
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
    const x = layout.command.x;
    const y = layout.message.y;
    const width = layout.message.x + layout.message.width - x;
    Object.assign(root.style, {
      left: `${canvas.left + (x * canvas.width) / layout.gameWidth}px`,
      top: `${canvas.top + (y * canvas.height) / layout.gameHeight}px`,
      width: `${(width * canvas.width) / layout.gameWidth}px`,
      height: `${(layout.message.height * canvas.height) / layout.gameHeight}px`,
    });
  };
  const observer = new ResizeObserver(position);
  observer.observe(scene.game.canvas);
  window.addEventListener("resize", position);
  position();
  const keydown = (e) => {
    if (
      ![
        "Escape",
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
        ..."123456789",
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") return onBack();
    if (e.key === "Enter" && document.activeElement === back) return onBack();
    if (e.key === "Enter")
      return !choices[selected]?.disabled && choices[selected]?.action();
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
