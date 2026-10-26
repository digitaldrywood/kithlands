import { element } from "./viewport_dialog.js";
import { activeWorldLocks } from "../systems/modalLock.js";
import "../styles/interior-controls.css";

// One fixed DOM entry point, outside the room camera and its hit areas.
export function interiorControls(scene, openMenu) {
  const root = element("nav", "interior-controls");
  root.setAttribute("aria-label", "Interior controls");
  const button = element("button", "interior-menu-button", "Menu ");
  button.type = "button";
  button.setAttribute("aria-keyshortcuts", "M");
  button.append(element("kbd", "", "M"));
  button.onclick = openMenu;
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  });
  root.append(button);
  for (const event of ["pointerdown", "pointerup", "click", "wheel"])
    root.addEventListener(event, (e) => e.stopPropagation());
  document.body.append(root);
  const position = () => {
    const r = scene.game.canvas.getBoundingClientRect();
    Object.assign(root.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };
  const update = () => {
    root.hidden = activeWorldLocks(scene).length > 0 || !scene.scene.isActive();
  };
  const hide = () => {
    root.hidden = true;
  };
  const observer = new ResizeObserver(position);
  observer.observe(scene.game.canvas);
  scene.events.on("update", update);
  scene.events.on("pause", hide);
  scene.events.on("sleep", hide);
  window.addEventListener("resize", position);
  position();
  update();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.events.off("shutdown", dispose);
    scene.events.off("destroy", dispose);
    observer.disconnect();
    window.removeEventListener("resize", position);
    scene.events.off("update", update);
    scene.events.off("pause", hide);
    scene.events.off("sleep", hide);
    root.remove();
    scene.interiorMenuHUD = null;
  };
  scene.events.once("shutdown", dispose);
  scene.events.once("destroy", dispose);
  return { dispose };
}
