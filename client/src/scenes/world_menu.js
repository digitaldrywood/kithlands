import { saveGame, equipItem } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { getAutosaveEnabled, setAutosaveEnabled } from "../systems/prefs.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { showWorldMap } from "./world_interact.js";
import { openCharacterDetail } from "./character_detail.js";
import { showEquipmentScreen } from "./equipment_screen.js";
import { showOptions } from "./options.js";
import { showItemMenu } from "./item_menu.js";
import { hasCastableFieldSpell, showFieldMagicMenu } from "./field_magic.js";
import { showFormationMenu } from "./formation_menu.js";
import {
  craftableRecipeCount,
  gemWorkshopEnabled,
  showGemWorkshop,
} from "./gem_workshop.js";
import { inferPartyRow } from "./battle_layout.js";
import { drawPanel, drawButton, drawLabeledStatBar } from "../ui/panel.js";
import { hpBarColorPct } from "../systems/hpBar.js";
import {
  questKindLabel,
  questObjectiveText,
  questRewardText,
} from "./quest_text.js";
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
const HEADER_Y = PANEL_TOP + 34;
const TITLE_Y = PANEL_TOP + 29;
const HEADER_DIVIDER_Y = PANEL_TOP + 64;
const MENU_FRAME_VARIANT = "ff6";
const FF6_BLUE = 0x4d78bf;
const FF6_NAVY = 0x122545;
const FF6_GLOW = 0x9bc7ff;
const FF6_GOLD = 0xf4d881;
const FF6_GOLD_DARK = 0xa66b1d;
const FF6_ROW_FILL = 0x16274a;
const FF6_ROW_FILL_HOVER = 0x21406e;
const FF6_ROW_FILL_SELECTED = 0x2d5a93;
const FF6_ROW_FILL_DEAD = 0x11182b;
const FF6_ROW_GLOW = 0x7fc7ff;
const FF6_TRACK = 0x142442;
const FF6_TRACK_INNER = 0x20365f;
const FF6_BAR_TEXT = "#f4f7ff";

// The body region starts below the title strip and ends above the footer
// button rows. rowH is computed dynamically so 4–6 party members all fit.
const BODY_TOP = PANEL_TOP + 70; // title area reserved above
const FOOTER_TOP = PANEL_BOTTOM - 108; // two button rows + margins
const BODY_H = FOOTER_TOP - BODY_TOP;

export function toggleMenu(scene) {
  if (scene.menuOpen) {
    closeMenu(scene);
    return;
  }

  scene.menuOpen = true;
  pauseWorldFor(scene, "party_menu");
  scene.menuGroup = [];
  scene.partyMenuState = { selectedSlot: 0, rows: [] };
  const gs = scene.gameState;

  const panel = drawPanel(scene, PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, {
    depth: DEPTH_BG,
    interactive: false,
    variant: MENU_FRAME_VARIANT,
  });
  scene.menuGroup.push(panel.bg);

  const title = scene.add
    .text(PANEL_LEFT + 62, TITLE_Y, "PARTY MENU", {
      fontSize: "24px",
      fontStyle: "bold",
      color: "#fff5c2",
      fontFamily: "Georgia",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  applyTextGlow(title, "#2c5f9d", 2);
  scene.menuGroup.push(title);

  const resourceStrip = [
    {
      key: "gold",
      value: gs.gold || 0,
      width: 86,
      iconKey: "icon_gold",
      accent: 0xf8d56c,
    },
    {
      key: "potions",
      value: gs.potions || 0,
      width: 84,
      iconKey: "icon_potion",
      accent: 0x8ed2ff,
    },
    {
      key: "ether",
      value: (gs.ethers || 0) + (gs.hi_ethers || 0) + (gs.x_ethers || 0),
      width: 84,
      accent: 0xc8b6ff,
      iconType: "orb",
    },
  ];
  let resourceCursor = PANEL_RIGHT - 28;
  for (let i = resourceStrip.length - 1; i >= 0; i -= 1) {
    const chip = drawResourceChip(
      scene,
      scene.menuGroup,
      resourceCursor - resourceStrip[i].width / 2,
      HEADER_Y,
      resourceStrip[i].width,
      resourceStrip[i],
    );
    resourceCursor -= chip.width + 10;
  }

  const dividerShadow = scene.add
    .rectangle(PANEL_CX, HEADER_DIVIDER_Y + 2, PANEL_W - 64, 2, 0x071123, 0.55)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const divider = scene.add
    .rectangle(PANEL_CX, HEADER_DIVIDER_Y, PANEL_W - 72, 2, 0x8ebeff, 0.72)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  scene.menuGroup.push(dividerShadow, divider);

  // Body: party rows. Row height scales so 4 or 6 members both fit cleanly.
  const party = Array.isArray(gs.party) ? gs.party : [];
  const n = Math.max(1, party.length);
  const rowH = Math.floor(BODY_H / n);
  for (let i = 0; i < party.length; i++) {
    const p = party[i];
    drawPartyRow(
      scene,
      scene.menuGroup,
      PANEL_LEFT + 20,
      BODY_TOP + i * rowH,
      PANEL_W - 40,
      rowH,
      p,
      i,
    );
  }
  repaintPartyRows(scene);

  // Footer row A — primary actions.
  const itemsEnabled = Array.isArray(gs.items)
    ? gs.items.some((i) => i && i.effect && i.count > 0)
    : false;
  const magicEnabled = Array.isArray(gs.party)
    ? gs.party.some((member) => hasCastableFieldSpell(member, gs.party))
    : false;
  const gemsEnabled = gemWorkshopEnabled(gs);
  const readyGemRecipes = craftableRecipeCount(gs);
  layoutButtonRow(scene, scene.menuGroup, PANEL_CX, FOOTER_TOP + 16, [
    {
      label: "CHARACTER",
      hotkey: "C",
      primary: true,
      w: 154,
      iconFallback: "C",
      onClick: () => openSelectedCharacter(scene),
    },
    {
      label: "ITEMS",
      hotkey: "I",
      primary: true,
      w: 118,
      iconKey: "icon_potion",
      iconFallback: "I",
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
      primary: true,
      w: 118,
      iconKey: "icon_spell",
      iconFallback: "M",
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
      primary: true,
      w: 118,
      iconFallback: "G",
      enabled: gemsEnabled,
      onClick: () => {
        closeMenu(scene);
        showGemWorkshop(scene, { onClose: () => toggleMenu(scene) });
      },
    },
    {
      label: "FORMATION",
      hotkey: "F",
      primary: true,
      w: 154,
      iconKey: "icon_sword",
      iconFallback: "F",
      onClick: () => {
        closeMenu(scene);
        showFormationMenu(scene);
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
    FOOTER_TOP + 58,
    [
      {
        label: "QUEST LOG",
        hotkey: "Q",
        w: 126,
        iconKey: "icon_xp",
        iconFallback: "Q",
        onClick: () => showQuestLog(scene),
      },
      {
        label: "WORLD MAP",
        hotkey: "W",
        w: 126,
        iconKey: "target_cursor",
        iconFallback: "W",
        onClick: () => {
          closeMenu(scene);
          showWorldMap(scene);
        },
      },
      {
        label: "SAVE",
        hotkey: "S",
        w: 96,
        iconKey: "icon_gold",
        iconFallback: "S",
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
        label: autoEnabled ? "AUTO: ON" : "AUTO: OFF",
        hotkey: "A",
        w: 122,
        iconKey: "icon_gold",
        iconFallback: "A",
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
        w: 104,
        iconFallback: "O",
        onClick: () => {
          closeMenu(scene);
          showOptions(scene);
        },
      },
      {
        label: "CLOSE",
        hotkey: "ESC",
        w: 104,
        iconFallback: "X",
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
  scene.partyMenuState = null;
  if (scene.menuOpen) {
    scene.menuOpen = false;
    resumeWorldFor(scene, "party_menu");
  }
}

function openSelectedCharacter(scene) {
  const slot = scene.partyMenuState?.selectedSlot ?? 0;
  showEquipmentScreen(scene, slot);
}

function applyTextGlow(text, shadowColor, blur = 1) {
  if (typeof text.setShadow === "function") {
    text.setShadow(1, 1, shadowColor, blur, true, true);
  }
  return text;
}

function drawResourceChip(scene, group, x, y, w, spec) {
  const chipShadow = scene.add
    .rectangle(x + 2, y + 2, w, 24, 0x071123, 0.4)
    .setStrokeStyle(0)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const chipBg = scene.add
    .rectangle(x, y, w, 24, 0x1a3156, 0.98)
    .setStrokeStyle(2, FF6_GLOW)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  chipBg.__kithlandsPartyMenu = { role: "resource_chip", key: spec.key };
  const chipInner = scene.add
    .rectangle(x, y, w - 6, 18, 0x10203d, 0.95)
    .setStrokeStyle(1, spec.accent || FF6_GOLD)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);

  const iconX = x - w / 2 + 15;
  const iconY = y;
  if (spec.iconKey && scene.textures.exists(spec.iconKey)) {
    const icon = scene.add
      .image(iconX, iconY, spec.iconKey)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 3);
    const srcSize = Math.max(icon.width || 16, icon.height || 16);
    icon.setScale(13 / srcSize);
    group.push(icon);
  } else if (spec.iconType === "orb") {
    const orb = scene.add
      .circle(iconX, iconY, 6, spec.accent || 0xc8b6ff, 1)
      .setStrokeStyle(1, 0xf4f7ff, 0.9)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 3);
    const orbHighlight = scene.add
      .circle(iconX - 2, iconY - 2, 2, 0xffffff, 0.65)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 4);
    group.push(orb, orbHighlight);
  }

  const value = scene.add
    .text(x - w / 2 + 28, y, `${spec.value}`, {
      fontSize: "12px",
      fontStyle: "bold",
      color: "#f7fbff",
      fontFamily: "Trebuchet MS",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 3);
  group.push(chipShadow, chipBg, chipInner, value);
  return { width: w };
}

// drawPartyRow renders a single member's block: framed portrait, separated
// name/class strip, and FF-style HP/MP/XP bars. All created objects are
// pushed into `group` so closeMenu can tear them down cleanly.
function drawPartyRow(scene, group, x, y, w, rowH, member, slot) {
  const alive = (member.hp || 0) > 0;
  const compact = rowH < 64;
  const frameH = Math.max(52, rowH - 8);
  const top = y + Math.floor((rowH - frameH) / 2);
  const centerY = top + frameH / 2;
  const rowShadow = scene.add
    .rectangle(x + w / 2 + 2, centerY + 2, w, frameH, 0x07111f, 0.36)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT - 1);
  const rowBg = scene.add
    .rectangle(
      x + w / 2,
      centerY,
      w,
      frameH,
      alive ? FF6_ROW_FILL : FF6_ROW_FILL_DEAD,
      0.98,
    )
    .setStrokeStyle(2, FF6_BLUE)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const rowInner = scene.add
    .rectangle(x + w / 2, centerY, w - 8, frameH - 8, FF6_NAVY, 0.3)
    .setStrokeStyle(1, 0x7fa7de, 0.85)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 0.25);
  const rowGlow = scene.add
    .rectangle(x + w / 2, centerY, w - 14, frameH - 12, FF6_GLOW, 0.12)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 0.1)
    .setVisible(false);
  rowBg.__kithlandsPartyMenu = { role: "row", slot, state: "default" };
  rowBg.setInteractive({ useHandCursor: true });
  group.push(rowShadow, rowGlow, rowBg, rowInner);

  const formationRow = inferPartyRow(member);
  const portraitAccent = formationRow === "back" ? 0xb9c8ff : FF6_GOLD;
  const portraitBackdrop = scene.add
    .rectangle(x + 40, centerY, 60, frameH - 10, 0x0b1324, 0.98)
    .setStrokeStyle(2, portraitAccent)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  const portraitPlate = scene.add
    .rectangle(
      x + 40,
      centerY,
      50,
      compact ? 40 : 44,
      formationRow === "back" ? 0x27395e : 0x4b3e24,
      1,
    )
    .setStrokeStyle(1, 0xe7f2ff, 0.8)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);
  const portraitFrame = scene.add
    .rectangle(x + 40, centerY, 42, compact ? 34 : 38, 0x162949, 1)
    .setStrokeStyle(2, portraitAccent)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 3);
  group.push(portraitBackdrop, portraitPlate, portraitFrame);

  const portraitKey = resolvePortraitTextureKey(scene, member);
  if (portraitKey) {
    const portrait = scene.add
      .image(x + 40, centerY, portraitKey)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 4);
    const srcSize = Math.max(portrait.width || 64, portrait.height || 64);
    portrait.setScale((compact ? 34 : 38) / srcSize);
    portrait.__kithlandsPartyMenu = {
      role: "portrait",
      slot,
      kind: "image",
      key: portraitKey,
    };
    group.push(portrait);
  } else {
    const fallbackBg = scene.add
      .rectangle(x + 40, centerY, 34, 34, 0x10233f, 1)
      .setStrokeStyle(1, 0x88ccff)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 4);
    fallbackBg.__kithlandsPartyMenu = {
      role: "portrait",
      slot,
      kind: "fallback",
    };
    const fallbackGlyph = scene.add
      .text(x + 40, centerY, (member.class_name || "?")[0] || "?", {
        fontSize: compact ? "18px" : "20px",
        fontStyle: "bold",
        color: "#eef7ff",
        fontFamily: "Georgia",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 5);
    group.push(fallbackBg, fallbackGlyph);
  }

  const infoX = x + 80;
  const nameText = scene.add
    .text(infoX, top + (compact ? 5 : 7), member.name, {
      fontSize: compact ? "13px" : "15px",
      fontStyle: "bold",
      color: alive ? "#f7fbff" : "#a1adbe",
      fontFamily: "Trebuchet MS",
    })
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);
  applyTextGlow(nameText, "#0d1830", 1);

  const levelFrame = scene.add
    .rectangle(
      x + w - 42,
      top + (compact ? 13 : 15),
      66,
      compact ? 18 : 20,
      0x132947,
      0.98,
    )
    .setStrokeStyle(2, FF6_GOLD_DARK)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  const levelInner = scene.add
    .rectangle(
      x + w - 42,
      top + (compact ? 13 : 15),
      58,
      compact ? 12 : 14,
      0x2b4a75,
      0.9,
    )
    .setStrokeStyle(1, FF6_GOLD)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);
  const levelText = scene.add
    .text(x + w - 42, top + (compact ? 13 : 15), `Lv ${member.level}`, {
      fontSize: compact ? "9px" : "10px",
      fontStyle: "bold",
      color: "#fff5d1",
      fontFamily: "Courier New",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 3);

  const classText = scene.add
    .text(infoX, top + (compact ? 17 : 21), member.class_name || "Adventurer", {
      fontSize: compact ? "9px" : "10px",
      fontStyle: "italic",
      color: alive ? "#d2bdd7" : "#7b8193",
      fontFamily: "Georgia",
    })
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);
  classText.__kithlandsPartyMenu = { role: "class_text", slot };
  group.push(nameText, levelFrame, levelInner, levelText, classText);

  const compactBarTop = top + (compact ? 27 : 33);
  const compactBarGap = compact ? 9 : 11;
  const barHeight = compact ? 5 : 6;
  const trackYOffset = compact ? 3 : 4;
  const statBarBaseStyle = {
    depth: DEPTH_CONTENT + 1,
    width: 258,
    height: barHeight,
    trackYOffset,
    labelWidth: 22,
    valueWidth: 50,
    valueGap: 6,
    labelFontSize: compact ? "9px" : "10px",
    labelFontStyle: "bold",
    labelFontFamily: "Trebuchet MS",
    valueFontSize: compact ? "9px" : "10px",
    valueFontStyle: "bold",
    valueFontFamily: "Courier New",
    valueColor: FF6_BAR_TEXT,
    track: FF6_TRACK,
    trackShadow: 0x08111f,
    trackInner: FF6_TRACK_INNER,
    stroke: 0xa7c7ff,
    strokeWidth: 1,
    tickHeight: compact ? 3 : 4,
  };

  const hpBar = drawLabeledStatBar(
    scene,
    infoX,
    compactBarTop,
    statBarBaseStyle.width,
    member.hp,
    member.max_hp,
    "HP",
    {
      ...statBarBaseStyle,
      labelColor: colorHex(hpColorFor(member.hp, member.max_hp)),
      fill: hpColorFor(member.hp, member.max_hp),
      fillShadow: 0x0d3a1f,
      highlightFill: 0xffffff,
      tickCount: 3,
      valueText: statValueText(member.hp, member.max_hp),
    },
  );
  const mpBar = drawLabeledStatBar(
    scene,
    infoX,
    compactBarTop + compactBarGap,
    statBarBaseStyle.width,
    member.mp || 0,
    member.max_mp || 0,
    "MP",
    {
      ...statBarBaseStyle,
      labelColor: "#92b5ff",
      fill: 0x4d83ff,
      fillShadow: 0x102458,
      highlightFill: 0xffffff,
      tickCount: 3,
      valueText:
        (member.max_mp || 0) > 0
          ? statValueText(member.mp || 0, member.max_mp || 0)
          : "\u2014",
    },
  );
  const xpBar = drawLabeledStatBar(
    scene,
    infoX,
    compactBarTop + compactBarGap * 2,
    statBarBaseStyle.width,
    member.xp,
    member.xp_next,
    "XP",
    {
      ...statBarBaseStyle,
      labelColor: "#ffe18a",
      fill: 0xe0b14d,
      fillShadow: 0x624218,
      highlightFill: 0xffffff,
      tickCount: 0,
      valueText: statValueText(member.xp, member.xp_next),
    },
  );
  hpBar.track.__kithlandsPartyMenu = {
    role: "stat_bar_track",
    slot,
    prefix: "HP",
  };
  mpBar.track.__kithlandsPartyMenu = {
    role: "stat_bar_track",
    slot,
    prefix: "MP",
  };
  xpBar.track.__kithlandsPartyMenu = {
    role: "stat_bar_track",
    slot,
    prefix: "XP",
  };
  group.push(
    ...hpBar.extras,
    hpBar.prefixLabel,
    hpBar.track,
    hpBar.fill,
    hpBar.valueLabel,
    ...mpBar.extras,
    mpBar.prefixLabel,
    mpBar.track,
    mpBar.fill,
    mpBar.valueLabel,
    ...xpBar.extras,
    xpBar.prefixLabel,
    xpBar.track,
    xpBar.fill,
    xpBar.valueLabel,
  );

  const rowHandle = {
    slot,
    hovered: false,
    repaint() {
      const selected = scene.partyMenuState?.selectedSlot === slot;
      const fill = !alive
        ? FF6_ROW_FILL_DEAD
        : selected
          ? FF6_ROW_FILL_SELECTED
          : rowHandle.hovered
            ? FF6_ROW_FILL_HOVER
            : FF6_ROW_FILL;
      const stroke = selected
        ? FF6_GOLD
        : rowHandle.hovered
          ? FF6_ROW_GLOW
          : FF6_BLUE;
      rowBg.setFillStyle(fill, 0.98);
      rowBg.setStrokeStyle(2, stroke);
      rowInner.setStrokeStyle(
        1,
        selected ? FF6_GOLD : rowHandle.hovered ? FF6_ROW_GLOW : 0x7fa7de,
        0.85,
      );
      rowGlow.setVisible(selected);
      rowGlow.setAlpha(selected ? 0.18 : 0.08);
      portraitBackdrop.setStrokeStyle(
        2,
        selected ? FF6_GOLD : rowHandle.hovered ? FF6_ROW_GLOW : portraitAccent,
      );
      portraitPlate.setStrokeStyle(1, selected ? FF6_GOLD : 0xe7f2ff, 0.8);
      portraitFrame.setStrokeStyle(
        2,
        selected ? FF6_GOLD : rowHandle.hovered ? FF6_ROW_GLOW : portraitAccent,
      );
      rowBg.__kithlandsPartyMenu = {
        role: "row",
        slot,
        state: selected ? "selected" : rowHandle.hovered ? "hover" : "default",
      };
    },
  };
  scene.partyMenuState?.rows.push(rowHandle);

  rowBg.on("pointerover", () => {
    rowHandle.hovered = true;
    rowHandle.repaint();
  });
  rowBg.on("pointerout", () => {
    rowHandle.hovered = false;
    rowHandle.repaint();
  });
  rowBg.on("pointerdown", () => selectPartySlot(scene, slot));
  rowBg.on("pointerup", () => {
    selectPartySlot(scene, slot);
    showEquipmentScreen(scene, slot);
  });
}

function hpColorFor(hp, max) {
  const pct = hpBarColorPct(hp, max);
  if (pct > 0.5) return 0x44ff44;
  if (pct > 0.25) return 0xff8800;
  if (pct > 0) return 0xff0000;
  return 0x333333;
}

function resolvePortraitTextureKey(scene, member) {
  const candidates = [
    member?.sprite_id,
    member?.class_id,
    String(member?.class_name || "")
      .trim()
      .toLowerCase(),
  ];
  return candidates.find((key) => key && scene.textures.exists(key)) || null;
}

function colorHex(color) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function statValueText(cur, max) {
  return `${Math.max(0, cur || 0)} / ${Math.max(0, max || 0)}`;
}

function selectPartySlot(scene, slot) {
  if (!scene.partyMenuState) return;
  scene.partyMenuState.selectedSlot = slot;
  repaintPartyRows(scene);
}

function repaintPartyRows(scene) {
  for (const row of scene.partyMenuState?.rows || []) {
    row.repaint();
  }
}

// Horizontally layout a row of drawButton specs centered on `cx`. Returns
// the list of button handles (in order) so the caller can mutate individual
// ones (setLabel, setEnabled) later. 12px gap between buttons.
function layoutButtonRow(scene, group, cx, y, specs) {
  const gap = specs.some((spec) => spec.primary) ? 12 : 8;
  const totalW =
    specs.reduce((sum, s) => sum + s.w, 0) + gap * (specs.length - 1);
  let cursor = cx - totalW / 2;
  const handles = [];
  for (const spec of specs) {
    const bx = cursor + spec.w / 2;
    const btn = drawActionButton(scene, group, bx, y, spec.w, spec.label, spec);
    if (spec.enabled === false) btn.setEnabled(false);
    handles.push(btn);
    cursor += spec.w + gap;
  }
  return handles;
}

function drawActionButton(scene, group, x, y, w, label, spec) {
  const primary = !!spec.primary;
  const h = primary ? 38 : 30;
  const btn = drawButton(scene, x, y, w, h, label, spec.onClick, {
    fontSize: primary ? "10px" : "9px",
    fontStyle: "bold",
    fontFamily: "Trebuchet MS",
    fill: primary ? 0x23497c : 0x1b3660,
    fillHover: primary ? 0x3166a3 : 0x27538a,
    fillPress: primary ? 0x183b65 : 0x17304d,
    fillDisabled: 0x10192d,
    fillActive: primary ? 0x3166a3 : 0x27538a,
    stroke: 0xb6d2ff,
    strokeActive: FF6_GOLD,
    strokeWidth: 2,
    depth: DEPTH_CONTENT + 1,
  });
  btn.label.setOrigin(0, 0.5);
  btn.label.x = x - w / 2 + 34;
  btn.label.y = y + (primary ? 1 : 0);
  applyTextGlow(btn.label, "#0d1830", 1);
  group.push(btn);

  const ornament = scene.add
    .rectangle(x, y - h / 2 + 5, w - 12, 6, 0xffffff, primary ? 0.12 : 0.08)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);

  const iconObjects = [ornament];
  const iconX = x - w / 2 + 16;
  const iconY = y;
  if (spec.iconKey && scene.textures.exists(spec.iconKey)) {
    const icon = scene.add
      .image(iconX, iconY, spec.iconKey)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 3);
    const srcSize = Math.max(icon.width || 16, icon.height || 16);
    icon.setScale((primary ? 15 : 13) / srcSize);
    icon.__kithlandsPartyMenuAction = {
      label,
      hotkey: spec.hotkey || null,
      kind: "image",
      key: spec.iconKey,
    };
    iconObjects.push(icon);
  } else if (spec.iconFallback) {
    const badge = scene.add
      .rectangle(
        iconX,
        iconY,
        primary ? 18 : 16,
        primary ? 18 : 16,
        0x0d1830,
        1,
      )
      .setStrokeStyle(1, FF6_GLOW)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 2);
    badge.__kithlandsPartyMenuAction = {
      label,
      hotkey: spec.hotkey || null,
      kind: "fallback",
      key: spec.iconFallback || null,
    };
    const glyph = scene.add
      .text(iconX, iconY, spec.iconFallback || "?", {
        fontSize: primary ? "9px" : "8px",
        fontStyle: "bold",
        color: "#d7ecff",
        fontFamily: "Courier New",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 3);
    iconObjects.push(badge, glyph);
  }

  let hotkeyText = null;
  if (spec.hotkey) {
    hotkeyText = scene.add
      .text(x + w / 2 - 10, y, `[${spec.hotkey}]`, {
        fontSize: primary ? "10px" : "9px",
        fontStyle: "bold",
        color: "#fff0ad",
        fontFamily: "Courier New",
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 3);
    hotkeyText.__kithlandsPartyMenuAction = {
      label,
      hotkey: spec.hotkey,
      kind: "hotkey",
      key: spec.hotkey,
    };
    iconObjects.push(hotkeyText);
  }

  group.push(...iconObjects);

  const baseSetEnabled = btn.setEnabled;
  btn.setEnabled = (enabled) => {
    baseSetEnabled(enabled);
    for (const obj of iconObjects) {
      if (typeof obj.setAlpha === "function") obj.setAlpha(enabled ? 1 : 0.45);
      obj.alpha = enabled ? 1 : 0.45;
    }
    if (hotkeyText && typeof hotkeyText.setColor === "function") {
      hotkeyText.setColor(enabled ? "#fff0ad" : "#8f8a72");
    }
  };
  return btn;
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
  const buildingSideQuests = Array.isArray(gs.building_side_quests)
    ? gs.building_side_quests
    : [];
  const currentIdx = gs.current_quest ?? 0;
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
      `${Math.min(currentIdx, quests.length)} complete   ${Math.max(0, quests.length - currentIdx)} main objectives remain`,
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

    if (currentIdx < quests.length) {
      const q = quests[currentIdx];
      y = renderQuestBlock(scene, overlay, q, 70, y, "current");
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

    const upcoming = quests.slice(currentIdx + 1);
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
  const card = scene.add
    .rectangle(x + 315, y + 42, 630, cardH, 0x0b1729, 0.72)
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

  return Math.max(y, card.y + cardH / 2 + 10);
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
