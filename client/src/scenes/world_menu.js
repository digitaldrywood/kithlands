import { saveGame, equipItem } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { getAutosaveEnabled, setAutosaveEnabled } from "../systems/prefs.js";
import { showWorldMap } from "./world_interact.js";

export function toggleMenu(scene) {
  if (scene.menuOpen) {
    if (scene.menuGroup) {
      scene.menuGroup.forEach((c) => c.destroy());
      scene.menuGroup = null;
    }
    scene.menuOpen = false;
    return;
  }

  scene.menuOpen = true;
  scene.menuGroup = [];
  const gs = scene.gameState;

  // Background panel (wider for equipment) -- interactive to block clicks through to map
  const bg = scene.add
    .rectangle(400, 300, 700, 500, 0x000000, 0.95)
    .setScrollFactor(0)
    .setDepth(40)
    .setInteractive();
  scene.menuGroup.push(bg);

  const title = scene.add
    .text(400, 65, "PARTY MENU", {
      fontSize: "18px",
      color: "#ffff44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(41);
  scene.menuGroup.push(title);

  let y = 95;
  for (let i = 0; i < gs.party.length; i++) {
    const p = gs.party[i];
    const eq = gs.equipment ? gs.equipment[i] : {};

    // Name and stats
    const line = scene.add
      .text(
        80,
        y,
        `${p.name} (${p.class_name}) Lv.${p.level}  HP:${p.hp}/${p.max_hp}  STR:${p.str} AGI:${p.agi} INT:${p.int_stat}`,
        { fontSize: "11px", color: "#ffffff", fontFamily: "monospace" },
      )
      .setScrollFactor(0)
      .setDepth(41);
    scene.menuGroup.push(line);

    // XP
    const xpLine = scene.add
      .text(80, y + 16, `  XP: ${p.xp}/${p.xp_next}`, {
        fontSize: "10px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(41);
    scene.menuGroup.push(xpLine);

    // Equipment
    const weaponName = eq.weapon_name || "None";
    const armorName = eq.armor_name || "None";
    const eqLine = scene.add
      .text(80, y + 30, `  Weapon: ${weaponName}  |  Armor: ${armorName}`, {
        fontSize: "10px",
        color: "#ffcc44",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(41);
    scene.menuGroup.push(eqLine);

    // Equip buttons
    const eqWpnBtn = scene.add
      .text(540, y + 28, "[Equip Wpn]", {
        fontSize: "9px",
        color: "#44aaff",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(41)
      .setInteractive({ useHandCursor: true });
    eqWpnBtn.on("pointerdown", () => showEquipPicker(scene, i, "weapon"));
    scene.menuGroup.push(eqWpnBtn);

    const eqArmBtn = scene.add
      .text(630, y + 28, "[Equip Arm]", {
        fontSize: "9px",
        color: "#44aaff",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(41)
      .setInteractive({ useHandCursor: true });
    eqArmBtn.on("pointerdown", () => showEquipPicker(scene, i, "armor"));
    scene.menuGroup.push(eqArmBtn);

    // Spells
    if (p.spells && p.spells.length > 0) {
      const spells = scene.add
        .text(
          80,
          y + 44,
          `  Spells: ${p.spells.map((s) => `${s.name}(${s.charges})`).join(", ")}`,
          { fontSize: "9px", color: "#8888ff", fontFamily: "monospace" },
        )
        .setScrollFactor(0)
        .setDepth(41);
      scene.menuGroup.push(spells);
      y += 65;
    } else {
      y += 52;
    }
  }

  // Gold, potions, items
  y += 5;
  const inv = scene.add
    .text(80, y, `Gold: ${gs.gold}  |  Potions: ${gs.potions}`, {
      fontSize: "12px",
      color: "#ffcc44",
      fontFamily: "monospace",
    })
    .setScrollFactor(0)
    .setDepth(41);
  scene.menuGroup.push(inv);

  // Other items
  if (gs.items && gs.items.length > 0) {
    y += 18;
    const itemStr = gs.items.map((i) => `${i.name}(${i.count})`).join(", ");
    const itemLine = scene.add
      .text(80, y, `Items: ${itemStr}`, {
        fontSize: "10px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(41);
    scene.menuGroup.push(itemLine);
  }

  // Use potion button
  if (gs.potions > 0) {
    const useBtn = scene.add
      .text(400, y + 35, "[ USE POTION ]", {
        fontSize: "13px",
        color: "#44ff44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(41)
      .setInteractive({ useHandCursor: true });
    useBtn.on("pointerover", () => useBtn.setColor("#88ff88"));
    useBtn.on("pointerout", () => useBtn.setColor("#44ff44"));
    useBtn.on("pointerdown", () => useOverworldPotion(scene));
    scene.menuGroup.push(useBtn);
  }

  // Save button (always available on world map)
  y += 55;
  const saveBtn = scene.add
    .text(400, y, "[ SAVE GAME ]", {
      fontSize: "13px",
      color: "#4488ff",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(41)
    .setInteractive({ useHandCursor: true });
  saveBtn.on("pointerover", () => saveBtn.setColor("#88bbff"));
  saveBtn.on("pointerout", () => saveBtn.setColor("#4488ff"));
  saveBtn.on("pointerdown", async () => {
    saveBtn.setText("Saving...");
    const gss = scene.gameState;
    const name = `${gss.location} - ${gss.party.map((p) => p.name).join(", ")}`;
    const result = await saveGame(gss.id, name);
    playSFX("sfx_save");
    toggleMenu(scene);
    if (result.error) {
      scene.showMessage(`Save failed: ${result.error}`);
    } else {
      scene.showMessage("Game saved!");
    }
    scene.time.delayedCall(1500, () => scene.hideMessage());
  });
  scene.menuGroup.push(saveBtn);

  // World map button
  const mapBtn = scene.add
    .text(250, y, "[ WORLD MAP ]", {
      fontSize: "13px",
      color: "#ffcc44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(41)
    .setInteractive({ useHandCursor: true });
  mapBtn.on("pointerdown", () => {
    toggleMenu(scene);
    showWorldMap(scene);
  });
  scene.menuGroup.push(mapBtn);

  // Autosave toggle
  const autoEnabled = getAutosaveEnabled();
  const autoLabel = autoEnabled ? "[ Autosave: ON ]" : "[ Autosave: OFF ]";
  const autoColor = autoEnabled ? "#44ccff" : "#666666";
  const autoBtn = scene.add
    .text(550, y, autoLabel, {
      fontSize: "13px",
      color: autoColor,
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(41)
    .setInteractive({ useHandCursor: true });
  autoBtn.on("pointerdown", () => {
    const nowEnabled = !getAutosaveEnabled();
    setAutosaveEnabled(nowEnabled);
    autoBtn.setText(nowEnabled ? "[ Autosave: ON ]" : "[ Autosave: OFF ]");
    autoBtn.setColor(nowEnabled ? "#44ccff" : "#666666");
    // Restart or stop the autosave timer
    if (scene.startAutosaveTimer) {
      if (nowEnabled) scene.startAutosaveTimer();
      else scene.stopAutosaveTimer();
    }
  });
  scene.menuGroup.push(autoBtn);

  // Quest log button -- opens full quest log overlay
  y += 32;
  const questBtn = scene.add
    .text(400, y, "[ QUEST LOG ]", {
      fontSize: "13px",
      color: "#ffcc44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(41)
    .setInteractive({ useHandCursor: true });
  questBtn.on("pointerover", () => questBtn.setColor("#ffee88"));
  questBtn.on("pointerout", () => questBtn.setColor("#ffcc44"));
  questBtn.on("pointerdown", () => showQuestLog(scene));
  scene.menuGroup.push(questBtn);

  // Close
  const closeBtn = scene.add
    .text(400, 545, "[ CLOSE (M/ESC) ]", {
      fontSize: "13px",
      color: "#aaaaaa",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(41)
    .setInteractive({ useHandCursor: true });
  closeBtn.on("pointerdown", () => toggleMenu(scene));
  scene.menuGroup.push(closeBtn);
}

export async function showEquipPicker(scene, slot, type) {
  // Close menu first
  if (scene.menuGroup) {
    scene.menuGroup.forEach((c) => c.destroy());
    scene.menuGroup = null;
  }

  const gs = scene.gameState;
  const overlay = [];

  // Find available items from inventory
  const prefix = type === "weapon" ? "wpn_" : "arm_";
  const available = [];

  // Get items from game state inventory
  if (gs.items) {
    for (const item of gs.items) {
      if (item.id.startsWith(prefix)) {
        const realId = item.id.substring(prefix.length);
        available.push({ id: realId, name: item.name, count: item.count });
      }
    }
  }

  // Also check consumables for prefixed items
  // These come through as items in the state

  const bg = scene.add
    .rectangle(400, 300, 400, 200 + available.length * 30, 0x111144, 0.95)
    .setStrokeStyle(2, 0x4444aa)
    .setScrollFactor(0)
    .setDepth(50);
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
      const row = scene.add
        .text(400, y, `${item.name} (x${item.count})`, {
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
        if (!result.error) {
          scene.gameState = result;
          scene.showMessage(`Equipped: ${item.name}`);
          scene.updateHUD();
          scene.time.delayedCall(1000, () => scene.hideMessage());
        }
        overlay.forEach((o) => o.destroy());
        scene.menuOpen = false;
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
    scene.menuOpen = false;
  });
  overlay.push(closeBtn);
}

export function showQuestLog(scene) {
  // Close the party menu first so the overlay sits cleanly on its own.
  if (scene.menuGroup) {
    scene.menuGroup.forEach((c) => c.destroy());
    scene.menuGroup = null;
  }
  scene.menuOpen = false;

  const gs = scene.gameState;
  const quests = Array.isArray(gs.quests) ? gs.quests : [];
  const currentIdx = gs.current_quest ?? 0;
  const overlay = [];

  const bg = scene.add
    .rectangle(400, 300, 720, 520, 0x000000, 0.96)
    .setStrokeStyle(2, 0x444488)
    .setScrollFactor(0)
    .setDepth(50)
    .setInteractive();
  overlay.push(bg);

  const title = scene.add
    .text(400, 60, "QUEST LOG", {
      fontSize: "18px",
      color: "#ffff44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(title);

  const subtitle = scene.add
    .text(
      400,
      82,
      `${quests.length} total  |  ${currentIdx} completed  |  ${Math.max(0, quests.length - currentIdx)} remaining`,
      { fontSize: "11px", color: "#888888", fontFamily: "monospace" },
    )
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(subtitle);

  if (quests.length === 0) {
    const empty = scene.add
      .text(400, 300, "No active quests.", {
        fontSize: "13px",
        color: "#888888",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(empty);
  } else {
    let y = 110;
    // CURRENT
    const curHeader = scene.add
      .text(70, y, "CURRENT", {
        fontSize: "12px",
        color: "#ffcc44",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(curHeader);
    y += 18;

    if (currentIdx < quests.length) {
      const q = quests[currentIdx];
      y = renderQuestBlock(scene, overlay, q, 70, y, "current");
    } else {
      const doneLine = scene.add
        .text(80, y, "All quests complete!", {
          fontSize: "12px",
          color: "#44ff88",
          fontFamily: "monospace",
        })
        .setScrollFactor(0)
        .setDepth(51);
      overlay.push(doneLine);
      y += 20;
    }
    y += 10;

    // UPCOMING (hide boss name to avoid spoilers)
    const upHeader = scene.add
      .text(70, y, "UPCOMING", {
        fontSize: "12px",
        color: "#88aacc",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(upHeader);
    y += 18;

    if (currentIdx + 1 >= quests.length) {
      const none = scene.add
        .text(80, y, "(none)", {
          fontSize: "11px",
          color: "#555555",
          fontFamily: "monospace",
        })
        .setScrollFactor(0)
        .setDepth(51);
      overlay.push(none);
      y += 18;
    } else {
      for (let i = currentIdx + 1; i < quests.length && y < 420; i++) {
        const q = quests[i];
        const prefix = questPrefix(q);
        const displayName =
          q.template_id === "Q12" || q.name?.toLowerCase().startsWith("defeat")
            ? "??? (final encounter)"
            : q.name;
        const line = scene.add
          .text(80, y, `${prefix}[Act ${q.act}] ${displayName}`, {
            fontSize: "11px",
            color: "#6688aa",
            fontFamily: "monospace",
          })
          .setScrollFactor(0)
          .setDepth(51);
        overlay.push(line);
        y += 15;
      }
    }
    y += 8;

    // COMPLETED
    const doneHeader = scene.add
      .text(70, y, "COMPLETED", {
        fontSize: "12px",
        color: "#66aa66",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(doneHeader);
    y += 18;

    if (currentIdx === 0) {
      const none = scene.add
        .text(80, y, "(none yet)", {
          fontSize: "11px",
          color: "#444444",
          fontFamily: "monospace",
        })
        .setScrollFactor(0)
        .setDepth(51);
      overlay.push(none);
    } else {
      for (let i = 0; i < currentIdx && y < 510; i++) {
        const q = quests[i];
        const prefix = questPrefix(q);
        const line = scene.add
          .text(80, y, `${prefix}[Act ${q.act}] ${q.name}`, {
            fontSize: "11px",
            color: "#558855",
            fontFamily: "monospace",
          })
          .setScrollFactor(0)
          .setDepth(51);
        overlay.push(line);
        y += 15;
      }
    }
  }

  const closeBtn = scene.add
    .text(400, 548, "[ CLOSE ]", {
      fontSize: "12px",
      color: "#aaaaaa",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51)
    .setInteractive({ useHandCursor: true });
  closeBtn.on("pointerdown", () => overlay.forEach((o) => o.destroy()));
  overlay.push(closeBtn);
}

function questPrefix(q) {
  if (q.is_promotion) return "[Promotion] ";
  if (q.is_side_quest) return "[Side] ";
  return "";
}

function renderQuestBlock(scene, overlay, q, x, y, kind) {
  const prefix = questPrefix(q);
  const color = q.is_promotion ? "#ffcc44" : "#ffffff";
  const name = scene.add
    .text(x + 10, y, `${prefix}[Act ${q.act}] ${q.name}`, {
      fontSize: "12px",
      color,
      fontFamily: "monospace",
    })
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(name);
  y += 16;

  const giver = q.giver_name ? `from ${q.giver_name}` : "";
  const target = q.target_name ? ` -> ${q.target_name}` : "";
  const meta = scene.add
    .text(x + 16, y, `${giver}${target}`, {
      fontSize: "10px",
      color: "#aaaaaa",
      fontFamily: "monospace",
    })
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(meta);
  y += 14;

  if (q.description) {
    const desc = scene.add
      .text(x + 16, y, wrapText(q.description, 78), {
        fontSize: "10px",
        color: "#cccccc",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(desc);
    y += 14 * Math.max(1, desc.height / 14);
  }

  if (q.reward && (q.reward.xp || q.reward.gold)) {
    const rew = scene.add
      .text(
        x + 16,
        y,
        `Reward: ${q.reward.xp || 0} XP, ${q.reward.gold || 0} gold`,
        { fontSize: "10px", color: "#ffcc66", fontFamily: "monospace" },
      )
      .setScrollFactor(0)
      .setDepth(51);
    overlay.push(rew);
    y += 14;
  }

  return y;
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

export function useOverworldPotion(scene) {
  const gs = scene.gameState;
  if (gs.potions <= 0) return;

  // Find most damaged living party member
  let target = null;
  for (const p of gs.party) {
    if (p.hp > 0 && p.hp < p.max_hp) {
      if (!target || p.hp < target.hp) target = p;
    }
  }
  if (!target) {
    scene.showMessage("No one needs healing.");
    scene.time.delayedCall(1500, () => scene.hideMessage());
    return;
  }

  // Apply locally (server will validate on next action)
  target.hp = Math.min(target.max_hp, target.hp + 30);
  gs.potions--;
  scene.showMessage(
    `${target.name} used a Potion. HP: ${target.hp}/${target.max_hp}`,
  );
  scene.time.delayedCall(1500, () => scene.hideMessage());
  toggleMenu(scene); // close and reopen to refresh
  scene.updateHUD();
}
