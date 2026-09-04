import { element, viewportDialog } from "../ui/viewport_dialog.js";
import { toggleMenu } from "./world_menu.js";
import { OPTIONS_ROWS, nudgeOption } from "./options_settings.js";

export function showOptions(scene) {
  if (scene.optionsDialog && !scene.optionsDialog.disposed)
    return scene.optionsDialog;
  let focusedIdx = 0;
  const rows = [];
  const dialog = viewportDialog(scene, {
    key: "options",
    title: "Options",
    onEscape: () => close(),
    onKey: (event) => {
      if (
        !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      event.preventDefault();
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        focusedIdx =
          (focusedIdx + (event.key === "ArrowDown" ? 1 : -1) + rows.length) %
          rows.length;
        rows[focusedIdx].card.focus();
      } else {
        nudge(focusedIdx, event.key === "ArrowRight" ? 1 : -1);
      }
    },
  });
  scene.optionsDialog = dialog;
  dialog.header.append(element("p", "", "Preferences save automatically."));
  dialog.header.append(
    element(
      "p",
      "options-speed-hint",
      "Speeds: 1 is fastest · Higher is slower",
    ),
  );
  const list = element("div", "options-rows");
  dialog.body.append(list);
  for (const [index, row] of OPTIONS_ROWS.entries()) {
    const card = element("section", "options-row");
    card.dataset.option = row.key;
    card.tabIndex = 0;
    card.setAttribute("aria-label", row.label);
    card.addEventListener("focusin", () => {
      focusedIdx = index;
    });
    const label = element("div", "options-label");
    const title = element("h2", "", row.label);
    const value = element("output");
    value.setAttribute("aria-live", "polite");
    const stepper = element("div", "options-stepper");
    const decrease = element("button", "", "−");
    decrease.setAttribute("aria-label", `Decrease ${row.label.toLowerCase()}`);
    const increase = element("button", "", "+");
    increase.setAttribute("aria-label", `Increase ${row.label.toLowerCase()}`);
    const progress = element("progress");
    progress.max = row.max;
    progress.setAttribute("aria-label", row.label);
    decrease.addEventListener("click", () => nudge(index, -1));
    increase.addEventListener("click", () => nudge(index, 1));
    label.append(title, value);
    stepper.append(decrease, progress, increase);
    const hint = element("p");
    card.append(label, stepper, hint);
    list.append(card);
    const refresh = () => {
      const current = row.get();
      value.textContent = row.format
        ? row.format(current)
        : `${current} / ${row.max}`;
      progress.value = current;
      decrease.disabled = current <= row.min;
      increase.disabled = current >= row.max;
      hint.textContent =
        row.key === "cinematics"
          ? [
              "Auto-skip long cinematics.",
              "Play long cinematics once per battle.",
              "Always play long cinematics.",
            ][current - 1]
          : "";
    };
    rows.push({ card, refresh });
    refresh();
  }
  function nudge(index, delta) {
    focusedIdx = index;
    nudgeOption(OPTIONS_ROWS[index], delta);
    rows[index].refresh();
  }
  function close() {
    if (dialog.disposed) return;
    dialog.dispose();
    toggleMenu(scene);
  }
  const back = element("button", "primary", "Back to Party");
  back.addEventListener("click", close);
  dialog.footer.append(
    element("p", "options-key-hint", "↑ ↓ Select · ← → Adjust · Esc Back"),
    back,
  );
  rows[0].card.focus();
  return dialog;
}
