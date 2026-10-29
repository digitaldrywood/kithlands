import { element } from "./viewport_dialog.js";

// Both field scenes use this same collapsible tracker and journal entry point.
export function objectiveTracker(openJournal, { onDismiss } = {}) {
  const root = element("div", "explore-objective explore-surface");
  root.dataset.objectiveTracker = "true";
  const toggle = element("button", "explore-disclosure", "Objective ▾");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  const details = element("div", "explore-objective-details");
  details.hidden = true;
  const title = element("strong");
  const detail = element("p");
  const journal = element("button", "explore-disclosure", "Quest journal");
  journal.type = "button";
  journal.onclick = openJournal;
  details.append(title, detail, journal);
  toggle.onclick = () => {
    details.hidden = !details.hidden;
    toggle.setAttribute("aria-expanded", String(!details.hidden));
    toggle.textContent = details.hidden ? "Objective ▾" : "Objective ▴";
  };
  // Native disclosure buttons own their keys; Enter/Space must not also
  // activate a nearby landmark through the canvas keyboard listener.
  root.addEventListener("keydown", (event) => {
    // Keep movement/selection keys local, but retain the scene's Menu shortcut
    // after Escape returns focus to the disclosure button.
    if (event.key.toLowerCase() !== "m") event.stopPropagation();
    if (event.key === "Escape" && !details.hidden) {
      event.preventDefault();
      toggle.click();
      if (onDismiss) onDismiss();
      else toggle.focus();
    }
  });
  root.addEventListener("keyup", (event) => {
    // Phaser also captures Space on keyup, when native buttons activate.
    if ([" ", "Enter"].includes(event.key)) event.stopPropagation();
  });
  root.append(toggle, details);
  return {
    root,
    update(heading, body) {
      title.textContent = heading;
      detail.textContent = body;
    },
  };
}
