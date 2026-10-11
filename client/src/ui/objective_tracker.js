import { element } from "./viewport_dialog.js";

// Both field scenes use this same collapsible tracker and journal entry point.
export function objectiveTracker(openJournal) {
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
  root.append(toggle, details);
  return {
    root,
    update(heading, body) {
      title.textContent = heading;
      detail.textContent = body;
    },
  };
}
