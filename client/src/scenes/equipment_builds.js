import {
  saveEquipmentBuild,
  previewEquipmentBuild,
  applyEquipmentBuild,
  deleteEquipmentBuild,
} from "../api.js";

// Wording only: ownership, validity and moves come entirely from Go.
export function equipmentBuildMoveLabel(change) {
  return `${change.character_name} · ${change.slot_name}: ${change.from?.name || "Empty"} → ${change.to?.name || "Empty"}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function renderEquipmentBuilds(state, render, close) {
  const backdrop = el("div", "equipment-build-backdrop");
  const panel = el("section", "equipment-build-dialog");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "equipment-build-title");
  const heading = el(
    "h2",
    "",
    `Saved builds · ${state.scene.gameState.party[state.partyIndex].name}`,
  );
  heading.id = "equipment-build-title";
  const action = (label, run, key, primary = false) => {
    const control = el(
      "button",
      `equipment-action ${primary ? "primary" : "secondary"}`,
      label,
    );
    control.type = "button";
    control.dataset.buildFocus = key;
    control.disabled = state.busy;
    control.addEventListener("click", run);
    return control;
  };
  const focus = (key) =>
    requestAnimationFrame(() =>
      state.root.querySelector(`[data-build-focus="${key}"]`)?.focus(),
    );
  const perform = async (request, success, key, preview = false) => {
    if (state.busy) return;
    state.busy = true;
    state.status = "Working…";
    state.statusTone = "";
    render();
    let result;
    try {
      result = await request();
    } catch {
      result = { error: "Could not reach the server. Try again." };
    }
    if (state.scene.equipmentScreenState !== state) return;
    state.busy = false;
    state.status = result.error || success;
    state.statusTone = result.error ? "error" : "success";
    if (preview) {
      state.buildPreview = result.error ? null : result;
      state.buildConfirmTransfer = false;
    } else if (!result.error) {
      state.scene.gameState = result;
      state.scene.updateHUD?.();
      state.buildPreview = null;
      state.buildDeleteID = "";
      state.buildName = "";
      state.selectedCandidateKey = "";
    } else {
      // A failed apply needs a fresh review. Keep the intention visible, but
      // disable Apply so a stale token cannot be resubmitted accidentally.
      if (state.buildPreview) state.buildPreview.token = "";
    }
    render();
    focus(key);
  };
  const gameId = state.scene.gameState.id;
  const party = state.partyIndex;
  const builds = state.scene.gameState.equipment_builds?.[party] || [];
  const limit = state.scene.gameState.equipment_build_limit;
  const header = el("div", "equipment-build-heading");
  header.append(heading, action("Back to character", close, "close"));
  panel.append(
    header,
    el(
      "p",
      "equipment-build-note",
      `${builds.length} / ${limit} builds. Save current gear, then preview a build before applying. Items and sockets stay with their original instances.`,
    ),
  );

  const form = el("form", "equipment-build-form");
  const label = el("label", "", "Build name");
  label.htmlFor = "equipment-build-name";
  const input = el("input", "equipment-build-name");
  input.id = "equipment-build-name";
  input.dataset.buildFocus = "name";
  input.maxLength = 32;
  input.required = true;
  input.autocomplete = "off";
  input.value = state.buildName || "";
  input.disabled = state.busy || builds.length >= limit;
  input.addEventListener("input", () => {
    state.buildName = input.value;
  });
  const save = action(
    "Save current build",
    () => form.requestSubmit(),
    "save",
    true,
  );
  save.disabled ||= builds.length >= limit;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!input.value.trim()) return;
    perform(
      () => saveEquipmentBuild(gameId, party, input.value),
      "Current gear saved as a build.",
      "close",
    );
  });
  form.append(label, input, save);
  panel.append(form);
  if (builds.length >= limit)
    panel.append(
      el(
        "p",
        "equipment-build-note",
        "Build limit reached. Delete a build to make room; its items remain yours.",
      ),
    );
  const list = el("div", "equipment-build-list");
  for (const build of builds) {
    const row = el("div", "equipment-build-row");
    row.append(
      el("strong", "", build.name),
      action(
        "Preview",
        () =>
          perform(
            () => previewEquipmentBuild(gameId, party, build.id),
            "Build ready for review. Nothing has been equipped.",
            `preview-${build.id}`,
            true,
          ),
        `preview-${build.id}`,
      ),
      action(
        "Delete",
        () => {
          state.buildDeleteID = build.id;
          render();
          focus(`confirm-delete-${build.id}`);
        },
        `delete-${build.id}`,
      ),
    );
    if (state.buildDeleteID === build.id) {
      const confirmation = el("div", "equipment-build-delete");
      confirmation.append(
        el(
          "p",
          "",
          `Delete “${build.name}”? Your gear will stay exactly where it is.`,
        ),
        action(
          "Confirm delete",
          () =>
            perform(
              () => deleteEquipmentBuild(gameId, party, build.id),
              "Build deleted. Gear unchanged.",
              "name",
            ),
          `confirm-delete-${build.id}`,
        ),
        action(
          "Keep build",
          () => {
            state.buildDeleteID = "";
            render();
            focus(`delete-${build.id}`);
          },
          "keep",
        ),
      );
      row.append(confirmation);
    }
    list.append(row);
  }
  panel.append(list);
  const preview = state.buildPreview;
  if (preview) {
    const review = el("section", "equipment-build-review");
    review.append(
      el("h3", "", `Preview · ${preview.name}`),
      el(
        "p",
        "equipment-build-note",
        "Nothing changes until you apply. Empty positions will be cleared; displaced gear stays owned.",
      ),
    );
    if (preview.reasons?.length) {
      const reasons = el("ul", "equipment-build-reasons");
      for (const reason of preview.reasons)
        reasons.append(el("li", "", reason));
      review.append(reasons);
    }
    const moves = el("ul", "equipment-build-moves");
    for (const change of preview.changes || [])
      moves.append(el("li", "", equipmentBuildMoveLabel(change)));
    review.append(moves);
    if (preview.requires_transfer) {
      const transfer = el("label", "equipment-build-transfer");
      const checkbox = el("input", "");
      checkbox.type = "checkbox";
      checkbox.checked = !!state.buildConfirmTransfer;
      checkbox.disabled = state.busy;
      checkbox.dataset.buildFocus = "transfer";
      checkbox.addEventListener("change", () => {
        state.buildConfirmTransfer = checkbox.checked;
        render();
        focus("transfer");
      });
      transfer.append(
        checkbox,
        el(
          "span",
          "",
          "I approve the listed item transfers from other party members.",
        ),
      );
      review.append(transfer);
    }
    const slots = el("dl", "equipment-build-slots");
    for (const slot of preview.slots || []) {
      slots.append(
        el("dt", "", slot.slot_name),
        el("dd", "", slot.item?.name || "Empty"),
      );
    }
    review.append(slots);
    const apply = action(
      "Apply Build",
      () =>
        perform(
          () =>
            applyEquipmentBuild(
              gameId,
              party,
              preview.build_id,
              preview.token,
              !!state.buildConfirmTransfer,
            ),
          `“${preview.name}” applied.`,
          "close",
        ),
      "apply",
      true,
    );
    apply.disabled ||=
      !preview.token ||
      !!preview.reasons?.length ||
      (preview.requires_transfer && !state.buildConfirmTransfer);
    review.append(apply);
    panel.append(review);
  }
  const status = el(
    "p",
    `equipment-build-status ${state.statusTone || ""}`,
    state.status,
  );
  status.setAttribute("role", "status");
  panel.append(status);
  backdrop.append(panel);
  return backdrop;
}
