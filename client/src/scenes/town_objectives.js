import { portraitFontSize } from "../systems/gameplayViewport.js";
import { gameAction, autosaveGame } from "../api.js";
import { openDialogue } from "./town_dialogue.js";
import { questObjectiveText, questCustodyText } from "./quest_text.js";
import { showQuestMilestone } from "../ui/quest_milestone.js";
import {
  activeWorldLocks,
  pauseWorldFor,
  resumeWorldFor,
} from "../systems/modalLock.js";

export function currentObjective(scene) {
  const q = scene.gameState?.quests?.[scene.gameState?.current_quest];
  if (!q?.objectives || q.completed) return null;
  const action = q.actions?.[q.objectives.step];
  return action ? { quest: q, action } : null;
}

export function nearbyQuestObjective(scene) {
  const objective = currentObjective(scene);
  if (
    !objective ||
    objective.action.type === "goto" ||
    objective.action.location !== scene.spawn?.node_id ||
    scene.floorIndex !== 0 ||
    scene.nearNpcIndex !== 0
  )
    return null;
  return objective;
}

export function drawTownObjective(scene) {
  scene.objectiveText?.destroy();
  scene.objectiveText = null;
  const objective = currentObjective(scene);
  if (!objective) return;
  const { portrait, centerX } = scene.gameplayLayout;
  const width = 650;
  const custody = questCustodyText(objective.quest);
  scene.objectiveText = scene.add
    .text(
      centerX,
      portrait ? 138 : 76,
      [questObjectiveText(objective.quest), custody].filter(Boolean).join("\n"),
      {
        fontFamily: "Arial, sans-serif",
        fontSize: portrait ? portraitFontSize(scene) : "15px",
        color: "#f4e3af",
        backgroundColor: "#0b1729ed",
        padding: { x: 14, y: 10 },
        wordWrap: { width },
        align: "center",
      },
    )
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(1402);
  syncTownObjectiveVisibility(scene);
}

export function syncTownObjectiveVisibility(scene) {
  const visible = activeWorldLocks(scene).length === 0 && !scene.menuOpen;
  scene.objectiveText?.setVisible(visible);
  return visible;
}

export async function performQuestObjective(scene) {
  const objective = nearbyQuestObjective(scene);
  if (!objective) return false;
  const { quest, action } = objective;
  pauseWorldFor(scene, "quest_action");
  try {
    const result = await gameAction(scene.gameState.id, {
      type: "quest_action",
      quest_id: quest.id,
      objective_index: quest.objectives.step,
      node_id: scene.spawn.node_id,
    });
    if (result?.error) {
      scene.showMessage(result.error);
      scene.time.delayedCall(2200, () => scene.hideMessage());
      return true;
    }
    showQuestMilestone(scene, scene.gameState, result);
    Object.assign(scene.gameState, result);
    drawTownObjective(scene);
    await autosaveGame(result.id, "quest_progress").catch((error) =>
      console.error("[Town] quest autosave failed:", error),
    );
    await openDialogue(scene, scene.spawn, {
      npc_name: scene.spawn.name,
      lines: [result.message || action.result],
    });
    scene.updateInteractionTargets();
    return true;
  } finally {
    resumeWorldFor(scene, "quest_action");
  }
}
