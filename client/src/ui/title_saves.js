import { element } from "./viewport_dialog.js";

const savedAt = (save) => Date.parse(save.updated_at) || 0;
export function groupSaveAdventures(saves) {
  const groups = new Map();
  for (const save of saves) {
    const identity = save.adventure_id || save.id;
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(save);
  }
  return [...groups.values()]
    .map((group) =>
      group.sort((a, b) => savedAt(b) - savedAt(a) || a.id.localeCompare(b.id)),
    )
    .sort(
      (a, b) => savedAt(b[0]) - savedAt(a[0]) || a[0].id.localeCompare(b[0].id),
    );
}

function saveButton(
  save,
  load,
  latest = false,
  recent = false,
  name = save.name,
) {
  const button = element("button", "title-save");
  button.type = "button";
  button.dataset.saveId = save.id;
  const kind = save.save_type === "autosave" ? "Autosave" : "Manual save";
  button.append(
    element(
      "span",
      "save-label",
      `${recent ? "Most recent adventure" : latest ? "Latest save" : "Earlier save"} · ${kind}`,
    ),
  );
  button.append(element("strong", "", latest ? `Continue ${name}` : save.name));
  const time = element("time", "save-time");
  if (savedAt(save)) {
    time.dateTime = save.updated_at;
    time.textContent = new Date(save.updated_at).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  } else time.textContent = "Save time unavailable";
  button.append(
    time,
    element("span", "save-party", (save.party || []).join(", ")),
  );
  button.addEventListener("click", () => load(save.id));
  return button;
}

export function renderSaveAdventures(list, saves, load) {
  list.replaceChildren();
  const groups = groupSaveAdventures(saves);
  groups.forEach(([latest, ...older], index) => {
    const adventure = element("article", "title-adventure");
    const name =
      [latest, ...older].find((save) => save.save_type !== "autosave")?.name ||
      latest.name;
    adventure.append(saveButton(latest, load, true, index === 0, name));
    if (older.length) {
      const history = element("details", "save-history");
      const summary = element(
        "summary",
        "",
        `Save history (${older.length} older)`,
      );
      const hint = element("kbd", "menu-shortcut", "Enter / Space");
      hint.setAttribute("aria-hidden", "true");
      summary.append(hint);
      history.append(summary);
      for (const save of older) history.append(saveButton(save, load));
      history.addEventListener("toggle", () => {
        if (history.open)
          history.querySelector("button")?.scrollIntoView({ block: "nearest" });
      });
      adventure.append(history);
    }
    list.append(adventure);
  });
}
