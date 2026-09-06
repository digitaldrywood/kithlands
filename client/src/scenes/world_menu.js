import { element, viewportDialog } from "../ui/viewport_dialog.js";
import { roundedRectangle } from "../ui/theme.js";
import { showObjectiveQuestLog } from "./objective_quest_log.js";
import { saveGame, equipItem } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { getAutosaveEnabled, setAutosaveEnabled } from "../systems/prefs.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import {
  canShowWorldMap,
  checkpointWorldPosition,
  showWorldMap,
} from "./world_interact.js";
import { openCharacterDetail } from "./character_detail.js";
import { showEquipmentScreen } from "./equipment_screen.js";
import { showExitMenu } from "./exit_menu.js";
import { showOptions } from "./options.js";
import { showItemMenu } from "./item_menu.js";
import { hasCastableFieldSpell, showFieldMagicMenu } from "./field_magic.js";
import { showFormationMenu } from "./formation_menu.js";
import {
  craftableRecipeCount,
  gemWorkshopEnabled,
  showGemWorkshop,
} from "./gem_workshop.js";
import { renderPartyMenu } from "../ui/party_menu.js";
import { drawButton } from "../ui/panel.js";
import { combatantConditionLabel } from "../systems/hpBar.js";
import {
  questKindLabel,
  questObjectiveText,
  questRewardText,
  questCustodyText,
} from "./quest_text.js";
import {
  filterEquippableItems,
  computeEquipDelta,
  formatDeltaLabel,
} from "./equipPicker.js";

export function buildPartyMemberScanContext(member = {}) {
  const xp = Math.max(0, Number(member.xp) || 0);
  const xpNext = Math.max(0, Number(member.xp_next) || 0);
  return {
    xpRemaining: xpNext > 0 ? Math.max(0, xpNext - xp) : null,
    status: combatantConditionLabel(member.hp, member.max_hp, member.status),
  };
}

export async function saveFromPartyMenu(scene, saveName) {
  const position =
    scene?.scene?.key === "World" ? await checkpointWorldPosition(scene) : null;
  return saveGame(scene.gameState.id, saveName, position);
}

export function toggleMenu(scene) {
  if (scene.menuOpen) {
    closeMenu(scene);
    return;
  }
  if (scene.encounterPending) return;

  scene.menuOpen = true;
  pauseWorldFor(scene, "party_menu");
  scene.menuGroup = [];
  scene.partyMenuState = { selectedSlot: 0, rows: [] };
  const gs = scene.gameState;
  const party = Array.isArray(gs.party) ? gs.party : [];
  // Adventure actions.
  const itemsEnabled = Array.isArray(gs.items)
    ? gs.items.some((i) => i && i.effect && i.count > 0)
    : false;
  const magicEnabled = Array.isArray(gs.party)
    ? gs.party.some((member) => hasCastableFieldSpell(member, gs.party))
    : false;
  const gemsEnabled = gemWorkshopEnabled(gs);
  const readyGemRecipes = craftableRecipeCount(gs);
  const primaryActions = [
    {
      label: "CHARACTER",
      hotkey: "C",

      onClick: () => openSelectedCharacter(scene),
    },
    {
      label: "ITEMS",
      hotkey: "I",

      enabled: itemsEnabled,
      onClick: () => {
        closeMenu(scene);
        showItemMenu(scene, {
          mode: "world",
          onClose: () => toggleMenu(scene),
        });
      },
    },
    {
      label: "MAGIC",
      hotkey: "M",

      enabled: magicEnabled,
      onClick: () => {
        closeMenu(scene);
        showFieldMagicMenu(scene, {
          onClose: () => toggleMenu(scene),
        });
      },
    },
    {
      label: readyGemRecipes > 0 ? `GEMS (${readyGemRecipes})` : "GEMS",
      hotkey: "G",

      enabled: gemsEnabled,
      onClick: () => {
        closeMenu(scene);
        showGemWorkshop(scene, { onClose: () => toggleMenu(scene) });
      },
    },
    {
      label: "FORMATION",
      hotkey: "F",

      onClick: () => {
        closeMenu(scene);
        showFormationMenu(scene);
      },
    },
  ];
  // Game and session actions.
  const autoEnabled = getAutosaveEnabled();
  let saveHandle = null;
  let autoHandle = null;
  const secondaryActions = [
    {
      label: "QUEST LOG",
      hotkey: "Q",

      onClick: () => showQuestLog(scene),
    },
    {
      label: "WORLD MAP",
      hotkey: "W",

      enabled: canShowWorldMap(scene),
      onClick: () => {
        closeMenu(scene);
        showWorldMap(scene);
      },
    },
    {
      label: "SAVE",
      hotkey: "S",

      onClick: async () => {
        if (!saveHandle || saveHandle.button.disabled) return;
        const savingMenu = scene.partyMenuDialog;
        saveHandle.setEnabled(false);
        saveHandle.setLabel("Saving...");
        const gss = scene.gameState;
        const saveName = `${gss.location} - ${gss.party.map((pp) => pp.name).join(", ")}`;
        try {
          const result = await saveFromPartyMenu(scene, saveName);
          if (result.error) {
            scene.showMessage(`Save failed: ${result.error}`);
          } else {
            playSFX("sfx_save");
            scene.showMessage("Game saved!");
          }
        } catch (error) {
          scene.showMessage(
            `Save failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (scene.partyMenuDialog === savingMenu) closeMenu(scene);
        scene.time.delayedCall(1500, () => scene.hideMessage());
      },
    },
    {
      label: autoEnabled ? "AUTO: ON" : "AUTO: OFF",
      hotkey: "A",

      onClick: () => {
        const nowEnabled = !getAutosaveEnabled();
        setAutosaveEnabled(nowEnabled);
        if (autoHandle) {
          autoHandle.setLabel(nowEnabled ? "AUTO: ON" : "AUTO: OFF");
        }
        if (scene.startAutosaveTimer) {
          if (nowEnabled) scene.startAutosaveTimer();
          else scene.stopAutosaveTimer();
        }
      },
    },
    {
      label: "OPTIONS",
      hotkey: "O",

      onClick: () => {
        closeMenu(scene);
        showOptions(scene);
      },
    },
    {
      label: "CLOSE",
      hotkey: "ESC",

      onClick: () => closeMenu(scene),
    },
  ];
  const exitAction = {
    label: "Exit to main menu",
    hotkey: "",
    onClick: () => {
      closeMenu(scene);
      showExitMenu(scene, () => {
        const state = scene.gameState;
        return saveFromPartyMenu(
          scene,
          `${state.location} - ${state.party.map((member) => member.name).join(", ")}`,
        );
      });
    },
  };
  const actions = [exitAction, ...primaryActions, ...secondaryActions];
  const menu = renderPartyMenu(scene, {
    party,
    actions,
    onClose: () => closeMenu(scene),
    onSelect: (slot) => {
      scene.partyMenuState.selectedSlot = slot;
    },
  });
  scene.partyMenuDialog = menu;
  scene.menuGroup.push({ destroy: () => menu.dispose() });
  saveHandle = menu.handles.get("S");
  autoHandle = menu.handles.get("A");
  scene.events.once("shutdown", (menu.shutdown = () => closeMenu(scene)));
}

// Close the menu and tear down everything in scene.menuGroup. Button
// handles (with their destroy()) and raw Phaser objects can both live in
// the group since both expose a .destroy() method.
function closeMenu(scene) {
  if (scene.menuGroup) {
    scene.menuGroup.forEach((c) => c.destroy());
    scene.menuGroup = null;
  }
  scene.partyMenuState = null;
  scene.partyMenuLayout = null;
  if (scene.partyMenuDialog)
    scene.events.off("shutdown", scene.partyMenuDialog.shutdown);
  scene.partyMenuDialog = null;
  if (scene.menuOpen) {
    scene.menuOpen = false;
    resumeWorldFor(scene, "party_menu");
  }
}

function openSelectedCharacter(scene) {
  const slot = scene.partyMenuState?.selectedSlot ?? 0;
  closeMenu(scene);
  showEquipmentScreen(scene, slot, { onClose: () => toggleMenu(scene) });
}

export async function showEquipPicker(scene, slot, type, opts = {}) {
  // Tear down the party menu so the picker sits alone. returnTo picks
  // where the picker sends the player on success OR cancel -- defaults
  // to the party menu, but the character detail screen (#95) passes
  // { type: "character", index } so the picker hands control back to
  // the detail screen it was opened from.
  const returnTo = opts.returnTo || { type: "party" };
  if (scene.menuGroup || scene.menuOpen) closeMenu(scene);
  pauseWorldFor(scene, "equip_picker");

  const gs = scene.gameState;
  const equipped = gs.equipment ? gs.equipment[slot] : null;
  const available = filterEquippableItems(gs.items, type);
  const overlay = [];

  const reopenCaller = () => {
    // Matches the existing pattern used by showQuestLog / save button:
    // set menuOpen=false first, then re-open the caller fresh against
    // the latest scene.gameState so new gear / stats show.
    scene.menuOpen = false;
    resumeWorldFor(scene, "equip_picker");
    if (returnTo.type === "character") {
      openCharacterDetail(scene, returnTo.index);
    } else {
      toggleMenu(scene);
    }
  };

  const bg = roundedRectangle(
    scene,
    400,
    300,
    460,
    220 + available.length * 30,
    0x1c2736,
    0.95,
  )
    .setStrokeStyle(2, 0x384859)
    .setScrollFactor(0)
    .setDepth(50)
    .setInteractive();
  overlay.push(bg);

  const title = scene.add
    .text(400, 220, `Equip ${type} for ${gs.party[slot].name}:`, {
      fontSize: "13px",
      color: "#e9eef7",
      fontFamily: "Arial, sans-serif",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(title);

  if (available.length === 0) {
    const none = scene.add
      .text(400, 280, "No items available.\nBuy gear at the General Store!", {
        fontSize: "12px",
        color: "#697888",
        fontFamily: "Arial, sans-serif",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(none);
  } else {
    let y = 255;
    for (const item of available) {
      const delta = computeEquipDelta(item, equipped, type);
      const deltaLabel = formatDeltaLabel(delta, type);
      const label = `${item.name} (x${item.count})   ${deltaLabel.text}`;
      const row = scene.add
        .text(400, y, label, {
          fontSize: "12px",
          color: "#aaaaff",
          fontFamily: "Arial, sans-serif",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(51)
        .setInteractive({ useHandCursor: true });
      row.on("pointerover", () => row.setColor("#e9eef7"));
      row.on("pointerout", () => row.setColor("#aaaaff"));
      row.on("pointerdown", async () => {
        const result = await equipItem(gs.id, slot, item.id, type);
        overlay.forEach((o) => o.destroy());
        if (!result.error) {
          scene.gameState = result;
          scene.updateHUD();
          reopenCaller();
          scene.showMessage(`Equipped ${item.name} (${deltaLabel.text})`);
          scene.time.delayedCall(1500, () => scene.hideMessage());
          playSFX("sfx_save");
        } else {
          // Keep the player in the picker's return target on failure so
          // they can retry; surface the error as a toast.
          reopenCaller();
          scene.showMessage(`Equip failed: ${result.error}`);
          scene.time.delayedCall(1500, () => scene.hideMessage());
        }
      });
      overlay.push(row);
      y += 30;
    }
  }

  const closeBtn = drawButton(
    scene,
    400,
    380 + available.length * 15,
    180,
    32,
    "Cancel",
    () => {
      overlay.forEach((o) => o.destroy());
      reopenCaller();
    },
    { depth: 51, fontSize: "14px" },
  );
  overlay.push(closeBtn);
}

export function buildLegacyQuestLogModel(quests, currentIdx) {
  const questList = Array.isArray(quests) ? quests : [];
  const safeCurrentIdx = Number.isInteger(currentIdx)
    ? Math.max(0, currentIdx)
    : 0;
  const isVisible = (quest) => Boolean(quest && !quest.hidden);
  const currentSlot = questList[safeCurrentIdx];

  return {
    completeCount: questList.slice(0, safeCurrentIdx).filter(isVisible).length,
    remainingCount: questList.slice(safeCurrentIdx).filter(isVisible).length,
    current: isVisible(currentSlot) ? currentSlot : null,
    currentHidden: Boolean(currentSlot?.hidden),
    upcoming: questList.slice(safeCurrentIdx + 1).filter(isVisible),
  };
}

export function showQuestLog(scene) {
  // Close the party menu first so the overlay sits cleanly on its own.
  closeMenu(scene);

  const gs = scene.gameState;
  const quests = Array.isArray(gs.quests) ? gs.quests : [];
  const buildingSideQuests = Array.isArray(gs.building_side_quests)
    ? gs.building_side_quests
    : [];
  const currentIdx = gs.current_quest ?? 0;
  if (quests[currentIdx]?.objectives) {
    showObjectiveQuestLog(scene);
    return;
  }
  const model = buildLegacyQuestLogModel(quests, currentIdx);
  let dialog;
  const close = () => dialog.dispose();
  dialog = viewportDialog(scene, {
    key: "quest_log",
    title: "Quest Log",
    onEscape: close,
  });
  dialog.root.classList.add("objective-quest-log");
  dialog.header.append(
    element(
      "p",
      "",
      `${model.completeCount} complete · ${model.remainingCount} remaining`,
    ),
  );
  const add = (tag, value, className = "") =>
    dialog.body.append(element(tag, className, value));
  add("h2", "Current objective");
  if (model.current) {
    const quest = model.current;
    add("h3", `${questKindLabel(quest)}: ${quest.name}`);
    add("p", questObjectiveText(quest));
    if (quest.description)
      add("p", quest.description, "objective-quest-description");
    const custody = questCustodyText(quest);
    if (custody) add("p", custody, "objective-quest-custody");
    const reward = questRewardText(quest);
    if (reward) add("p", `Reward: ${reward}`, "objective-quest-reward");
  } else
    add(
      "p",
      model.currentHidden
        ? "Explore to uncover your next objective."
        : "No active quests.",
    );
  if (buildingSideQuests.length) {
    add("h3", "Local errands");
    for (const quest of buildingSideQuests)
      add(
        "p",
        `${quest.name} · ${quest.status === "completed" ? "Complete" : quest.status === "ready_to_turn_in" ? "Ready to turn in" : "Active"}${quest.target_name ? ` · ${quest.target_name}` : ""}`,
      );
  }
  if (model.upcoming.length) {
    add("h3", "Up next");
    for (const quest of model.upcoming)
      add(
        "p",
        `${questKindLabel(quest)}: ${quest.template_id === "Q12" || quest.name?.toLowerCase().startsWith("defeat") ? "Final encounter" : quest.name}`,
        "objective-quest-secondary",
      );
  }
  const completed = quests
    .slice(0, currentIdx)
    .filter((quest) => quest && !quest.hidden);
  if (completed.length) {
    add("h3", "Completed");
    for (const quest of completed)
      add("p", quest.name, "objective-quest-secondary");
  }
  const button = element("button", "primary", "Close");
  button.addEventListener("click", close);
  dialog.footer.append(button);
  return dialog;
}
