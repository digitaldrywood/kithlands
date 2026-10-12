import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import "../styles/viewport-dialog.css";
import { menuKeyboard } from "./menu_keyboard.js";

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// A small viewport-sized DOM boundary. Phaser still owns scene lifetime.
export function viewportDialog(scene, { key, title, onEscape, onKey }) {
  const previousFocus = document.activeElement;
  const inputEnabled = scene.input.enabled;
  const keyboardEnabled = scene.input.keyboard?.enabled;
  const root = element("section", "kith-viewport-dialog");
  root.dataset.dialog = key;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", `${key}-title`);
  root.tabIndex = -1;
  const panel = element("div", "viewport-dialog-panel");
  const header = element("header", "viewport-dialog-header");
  const heading = element("h1", "", title);
  heading.id = `${key}-title`;
  header.append(heading);
  const body = element("div", "viewport-dialog-body");
  const footer = element("footer", "viewport-dialog-footer");
  panel.append(header, body, footer);
  root.append(panel);
  (document.querySelector("#game-ui") || document.body).append(root);
  pauseWorldFor(scene, key);
  // Phaser discards keyup while disabled. Clear any direction held when the
  // dialog opens so it cannot remain latched after a release inside the UI.
  scene.input.keyboard?.resetKeys();
  scene.input.enabled = false;
  if (scene.input.keyboard) scene.input.keyboard.enabled = false;
  let disposed = false;
  const menuKeys = menuKeyboard(root);

  for (const type of ["pointerdown", "pointerup", "click", "wheel"]) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }
  function keydown(event) {
    // Capture before Phaser's window listeners, including the closing Escape.
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape?.();
    } else if (!menuKeys.handle(event)) {
      onKey?.(event);
    }
  }
  window.addEventListener("keydown", keydown, true);
  const shutdown = () => dispose();
  scene.events.once("shutdown", shutdown);
  root.focus();

  function dispose() {
    if (disposed) return;
    disposed = true;
    menuKeys.destroy();
    window.removeEventListener("keydown", keydown, true);
    scene.events.off("shutdown", shutdown);
    root.remove();
    // Reconcile again before restoring input, including scene shutdown.
    scene.input.keyboard?.resetKeys();
    scene.input.enabled = inputEnabled;
    if (scene.input.keyboard && keyboardEnabled != null)
      scene.input.keyboard.enabled = keyboardEnabled;
    resumeWorldFor(scene, key);
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  return {
    root,
    heading,
    header,
    body,
    footer,
    dispose,
    get disposed() {
      return disposed;
    },
  };
}
