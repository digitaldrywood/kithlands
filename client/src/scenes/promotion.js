import { getClasses, getGame, promoteParty } from "../api.js";
import { element, viewportDialog } from "../ui/viewport_dialog.js";

export function promotionPreview(member, classes) {
  const metadata = classes.find((entry) => entry.id === member.class_id);
  const schools = metadata?.magic?.promoted_schools || [];
  return {
    name: member.name,
    current: `${member.class_name || metadata?.name || member.class_id} · Lv. ${member.level}`,
    destination: metadata?.promoted_name || "Advanced class",
    magic: schools.length
      ? `${schools.join(" & ")} magic · up to tier ${metadata.magic.promoted_max_spell_level}`
      : "",
  };
}

// Bound the wait even if a connection never answers. A retry reconciles with
// the server first: the original POST may have committed before it timed out.
async function withDeadline(request) {
  let timer;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("The connection took too long.")),
          12000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function showPromotion(scene, gs) {
  if (scene.promotionDialog && !scene.promotionDialog.disposed)
    return scene.promotionDialog;
  const dialog = viewportDialog(scene, {
    key: "promotion",
    title: "Class Promotion",
  });
  scene.promotionDialog = dialog;
  const story = element(
    "p",
    "",
    gs.message || "Your party is ready for a new chapter.",
  );
  dialog.header.append(story);
  const roster = element("ul", "promotion-party");
  const effects = element("section", "promotion-effects");
  effects.append(element("h2", "", "Promotion effects"));
  effects.append(
    element(
      "p",
      "",
      "New class and look, class-specific gear, and expanded spell access for magic users.",
    ),
  );
  dialog.body.append(roster, effects);
  const status = element("p", "dialog-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const actions = element("div", "dialog-actions");
  const claim = element("button", "primary", "Claim Promotion");
  const skip = element("button", "", "Skip");
  actions.append(claim, skip);
  dialog.footer.append(status, actions);
  let classes = [];
  let pending = false;
  let mustReconcile = false;
  let completed = false;

  function renderRoster(party, result = false) {
    roster.replaceChildren();
    for (const [index, member] of party.entries()) {
      const preview = promotionPreview(member, classes);
      const row = element("li", "promotion-member");
      row.append(element("strong", "", member.name));
      if (result) {
        row.append(
          element(
            "p",
            "promotion-destination",
            `${member.class_name} · Lv. ${member.level}`,
          ),
        );
        const before = gs.party[index];
        const newSpells = (member.spells || []).filter(
          (spell) =>
            !(before?.spells || []).some((known) => known.id === spell.id),
        );
        if (newSpells.length)
          row.append(
            element(
              "p",
              "",
              `Learned ${newSpells.map((spell) => spell.name).join(", ")}`,
            ),
          );
        if (member.mp !== before?.mp || member.max_mp !== before?.max_mp)
          row.append(element("p", "", `MP ${member.mp} / ${member.max_mp}`));
      } else {
        row.append(
          element(
            "p",
            "promotion-destination",
            `${preview.current} → ${preview.destination}`,
          ),
        );
      }
      roster.append(row);
    }
  }
  renderRoster(gs.party);
  // Labels come from the same shared catalog used by Go; metadata failure
  // never blocks the authoritative claim/skip operation.
  withDeadline(getClasses())
    .then((result) => {
      if (dialog.disposed || completed || !Array.isArray(result)) return;
      classes = result;
      renderRoster(gs.party);
    })
    .catch(() => {});

  function showResult(result) {
    if (dialog.disposed) return;
    completed = true;
    scene.gameState = result;
    const promoted = result.party.some((member) => member.promoted);
    dialog.heading.textContent = promoted
      ? "Promotion Claimed"
      : "Staying the Course";
    status.classList.remove("is-error");
    status.textContent =
      result.message ||
      (promoted
        ? "Your party has been promoted."
        : "Promotion skipped. Your party keeps its current classes.");
    story.textContent = status.textContent;
    status.textContent = "";
    effects.replaceChildren(
      element(
        "p",
        "",
        promoted
          ? "Your party is ready. Continue your journey together."
          : "Your current classes are unchanged. The journey continues.",
      ),
    );
    renderRoster(result.party, true);
    const next = element("button", "primary", "Continue Journey");
    next.addEventListener("click", () => {
      if (dialog.disposed) return;
      dialog.dispose();
      scene.scene.start("World", { gameState: result });
    });
    actions.replaceChildren(next);
    next.focus();
  }
  async function finish(accept) {
    if (pending || completed || dialog.disposed) return;
    pending = true;
    claim.disabled = skip.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "Connecting…";
    try {
      if (mustReconcile) {
        const current = await withDeadline(getGame(gs.id));
        if (current?.error || !current?.phase)
          throw new Error(current?.error || "Could not check your party.");
        if (current.phase !== "promotion") {
          showResult(current);
          return;
        }
      }
      const result = await withDeadline(promoteParty(gs.id, accept));
      if (result?.error || !result?.phase || !Array.isArray(result.party))
        throw new Error(result?.error || "Could not confirm the result.");
      showResult(result);
    } catch (error) {
      mustReconcile = true;
      if (!dialog.disposed) {
        status.classList.add("is-error");
        status.textContent = `${error.message || "Connection failed."} Try again; we’ll check your party before retrying.`;
      }
    } finally {
      pending = false;
      if (!dialog.disposed && !completed)
        claim.disabled = skip.disabled = false;
    }
  }
  claim.addEventListener("click", () => finish(true));
  skip.addEventListener("click", () => finish(false));
  claim.focus();
  return dialog;
}
