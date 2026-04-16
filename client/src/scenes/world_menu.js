import { saveGame, equipItem } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { getAutosaveEnabled, setAutosaveEnabled } from "../systems/prefs.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { showWorldMap } from "./world_interact.js";
import { openCharacterDetail } from "./character_detail.js";
import { showOptions } from "./options.js";
import { showItemMenu } from "./item_menu.js";
import { buildFieldSpellList, showFieldMagicMenu } from "./field_magic.js";
import { drawPanel, drawButton } from "../ui/panel.js";
import { barFillWidth, barLabel, hpBarColorPct } from "../systems/hpBar.js";
import {
  filterEquippableItems,
  computeEquipDelta,
  formatDeltaLabel,
} from "./equipPicker.js";

// Panel geometry (issue #94). All layout math derives from these constants
// so the 4-member → 6-member scaling is just `rowH` shrinking; no absolute
// y-coordinates sprinkled through the body.
const PANEL_CX = 400;
const PANEL_CY = 300;
const PANEL_W = 760;
const PANEL_H = 540;
const PANEL_LEFT = PANEL_CX - PANEL_W / 2; // 20
const PANEL_RIGHT = PANEL_CX + PANEL_W / 2; // 780
const PANEL_TOP = PANEL_CY - PANEL_H / 2; // 30
const PANEL_BOTTOM = PANEL_CY + PANEL_H / 2; // 570
const DEPTH_BG = 40;
const DEPTH_CONTENT = 41;

// The body region starts below the title strip and ends above the footer
// button rows. rowH is computed dynamically so 4–6 party members all fit.
const BODY_TOP = PANEL_TOP + 70; // title area reserved above
const FOOTER_TOP = PANEL_BOTTOM - 120; // two 30px button rows + margins
const BODY_H = FOOTER_TOP - BODY_TOP;

export function toggleMenu(scene) {
  if (scene.menuOpen) {
    closeMenu(scene);
    return;
  }

  scene.menuOpen = true;
  pauseWorldFor(scene, "party_menu");
  scene.menuGroup = [];
  const gs = scene.gameState;

  const panel = drawPanel(scene, PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, {
    depth: DEPTH_BG,
  });
  scene.menuGroup.push(panel.bg);

  const title = scene.add
    .text(PANEL_CX, PANEL_TOP + 32, "PARTY MENU", {
      fontSize: "20px",
      color: "#ffff44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  scene.menuGroup.push(title);

  // Top-right inventory strip: Gold + Potions. Moved out of the body so
  // party rows can take the full body width.
  const inv = scene.add
    .text(
      PANEL_RIGHT - 20,
      PANEL_TOP + 32,
      `Gold: ${gs.gold}   Potions: ${gs.potions}   Ether: ${(gs.ethers || 0) + (gs.hi_ethers || 0) + (gs.x_ethers || 0)}`,
      { fontSize: "12px", color: "#ffcc44", fontFamily: "monospace" },
    )
    .setOrigin(1, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  scene.menuGroup.push(inv);

  // Horizontal divider under the title.
  const divider = scene.add
    .rectangle(PANEL_CX, PANEL_TOP + 58, PANEL_W - 40, 1, 0x4488ff, 0.6)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  scene.menuGroup.push(divider);

  // Body: party rows. Row height scales so 4 or 6 members both fit cleanly.
  const party = Array.isArray(gs.party) ? gs.party : [];
  const n = Math.max(1, party.length);
  const rowH = Math.floor(BODY_H / n);
  for (let i = 0; i < party.length; i++) {
    const p = party[i];
    const eq = gs.equipment ? gs.equipment[i] || {} : {};
    drawPartyRow(
      scene,
      scene.menuGroup,
      PANEL_LEFT + 20,
      BODY_TOP + i * rowH,
      PANEL_W - 40,
      p,
      eq,
      i,
    );
  }

  // Footer row A — primary actions.
  const itemsEnabled = Array.isArray(gs.items)
    ? gs.items.some((i) => i && i.effect && i.count > 0)
    : false;
  const magicEnabled = Array.isArray(gs.party)
    ? gs.party.some(
        (member) => buildFieldSpellList(member, gs.party).length > 0,
      )
    : false;
  layoutButtonRow(scene, scene.menuGroup, PANEL_CX, FOOTER_TOP + 15, [
    {
      label: "CHARACTER",
      w: 116,
      onClick: () => {
        // Footer button opens the detail for the party lead. Per-row
        // CHARACTER → buttons in drawPartyRow handle the specific hero.
        closeMenu(scene);
        openCharacterDetail(scene, 0);
      },
    },
    {
      label: "MAGIC",
      w: 96,
      enabled: magicEnabled,
      onClick: () => {
        closeMenu(scene);
        showFieldMagicMenu(scene, {
          onClose: () => toggleMenu(scene),
        });
      },
    },
    {
      label: "EQUIPMENT",
      w: 116,
      onClick: () => {
        scene.showMessage("Equipment screen — coming in #95");
        scene.time.delayedCall(1500, () => scene.hideMessage());
      },
    },
    {
      label: "ITEM",
      w: 96,
      enabled: itemsEnabled,
      onClick: () => {
        // Close the party menu first so the Item overlay can paint at the
        // normal depth. On close, reopen the party menu via toggleMenu so the
        // HUD refreshes with the post-use HP/MP/stack counts.
        closeMenu(scene);
        showItemMenu(scene, {
          mode: "world",
          onClose: () => toggleMenu(scene),
        });
      },
    },
    {
      label: "QUESTS",
      w: 96,
      onClick: () => showQuestLog(scene),
    },
    {
      label: "MAP",
      w: 84,
      onClick: () => {
        closeMenu(scene);
        showWorldMap(scene);
      },
    },
  ]);

  // Footer row B — save / autosave / close.
  const autoEnabled = getAutosaveEnabled();
  let saveHandle = null;
  let autoHandle = null;
  const row = layoutButtonRow(
    scene,
    scene.menuGroup,
    PANEL_CX,
    FOOTER_TOP + 65,
    [
      {
        label: "SAVE",
        w: 130,
        onClick: async () => {
          if (!saveHandle) return;
          saveHandle.setLabel("Saving...");
          const gss = scene.gameState;
          const saveName = `${gss.location} - ${gss.party.map((pp) => pp.name).join(", ")}`;
          const result = await saveGame(gss.id, saveName);
          playSFX("sfx_save");
          closeMenu(scene);
          if (result.error) {
            scene.showMessage(`Save failed: ${result.error}`);
          } else {
            scene.showMessage("Game saved!");
          }
          scene.time.delayedCall(1500, () => scene.hideMessage());
        },
      },
      {
        label: autoEnabled ? "Autosave: ON" : "Autosave: OFF",
        w: 170,
        onClick: () => {
          const nowEnabled = !getAutosaveEnabled();
          setAutosaveEnabled(nowEnabled);
          if (autoHandle) {
            autoHandle.setLabel(nowEnabled ? "Autosave: ON" : "Autosave: OFF");
          }
          if (scene.startAutosaveTimer) {
            if (nowEnabled) scene.startAutosaveTimer();
            else scene.stopAutosaveTimer();
          }
        },
      },
      {
        label: "OPTIONS",
        w: 110,
        onClick: () => {
          closeMenu(scene);
          showOptions(scene);
        },
      },
      {
        label: "CLOSE (M/ESC)",
        w: 160,
        onClick: () => closeMenu(scene),
      },
    ],
  );
  [saveHandle, autoHandle] = [row[0], row[1]];
}

// Close the menu and tear down everything in scene.menuGroup. Button
// handles (with their destroy()) and raw Phaser objects can both live in
// the group since both expose a .destroy() method.
function closeMenu(scene) {
  if (scene.menuGroup) {
    scene.menuGroup.forEach((c) => c.destroy());
    scene.menuGroup = null;
  }
  if (scene.menuOpen) {
    scene.menuOpen = false;
    resumeWorldFor(scene, "party_menu");
  }
}

// drawPartyRow renders a single member's block: portrait slot, name /
// class / level header, HP bar, XP bar, and (for casters) MP bar. All
// objects it creates are pushed into `group` so closeMenu can tear them
// down cleanly.
function drawPartyRow(scene, group, x, y, w, member, _equip, slot) {
  const alive = (member.hp || 0) > 0;
  const textColor = alive ? "#ffffff" : "#666666";

  // Portrait slot (placeholder — #95 wires the composed sprite).
  const portrait = scene.add
    .rectangle(x + 30, y + 30, 56, 56, 0x1a2a4a)
    .setStrokeStyle(1, 0x4488ff)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  group.push(portrait);
  const initial = scene.add
    .text(x + 30, y + 30, (member.class_name || "?")[0] || "?", {
      fontSize: "22px",
      color: "#88ccff",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  group.push(initial);

  // Line 1 — name + class + level (left-aligned to the info column).
  const infoX = x + 70;
  const header = scene.add
    .text(
      infoX,
      y + 4,
      `${member.name}   ${member.class_name}   Lv.${member.level}`,
      { fontSize: "13px", color: textColor, fontFamily: "monospace" },
    )
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  group.push(header);

  // Bar geometry. HP on line 2, MP stacked directly beneath for casters
  // (issue #136), XP on line 3.
  const hpBarW = 180;
  const barH = 8;

  const hpY = y + 24;
  const mpY = y + 36;
  const xpY = y + 48;

  // HP bar.
  drawStatBar(scene, group, {
    x: infoX,
    y: hpY,
    w: hpBarW,
    h: barH,
    cur: member.hp,
    max: member.max_hp,
    prefix: "HP",
    color: hpColorFor(member.hp, member.max_hp),
  });

  // MP bar for casters — stacked directly beneath HP (same width, same x)
  // so players read HP/MP as a paired vitality block. Uses the MaxMP field
  // #94 added to PartyMemberState on the server; non-casters report
  // MaxMP=0 and get no bar (the row just has empty space where MP would be).
  if ((member.max_mp || 0) > 0) {
    drawStatBar(scene, group, {
      x: infoX,
      y: mpY,
      w: hpBarW,
      h: barH,
      cur: member.mp,
      max: member.max_mp,
      prefix: "MP",
      color: 0x4488ff,
    });
  }

  // XP bar (full-width).
  drawStatBar(scene, group, {
    x: infoX,
    y: xpY,
    w: 340,
    h: barH,
    cur: member.xp,
    max: member.xp_next,
    prefix: "XP",
    color: 0xffcc44,
  });

  // Right-side CHARACTER button — opens the full detail overlay (#95)
  // for this specific hero.
  const btn = drawButton(
    scene,
    x + w - 80,
    y + 30,
    140,
    44,
    "CHARACTER →",
    () => {
      closeMenu(scene);
      openCharacterDetail(scene, slot);
    },
  );
  group.push(btn);
}

// drawStatBar renders one labeled stat bar (HP/MP/XP). Background track +
// color fill + "PREFIX cur/max" label to the right.
function drawStatBar(scene, group, { x, y, w, h, cur, max, prefix, color }) {
  const fillW = barFillWidth(cur, max, w);
  const track = scene.add
    .rectangle(x, y, w, h, 0x222244)
    .setOrigin(0, 0.5)
    .setStrokeStyle(1, 0x4488ff)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const fill = scene.add
    .rectangle(x, y, fillW, h, color)
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  const label = scene.add
    .text(x + w + 6, y, `${prefix} ${barLabel(cur, max)}`, {
      fontSize: "10px",
      color: "#cccccc",
      fontFamily: "monospace",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  group.push(track, fill, label);
}

function hpColorFor(hp, max) {
  const pct = hpBarColorPct(hp, max);
  if (pct > 0.5) return 0x44ff44;
  if (pct > 0.25) return 0xff8800;
  if (pct > 0) return 0xff0000;
  return 0x333333;
}

// Horizontally layout a row of drawButton specs centered on `cx`. Returns
// the list of button handles (in order) so the caller can mutate individual
// ones (setLabel, setEnabled) later. 12px gap between buttons.
function layoutButtonRow(scene, group, cx, y, specs) {
  const gap = 12;
  const totalW =
    specs.reduce((sum, s) => sum + s.w, 0) + gap * (specs.length - 1);
  let cursor = cx - totalW / 2;
  const handles = [];
  for (const spec of specs) {
    const bx = cursor + spec.w / 2;
    const btn = drawButton(scene, bx, y, spec.w, 34, spec.label, spec.onClick);
    if (spec.enabled === false) btn.setEnabled(false);
    group.push(btn);
    handles.push(btn);
    cursor += spec.w + gap;
  }
  return handles;
}

export async function showEquipPicker(scene, slot, type, opts = {}) {
  // Tear down the party menu so the picker sits alone. returnTo picks
  // where the picker sends the player on success OR cancel -- defaults
  // to the party menu, but the character detail screen (#95) passes
  // { type: "character", index } so the picker hands control back to
  // the detail screen it was opened from.
  const returnTo = opts.returnTo || { type: "party" };
  if (scene.menuGroup) {
    scene.menuGroup.forEach((c) => c.destroy());
    scene.menuGroup = null;
  }
  if (scene.menuOpen) {
    scene.menuOpen = false;
    resumeWorldFor(scene, "party_menu");
  }
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

export function showQuestLog(scene) {
  // Close the party menu first so the overlay sits cleanly on its own.
  if (scene.menuGroup) {
    scene.menuGroup.forEach((c) => c.destroy());
    scene.menuGroup = null;
  }
  if (scene.menuOpen) {
    scene.menuOpen = false;
    resumeWorldFor(scene, "party_menu");
  }
  pauseWorldFor(scene, "quest_log");

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
  closeBtn.on("pointerdown", () => {
    overlay.forEach((o) => o.destroy());
    resumeWorldFor(scene, "quest_log");
  });
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
