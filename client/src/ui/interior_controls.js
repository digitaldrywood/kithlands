import { objectiveTracker } from "./objective_tracker.js";
import "../styles/exploration-hud.css";
import { element } from "./viewport_dialog.js";
import { activeWorldLocks, isWorldInputLocked } from "../systems/modalLock.js";
import "../styles/interior-controls.css";

// One fixed DOM entry point, outside the room camera and its hit areas.
export function interiorControls(
  scene,
  openMenu,
  { label = "Interior controls", contextAction, objective, openJournal } = {},
) {
  const root = element("nav", "interior-controls");
  root.setAttribute("aria-label", label);
  const button = element("button", "interior-menu-button", "Menu ");
  button.type = "button";
  button.setAttribute("aria-keyshortcuts", "M");
  button.append(element("kbd", "", "M"));
  button.onclick = openMenu;
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  });
  root.append(button);
  const tracker = objective
    ? objectiveTracker(openJournal, {
        onDismiss: () => {
          const canvas = scene.game.canvas;
          if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = -1;
          canvas.focus({ preventScroll: true });
        },
      })
    : null;
  if (tracker) root.append(tracker.root);
  let lastObjective = "";
  const refreshObjective = () => {
    if (!tracker) return;
    const selected = objective();
    const key = JSON.stringify([selected.title, selected.detail]);
    if (key === lastObjective) return;
    lastObjective = key;
    tracker.update(selected.title, selected.detail);
  };
  refreshObjective();
  const action = contextAction
    ? element("button", "interior-action-button")
    : null;
  let currentAction = null;
  if (action) {
    action.type = "button";
    action.hidden = true;
    action.setAttribute("aria-keyshortcuts", "Enter Space");
    action.onclick = () => {
      if (!isWorldInputLocked(scene)) currentAction?.activate();
    };
    action.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
    });
    root.append(action);
  }
  for (const event of ["pointerdown", "pointerup", "click", "wheel"])
    root.addEventListener(event, (e) => e.stopPropagation());
  document.body.append(root);
  let canvasRect;
  const position = () => {
    const r = scene.game.canvas.getBoundingClientRect();
    canvasRect = r;
    Object.assign(root.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    if (action && scene.gameplayLayout?.portrait) {
      const layout = scene.gameplayLayout;
      action.style.bottom = `${((layout.height - layout.controlArea.dpadTop) * r.height) / layout.height + 12}px`;
    }
  };
  let objectiveHeaderBottom = 0;
  const update = () => {
    root.hidden = activeWorldLocks(scene).length > 0 || !scene.scene.isActive();
    refreshObjective();
    if (tracker) {
      const rect = canvasRect;
      const fixedHeader = [...(scene.labelBar || [])];
      if (scene.dungeonEntryButton?.bg?.active)
        fixedHeader.push(scene.dungeonEntryButton.bg);
      // Trail controls hide during steps. Retain their lane so the objective
      // does not jump up and down with every movement/input lock.
      objectiveHeaderBottom = Math.max(
        objectiveHeaderBottom,
        ...fixedHeader.map((o) => o.getBounds().bottom),
      );
      const top = `${Math.max(12, (objectiveHeaderBottom * rect.height) / scene.scale.gameSize.height + 8)}px`;
      if (tracker.root.style.top !== top) tracker.root.style.top = top;
    }
    if (action) {
      currentAction = contextAction();
      action.hidden = !currentAction;
      action.disabled = isWorldInputLocked(scene);
      if (
        currentAction &&
        action.getAttribute("aria-label") !== currentAction.label
      ) {
        action.setAttribute("aria-label", currentAction.label);
        action.replaceChildren(
          document.createTextNode(currentAction.label + " "),
          element("kbd", "", "Enter"),
        );
      }
    }
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
  return { dispose, refreshObjective };
}
