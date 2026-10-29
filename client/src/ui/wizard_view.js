import { element, viewportDialog } from "./viewport_dialog.js";
import "../styles/wizard.css";

export function wizardView(scene, title, description, onEnter, onBack) {
  const dialog = viewportDialog(scene, {
    key: "locality-wizard",
    title,
    onEscape: () => {
      if (!scene.wizardCreateBusy) (onBack || (() => scene.goBack()))();
    },
    onKey: (event) => {
      const select = event.target;
      if (
        select?.tagName === "SELECT" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
      ) {
        event.preventDefault();
        const last = select.options.length - 1;
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : Math.max(
                  0,
                  Math.min(
                    last,
                    select.selectedIndex + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                );
        select.selectedIndex = index;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (event.key === "Enter" && event.target?.tagName === "INPUT") {
        event.preventDefault();
        if (!event.repeat) onEnter?.();
      }
    },
  });
  dialog.root.classList.add("wizard-dialog");
  dialog.header.append(element("p", "", description));
  scene.wizardDialog = dialog;
  return dialog;
}

export function wizardButton(parent, label, action, primary = false) {
  const button = element("button", primary ? "primary" : "", label);
  button.type = "button";
  button.dataset.wizardLabel = label;
  button.addEventListener("click", action);
  parent.append(button);
  return button;
}

export function wizardInput(parent, label, placeholder, value = "") {
  const field = element("label", "wizard-field");
  field.append(element("span", "", label));
  const input = element("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value;
  field.append(input);
  parent.append(field);
  return input;
}

export function wizardStatus(parent, text = "", error = false) {
  const status = element("p", `dialog-status${error ? " is-error" : ""}`, text);
  status.setAttribute("role", error ? "alert" : "status");
  parent.append(status);
  return status;
}

export function wizardPartyRow(parent, slot, classList, index) {
  const row = element("section", "wizard-member");
  const avatar = element("img");
  avatar.src = `/sprites/${slot.class_id}.png`;
  avatar.alt = "";
  row.append(avatar);
  const fields = element("div", "wizard-member-fields");
  const name = wizardInput(
    fields,
    index === 0 ? "Party leader" : `Companion ${index}`,
    `Name (${slot.defName})`,
    slot.name,
  );
  const field = element("label", "wizard-field");
  field.append(element("span", "", "Character class"));
  const select = element("select");
  select.setAttribute("aria-label", "Character class");
  for (const id of classList) {
    const option = element("option", "", id[0].toUpperCase() + id.slice(1));
    option.value = id;
    select.append(option);
  }
  select.value = classList.includes(slot.class_id)
    ? slot.class_id
    : classList[0];
  select.addEventListener("change", () => {
    avatar.src = `/sprites/${select.value}.png`;
  });
  field.append(select);
  fields.append(field);
  row.append(fields);
  parent.append(row);
  return { name, select };
}
