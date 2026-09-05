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
import { drawPanel, drawButton } from "../ui/panel.js";
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

const MENU_FRAME_VARIANT = "ff6";

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

  const bg = scene.add
    .rectangle(400, 300, 460, 220 + available.length * 30, 0x111144, 0.95)
    .setStrokeStyle(2, 0x4444aa)
    .setScrollFactor(0)
    .setDepth(50)
    .setInteractive();
  overlay.push(bg);

  const title = scene.add
    .text(400, 220, `Equip ${type} for ${gs.party[slot].name}:`, {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(title);

  if (available.length === 0) {
    const none = scene.add
      .text(400, 280, "No items available.\nBuy gear at the General Store!", {
        fontSize: "12px",
        color: "#666666",
        fontFamily: "monospace",
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
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(51)
        .setInteractive({ useHandCursor: true });
      row.on("pointerover", () => row.setColor("#ffffff"));
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

  const closeBtn = scene.add
    .text(400, 380 + available.length * 15, "[ CANCEL ]", {
      fontSize: "11px",
      color: "#888888",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51)
    .setInteractive({ useHandCursor: true });
  closeBtn.on("pointerdown", () => {
    overlay.forEach((o) => o.destroy());
    reopenCaller();
  });
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
  const questLog = buildLegacyQuestLogModel(quests, currentIdx);
  pauseWorldFor(scene, "quest_log");
  const overlay = [];

  const bg = drawPanel(scene, 400, 300, 720, 520, {
    depth: 50,
    variant: MENU_FRAME_VARIANT,
    radius: 12,
    innerTop: 0x223758,
    innerBottom: 0x101927,
    outerFill: 0x314d78,
    interactive: true,
  });
  overlay.push(bg.bg);

  const title = scene.add
    .text(70, 58, "Quest Log", {
      fontSize: "24px",
      color: "#fff5c2",
      fontFamily: "Georgia",
      fontStyle: "bold",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(title);

  const subtitle = scene.add
    .text(
      70,
      84,
      `${questLog.completeCount} complete   ${questLog.remainingCount} main objectives remain`,
      { fontSize: "12px", color: "#cbd9f3", fontFamily: "Arial" },
    )
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(subtitle);

  const divider = scene.add
    .rectangle(400, 108, 660, 2, 0x9bc7ff, 0.6)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(divider);

  if (quests.length === 0) {
    const empty = scene.add
      .text(400, 300, "No active quests.", {
        fontSize: "15px",
        color: "#cbd9f3",
        fontFamily: "Arial",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(empty);
  } else {
    let y = 126;
    y = renderSectionHeader(
      scene,
      overlay,
      "Current Objective",
      70,
      y,
      0xf4d881,
    );

    if (questLog.current) {
      y = renderQuestBlock(scene, overlay, questLog.current, 70, y, "current");
    } else if (questLog.currentHidden) {
      const hiddenLine = scene.add
        .text(
          80,
          y,
          "No objective revealed. Explore to uncover a hidden path.",
          {
            fontSize: "13px",
            color: "#cbd9f3",
            fontFamily: "Arial",
          },
        )
        .setScrollFactor(0)
        .setDepth(51);
      overlay.push(hiddenLine);
      y += 20;
    } else {
      const doneLine = scene.add
        .text(80, y, "All quests complete!", {
          fontSize: "13px",
          color: "#44ff88",
          fontFamily: "Arial",
        })
        .setScrollFactor(0)
        .setDepth(51);
      overlay.push(doneLine);
      y += 20;
    }
    y += 10;

    if (buildingSideQuests.length > 0 && y < 430) {
      y = renderSectionHeader(scene, overlay, "Local Errands", 70, y, 0xd696c8);

      for (const q of buildingSideQuests) {
        if (y >= 430) break;
        const status =
          q.status === "ready_to_turn_in"
            ? "Ready to turn in"
            : q.status === "completed"
              ? "Complete"
              : "Active";
        const line = scene.add
          .text(
            80,
            y,
            `${status}: ${q.name}${q.target_name ? ` at ${q.target_name}` : ""}`,
            {
              fontSize: "11px",
              color: q.status === "completed" ? "#77cc77" : "#dd99cc",
              fontFamily: "Arial",
            },
          )
          .setScrollFactor(0)
          .setDepth(51);
        overlay.push(line);
        y += 15;
      }
      y += 8;
    }

    y = renderSectionHeader(scene, overlay, "Next", 70, y, 0x88aacc);

    const upcoming = questLog.upcoming;
    if (upcoming.length === 0) {
      const none = scene.add
        .text(80, y, "No remaining main objectives.", {
          fontSize: "11px",
          color: "#8190aa",
          fontFamily: "Arial",
        })
        .setScrollFactor(0)
        .setDepth(51);
      overlay.push(none);
      y += 18;
    } else {
      const visibleUpcoming = upcoming.slice(0, 5);
      for (const q of visibleUpcoming) {
        const displayName =
          q.template_id === "Q12" || q.name?.toLowerCase().startsWith("defeat")
            ? "Final encounter"
            : q.name;
        const line = scene.add
          .text(80, y, `${questKindLabel(q)}: ${displayName}`, {
            fontSize: "11px",
            color: "#6688aa",
            fontFamily: "Arial",
          })
          .setScrollFactor(0)
          .setDepth(51);
        overlay.push(line);
        y += 15;
      }
      const remaining = upcoming.length - visibleUpcoming.length;
      if (remaining > 0) {
        const more = scene.add
          .text(
            80,
            y + 2,
            `${remaining} later objectives hidden for clarity.`,
            {
              fontSize: "11px",
              color: "#8ea2bd",
              fontFamily: "Arial",
            },
          )
          .setScrollFactor(0)
          .setDepth(51);
        overlay.push(more);
        y += 18;
      }
    }
    y += 8;

    y = renderSectionHeader(scene, overlay, "Completed", 70, y, 0x66aa66);

    if (currentIdx === 0) {
      const none = scene.add
        .text(80, y, "Nothing completed yet.", {
          fontSize: "11px",
          color: "#718083",
          fontFamily: "Arial",
        })
        .setScrollFactor(0)
        .setDepth(51);
      overlay.push(none);
    } else {
      const completed = quests.slice(0, currentIdx).slice(-5);
      for (const q of completed) {
        if (y >= 510) break;
        const line = scene.add
          .text(80, y, `${questKindLabel(q)}: ${q.name}`, {
            fontSize: "11px",
            color: "#558855",
            fontFamily: "Arial",
          })
          .setScrollFactor(0)
          .setDepth(51);
        overlay.push(line);
        y += 15;
      }
      const hiddenCompleted = currentIdx - completed.length;
      if (hiddenCompleted > 0 && y < 510) {
        const more = scene.add
          .text(80, y + 2, `${hiddenCompleted} earlier completions hidden.`, {
            fontSize: "11px",
            color: "#718083",
            fontFamily: "Arial",
          })
          .setScrollFactor(0)
          .setDepth(51);
        overlay.push(more);
      }
    }
  }

  const closeBtn = drawButton(
    scene,
    400,
    548,
    128,
    30,
    "Close",
    () => {
      overlay.forEach((o) => o.destroy());
      resumeWorldFor(scene, "quest_log");
    },
    {
      depth: 51,
      fontSize: "12px",
      fill: 0x2d2535,
      fillHover: 0x49385c,
      stroke: 0xd7b45c,
    },
  );
  overlay.push(closeBtn);
}

function renderSectionHeader(scene, overlay, label, x, y, color) {
  const header = scene.add
    .text(x, y, label, {
      fontSize: "12px",
      color: "#f3e5b2",
      fontFamily: "Georgia",
      fontStyle: "bold",
    })
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(header);

  const rule = scene.add
    .rectangle(x + 118, y + 8, 440, 1, color, 0.55)
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(rule);
  return y + 20;
}

function renderQuestBlock(scene, overlay, q, x, y, kind) {
  const color = q.is_promotion ? "#ffcc44" : "#ffffff";
  const isCurrent = kind === "current";
  const cardH = isCurrent ? 90 : 74;
  const cardTop = y;
  const card = scene.add
    .rectangle(x + 315, y + cardH / 2, 630, cardH, 0x0b1729, 0.72)
    .setStrokeStyle(1, isCurrent ? 0xd7b45c : 0x395a86, 0.8)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(card);

  const name = scene.add
    .text(x + 16, y + 8, `${questKindLabel(q)}: ${q.name}`, {
      fontSize: "13px",
      color,
      fontFamily: "Georgia",
      fontStyle: "bold",
    })
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(name);
  y += 28;

  const objective = scene.add
    .text(x + 16, y, questObjectiveText(q), {
      fontSize: "12px",
      color: "#dce8ff",
      fontFamily: "Arial",
    })
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(objective);
  y += 18;

  if (q.description) {
    const desc = scene.add
      .text(x + 16, y, wrapText(q.description, 92), {
        fontSize: "11px",
        color: "#aebbd6",
        fontFamily: "Arial",
      })
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(desc);
    y += 15 * Math.max(1, desc.height / 15);
  }

  const custody = questCustodyText(q);
  if (custody) {
    const held = scene.add
      .text(x + 16, y, wrapText(custody, 85), {
        fontSize: "12px",
        color: "#f4d788",
        fontFamily: "Arial",
      })
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(held);
    y += held.height + 6;
  }
  const reward = questRewardText(q);
  if (reward) {
    const rew = scene.add
      .text(x + 16, y, `Reward: ${reward}`, {
        fontSize: "11px",
        color: "#f0d77a",
        fontFamily: "Arial",
      })
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(rew);
    y += 15;
  }

  const renderedHeight = Math.max(cardH, y - cardTop + 10);
  card.setSize(630, renderedHeight);
  card.setY(cardTop + renderedHeight / 2);
  return cardTop + renderedHeight + 10;
}

function wrapText(s, width) {
  if (!s || s.length <= width) return s || "";
  const words = s.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}
