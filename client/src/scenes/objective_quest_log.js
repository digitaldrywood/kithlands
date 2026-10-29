import {
  questCustodyText,
  questKindLabel,
  questRewardText,
  questObjectiveText,
} from "./quest_text.js";
import {
  questJournalModel,
  trackedQuestID,
  trackQuest,
} from "./questJournalModel.js";
import { element, viewportDialog } from "../ui/viewport_dialog.js";

// One reading surface across World, Town and Dungeon. Go supplies all progress.
export function showObjectiveQuestLog(scene, { onClose } = {}) {
  let dialog;
  const close = () => {
    dialog.dispose();
    onClose?.();
  };
  dialog = viewportDialog(scene, {
    key: "quest_log",
    title: "Quest Log",
    onEscape: close,
  });
  dialog.root.dataset.questLog = "true";
  dialog.root.classList.add("objective-quest-log");
  const model = questJournalModel(scene.gameState, trackedQuestID(scene));
  const add = (parent, tag, value, cls = "") => {
    const node = element(tag, cls, value);
    parent.append(node);
    return node;
  };
  add(
    dialog.header,
    "p",
    `${model.current} campaign quests complete · ${model.entries.filter((e) => e.completed).length} local stories complete`,
    "objective-quest-kicker",
  );
  add(dialog.body, "h2", "Tracked objective");
  add(dialog.body, "h3", model.tracker.title);
  add(dialog.body, "p", model.tracker.detail);
  function tracking(parent, id, title, completed = false) {
    if (completed) return;
    const button = add(
      parent,
      "button",
      model.tracker.key === id ? "Tracking" : "Track objective",
      "secondary",
    );
    button.type = "button";
    button.setAttribute("aria-label", `Track ${title}`);
    button.disabled = model.tracker.key === id || !!scene.gameState.dungeon;
    button.onclick = () => {
      trackQuest(scene, id);
      close();
      showObjectiveQuestLog(scene, { onClose });
    };
  }
  const section = add(dialog.body, "section", "", "journal-section");
  add(section, "h2", "Your campaign");
  const q = model.campaign;
  if (q) {
    add(section, "h3", `${questKindLabel(q)}: ${q.name}`);
    if (q.description)
      add(section, "p", q.description, "objective-quest-description");
    if (q.objectives && q.actions?.length) {
      const list = add(section, "ol", "", "objective-quest-plan");
      q.actions.forEach((action, index) => {
        const done = index < q.objectives.step;
        const row = add(
          list,
          "li",
          `${done ? "✓ " : ""}${action.text}`,
          done
            ? "is-complete"
            : index === q.objectives.step
              ? "is-current"
              : "",
        );
        if (index === q.objectives.step)
          row.setAttribute("aria-current", "step");
      });
    } else add(section, "p", questObjectiveText(q));
    const custody = questCustodyText(q);
    if (custody) add(section, "p", custody, "objective-quest-custody");
    const reward = questRewardText(q);
    if (reward)
      add(section, "p", `Reward: ${reward}`, "objective-quest-reward");
    tracking(section, "campaign", q.name);
  } else
    add(
      section,
      "p",
      model.tracker.title === "Campaign Complete"
        ? "All campaign quests complete."
        : "Explore to uncover your next objective.",
    );
  if (model.entries.length) {
    add(dialog.body, "h2", "Local stories");
    for (const entry of model.entries) {
      const card = add(dialog.body, "section", "", "journal-section");
      card.dataset.questId = entry.key;
      add(card, "h3", entry.title);
      add(
        card,
        "p",
        entry.completed
          ? "Complete"
          : entry.active
            ? "In progress · Here"
            : entry.started
              ? "In progress"
              : "Available",
        "objective-quest-kicker",
      );
      add(card, "p", entry.description, "objective-quest-description");
      if (!entry.completed) add(card, "p", entry.objective);
      if (entry.reward_gold)
        add(
          card,
          "p",
          `Completion reward: ${entry.reward_gold} gold`,
          "objective-quest-reward",
        );
      tracking(card, entry.key, entry.title, entry.completed);
      if (entry.journal.length) {
        const notes = add(card, "details", "");
        notes.open = entry.active;
        add(notes, "summary", "Discoveries and notes");
        for (const note of [...entry.journal].reverse()) add(notes, "p", note);
      }
    }
  }
  if (model.favors.length) {
    add(dialog.body, "h2", "Local favors");
    for (const side of model.favors)
      add(
        dialog.body,
        "p",
        `${side.name} · ${side.completed || side.status === "completed" ? "Complete" : side.status === "ready_to_turn_in" ? `Return to ${side.giver_name}` : `Visit ${side.target_name}`}`,
        "objective-quest-secondary",
      );
  }
  if (model.upcoming.length) {
    add(dialog.body, "h2", "Up next");
    for (const next of model.upcoming.slice(0, 3))
      add(
        dialog.body,
        "p",
        next.template_id === "Q12" ||
          next.name?.toLowerCase().startsWith("defeat")
          ? "Final encounter"
          : next.name,
        "objective-quest-secondary",
      );
  }
  if (model.completed.length) {
    add(dialog.body, "h2", "Completed campaign quests");
    for (const completed of model.completed)
      add(dialog.body, "p", completed.name, "objective-quest-secondary");
  }
  const button = add(dialog.footer, "button", "Close", "primary");
  button.type = "button";
  button.setAttribute("aria-label", "Close Quest Log");
  button.onclick = close;
  button.focus();
  return dialog;
}
