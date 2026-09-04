import {
  questCustodyText,
  questKindLabel,
  questRewardText,
} from "./quest_text.js";
import { element, viewportDialog } from "../ui/viewport_dialog.js";

// A native reading surface keeps the staged plan legible at phone sizes.
// All objectives, progress, and custody are supplied by the server.
export function showObjectiveQuestLog(scene) {
  const gs = scene.gameState;
  const q = gs.quests[gs.current_quest];
  let dialog;
  const close = () => dialog.dispose();
  dialog = viewportDialog(scene, {
    key: "quest_log",
    title: "Quest Log",
    onEscape: close,
  });
  dialog.root.dataset.questLog = "true";
  dialog.root.classList.add("objective-quest-log");
  function text(parent, tag, value, className = "") {
    const node = element(tag, className, value);
    parent.append(node);
    return node;
  }
  const closeButton = element("button", "primary", "Close");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close Quest Log");
  closeButton.addEventListener("click", close);
  text(
    dialog.header,
    "p",
    `${questKindLabel(q)} · ${gs.current_quest} quests complete`,
    "objective-quest-kicker",
  );
  text(dialog.body, "h2", q.name);
  text(dialog.body, "p", q.description, "objective-quest-description");
  const list = element("ol", "objective-quest-plan");
  dialog.body.append(list);
  q.actions.forEach((action, index) => {
    const done = index < q.objectives.step,
      current = index === q.objectives.step;
    const row = text(
      list,
      "li",
      `${done ? "✓ " : ""}${action.text}`,
      done ? "is-complete" : current ? "is-current" : "",
    );
    if (current) row.setAttribute("aria-current", "step");
  });
  const custody = questCustodyText(q);
  if (custody) text(dialog.body, "p", custody, "objective-quest-custody");
  text(
    dialog.body,
    "p",
    `Reward: ${questRewardText(q)}`,
    "objective-quest-reward",
  );
  if (gs.building_side_quests?.length) {
    text(dialog.body, "h3", "Local favors");
    for (const side of gs.building_side_quests)
      text(
        dialog.body,
        "p",
        `${side.name} · ${side.completed ? "Complete" : side.status === "ready_to_turn_in" ? `Return to ${side.giver_name}` : `Visit ${side.target_name}`}`,
        "objective-quest-secondary",
      );
  }
  const upcoming = gs.quests
    .slice(gs.current_quest + 1)
    .filter((entry) => !entry.hidden)
    .slice(0, 3);
  if (upcoming.length) {
    text(dialog.body, "h3", "Up next");
    for (const next of upcoming)
      text(dialog.body, "p", next.name, "objective-quest-secondary");
  }
  const actions = element("div", "dialog-actions");
  actions.append(closeButton);
  dialog.footer.append(actions);
  closeButton.focus();
  return dialog;
}
