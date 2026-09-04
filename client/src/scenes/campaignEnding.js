import { autosaveGame, saveGame } from "../api.js";
import { getAutosaveEnabled } from "../systems/prefs.js";
import { element, button } from "../ui/bestiary.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import "../styles/campaign-ending.css";

function frame(scene, title, label) {
  const root = element("div", "campaign-ending");
  const panel = element("section", "campaign-ending-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", title);
  panel.tabIndex = -1;
  panel.append(element("p", "campaign-ending-eyebrow", label));
  panel.append(element("h1", "", title));
  root.append(panel);
  document.body.append(root);
  pauseWorldFor(scene, "campaign_ending");
  const keydown = (event) => {
    if (event.key !== "Tab") return;
    const controls = [...panel.querySelectorAll("button:not(:disabled)")];
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0].focus();
    }
  };
  root.addEventListener("keydown", keydown);
  const close = () => {
    if (!root.isConnected) return;
    root.remove();
    resumeWorldFor(scene, "campaign_ending");
    scene.game.canvas?.focus();
  };
  scene.events.once("shutdown", close);
  panel.focus();
  return { panel, close };
}

export function showCampaignEnding(scene, gs) {
  scene.gameOver = true;
  const ending = gs.final_encounter;
  const { panel, close } = frame(
    scene,
    ending?.ending_title || "Your adventure is complete",
    `${gs.location} · Campaign complete`,
  );
  panel.append(
    element("p", "campaign-ending-story", ending?.conclusion || gs.message),
  );
  const party = element("div", "campaign-ending-party");
  for (const member of gs.party) {
    const card = element("div", "campaign-ending-companion");
    card.append(element("strong", "", member.name));
    card.append(
      element("span", "", `${member.class_name} · Level ${member.level}`),
    );
    party.append(card);
  }
  panel.append(party);
  panel.append(
    element(
      "p",
      "campaign-ending-reward",
      `${gs.quests.filter((q) => q.completed).length} quests completed · ${gs.gold} gold`,
    ),
  );
  const status = element("p", "campaign-ending-status");
  status.setAttribute("role", "status");
  const actions = element("div", "campaign-ending-actions");
  const save = button("Save this ending", async () => {
    save.disabled = true;
    try {
      const result = await saveGame(gs.id, `${gs.location} — Complete`);
      status.textContent =
        result.error ||
        "Ending saved. You can return to it from the title screen.";
    } catch {
      status.textContent = "Could not save. Please try again.";
    } finally {
      save.disabled = false;
    }
  });
  actions.append(
    save,
    button("Return to title", () => {
      close();
      scene.scene.start("Title");
    }),
  );
  panel.append(actions, status);
  if (getAutosaveEnabled()) {
    autosaveGame(gs.id, "victory")
      .then((result) => {
        status.textContent = result.error || "Campaign completion saved.";
      })
      .catch(() => {
        status.textContent =
          "Automatic save unavailable. You can try Save this ending.";
      });
  }
}

export function showFinalRecovery(scene, gs) {
  const { panel, close } = frame(
    scene,
    gs.final_encounter.recovery === "defeat"
      ? "A chance to regroup"
      : "Back from the last bell",
    gs.final_encounter.title,
  );
  panel.append(element("p", "campaign-ending-story", gs.message));
  panel.append(
    element("p", "campaign-ending-hint", gs.final_encounter.objective),
  );
  panel.append(button("Prepare and explore", close));
}
