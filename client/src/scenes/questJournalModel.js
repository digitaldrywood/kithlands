import { questObjectiveText } from "./quest_text.js";

// Tracking is disposable UI selection. Progress and notes always come from Go.
export function trackedQuestID(scene) {
  const choice = scene.registry?.get("quest-journal-tracking");
  return choice && choice.gameID === scene.gameState?.id
    ? choice.id
    : scene.trackedDungeonID
      ? `dungeon:${scene.trackedDungeonID}`
      : "campaign";
}

export function trackQuest(scene, id) {
  scene.registry?.set("quest-journal-tracking", {
    gameID: scene.gameState.id,
    id,
  });
  scene.trackedDungeonID = id.startsWith("dungeon:") ? id.slice(8) : null;
  scene.updateHUD?.();
  scene.updateQuestDisplay?.();
}

export function questJournalModel(state, tracked = "campaign") {
  const quests = state?.quests || [];
  const current = state?.current_quest || 0;
  const campaign = quests[current];
  const entries = (
    state?.dungeon_entries ||
    (state?.dungeon_entry ? [state.dungeon_entry] : [])
  ).map((entry) => {
    const active = state.dungeon?.id === entry.id ? state.dungeon : null;
    return {
      ...entry,
      key: `dungeon:${entry.id}`,
      active: !!active,
      objective: active?.objective || entry.objective || entry.description,
      journal: active?.journal || entry.journal || [],
    };
  });
  const selected =
    entries.find((entry) => entry.active) ||
    entries.find((entry) => entry.key === tracked && !entry.completed);
  const target = (state?.spawn_points || []).find(
    (spawn) => spawn.node_id === selected?.node_id,
  );
  return {
    campaign: campaign && !campaign.hidden ? campaign : null,
    current,
    entries,
    upcoming: quests.slice(current + 1).filter((quest) => !quest.hidden),
    completed: quests.slice(0, current).filter((quest) => !quest.hidden),
    favors: state?.building_side_quests || [],
    tracker: selected
      ? {
          key: selected.key,
          title: selected.title,
          detail: selected.active
            ? selected.objective
            : `Travel to ${target?.name || selected.label || selected.title}. ${selected.started ? "Continue" : "Begin"}: ${selected.objective}`,
        }
      : {
          key: "campaign",
          title: campaign?.hidden
            ? "Explore the world"
            : campaign?.name || "Campaign Complete",
          detail: campaign?.hidden
            ? "Explore to uncover your next objective."
            : campaign
              ? questObjectiveText(campaign)
              : "All quests complete.",
        },
  };
}

export function trackedObjective(scene) {
  return questJournalModel(scene.gameState, trackedQuestID(scene)).tracker;
}
