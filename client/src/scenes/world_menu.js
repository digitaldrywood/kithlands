import { showObjectiveQuestLog } from "./objective_quest_log.js";
import { saveGame, equipItem } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { getAutosaveEnabled, setAutosaveEnabled } from "../systems/prefs.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { canShowWorldMap, showWorldMap } from "./world_interact.js";
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
import { partyMenuLayout } from "./party_menu_layout.js";
import { drawPanel, drawButton, drawLabeledStatBar } from "../ui/panel.js";
import { combatantConditionLabel, hpBarColorPct } from "../systems/hpBar.js";
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

const DEPTH_BG = 40;
const DEPTH_CONTENT = 41;
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

export function buildPartyMemberScanContext(member = {}) {
  const xp = Math.max(0, Number(member.xp) || 0);
  const xpNext = Math.max(0, Number(member.xp_next) || 0);
  return {
    xpRemaining: xpNext > 0 ? Math.max(0, xpNext - xp) : null,
    status: combatantConditionLabel(member.hp, member.max_hp, member.status),
  };
}

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
  const party = Array.isArray(gs.party) ? gs.party : [];
  const layout = partyMenuLayout({
    viewportWidth: globalThis.window?.innerWidth ?? 800,
    viewportHeight: globalThis.window?.innerHeight ?? 600,
    partyCount: party.length,
  });
  scene.partyMenuLayout = layout;
  scene.partyMenuPreviousGameSize = {
    width: scene.scale.gameSize.width,
    height: scene.scale.gameSize.height,
  };
  if (
    scene.scale.gameSize.width !== layout.gameWidth ||
    scene.scale.gameSize.height !== layout.gameHeight
  ) {
    scene.scale.setGameSize(layout.gameWidth, layout.gameHeight);
  }
  if (!scene.partyMenuShutdownHook) {
    scene.partyMenuShutdownHook = true;
    scene.events.once("shutdown", () => {
      restorePartyMenuGameSize(scene);
      scene.partyMenuShutdownHook = false;
    });
  }

  if (layout.mode === "mobile") {
    const scrim = scene.add
      .rectangle(
        layout.gameWidth / 2,
        layout.gameHeight / 2,
        layout.gameWidth,
        layout.gameHeight,
        0x020711,
        0.96,
      )
      .setScrollFactor(0)
      .setDepth(DEPTH_BG - 1)
      .setInteractive();
    scene.menuGroup.push(scrim);
  }

  const panel = drawPanel(
    scene,
    layout.panel.x,
    layout.panel.y,
    layout.panel.width,
    layout.panel.height,
    {
      depth: DEPTH_BG,
      interactive: false,
      variant: MENU_FRAME_VARIANT,
    },
  );
  scene.menuGroup.push(panel.bg);

  const title = scene.add
    .text(layout.title.x, layout.title.y, "PARTY MENU", {
      fontSize: `${layout.title.fontSize}px`,
      fontStyle: "bold",
      color: "#fff5c2",
      fontFamily: "Georgia",
    })
    .setOrigin(layout.title.originX, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  applyTextGlow(title, "#2c5f9d", 2);
  scene.menuGroup.push(title);

  const resourceStrip = [
    {
      key: "gold",
      value: gs.gold || 0,
      width: layout.resources.widths[0],
      iconKey: "icon_gold",
      accent: 0xf8d56c,
    },
    {
      key: "potions",
      value: gs.potions || 0,
      width: layout.resources.widths[1],
      iconKey: "icon_potion",
      accent: 0x8ed2ff,
    },
    {
      key: "ether",
      value: (gs.ethers || 0) + (gs.hi_ethers || 0) + (gs.x_ethers || 0),
      width: layout.resources.widths[2],
      accent: 0xc8b6ff,
      iconType: "orb",
    },
  ];
  let resourceCursor = layout.resources.right;
  for (let i = resourceStrip.length - 1; i >= 0; i -= 1) {
    const spec = {
      ...resourceStrip[i],
      height: layout.resources.height,
      fontSize: layout.resources.fontSize,
      mobile: layout.mode === "mobile",
    };
    const chip = drawResourceChip(
      scene,
      scene.menuGroup,
      resourceCursor - spec.width / 2,
      layout.resources.y,
      spec.width,
      spec,
    );
    resourceCursor -= chip.width + layout.resources.gap;
  }

  const dividerShadow = scene.add
    .rectangle(
      layout.panel.x,
      layout.dividerY + 2,
      layout.panel.width - 64,
      2,
      0x071123,
      0.55,
    )
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const divider = scene.add
    .rectangle(
      layout.panel.x,
      layout.dividerY,
      layout.panel.width - 72,
      2,
      0x8ebeff,
      0.72,
    )
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  scene.menuGroup.push(dividerShadow, divider);

  // Body: party rows. Row height scales so 4 or 6 members both fit cleanly.
  const rowH = layout.body.rowHeight;
  for (let i = 0; i < party.length; i++) {
    const p = party[i];
    drawPartyRow(
      scene,
      scene.menuGroup,
      layout.body.x,
      layout.body.y + i * rowH,
      layout.body.width,
      rowH,
      p,
      i,
      { mobile: layout.mode === "mobile" },
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
  const primaryActions = [
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
  ];
  layoutActionButtons(
    scene,
    scene.menuGroup,
    layout.panel.x,
    layout.actions.primaryY,
    primaryActions,
    layout.actions,
  );

  // Footer row B — save / autosave / close.
  const autoEnabled = getAutosaveEnabled();
  let saveHandle = null;
  let autoHandle = null;
  const secondaryActions = [
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
      enabled: canShowWorldMap(scene),
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
  ];
  const row = layoutActionButtons(
    scene,
    scene.menuGroup,
    layout.panel.x,
    layout.actions.secondaryY,
    secondaryActions,
    layout.actions,
  );
  [saveHandle, autoHandle] = [row[2], row[3]];
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
  restorePartyMenuGameSize(scene);
  if (scene.menuOpen) {
    scene.menuOpen = false;
    resumeWorldFor(scene, "party_menu");
  }
}

function restorePartyMenuGameSize(scene) {
  const previous = scene.partyMenuPreviousGameSize;
  scene.partyMenuPreviousGameSize = null;
  if (!previous) return;
  if (
    scene.scale.gameSize.width !== previous.width ||
    scene.scale.gameSize.height !== previous.height
  ) {
    scene.scale.setGameSize(previous.width, previous.height);
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
  const mobile = !!spec.mobile;
  const height = spec.height || 24;
  const chipShadow = scene.add
    .rectangle(x + 2, y + 2, w, height, 0x071123, 0.4)
    .setStrokeStyle(0)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const chipBg = scene.add
    .rectangle(x, y, w, height, 0x1a3156, 0.98)
    .setStrokeStyle(2, FF6_GLOW)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  chipBg.__kithlandsPartyMenu = { role: "resource_chip", key: spec.key };
  const chipInner = scene.add
    .rectangle(x, y, w - 6, height - 6, 0x10203d, 0.95)
    .setStrokeStyle(1, spec.accent || FF6_GOLD)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);

  const iconX = x - w / 2 + (mobile ? 30 : 15);
  const iconY = y;
  if (spec.iconKey && scene.textures.exists(spec.iconKey)) {
    const icon = scene.add
      .image(iconX, iconY, spec.iconKey)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 3);
    const srcSize = Math.max(icon.width || 16, icon.height || 16);
    icon.setScale((mobile ? 28 : 13) / srcSize);
    group.push(icon);
  } else if (spec.iconType === "orb") {
    const orb = scene.add
      .circle(iconX, iconY, mobile ? 13 : 6, spec.accent || 0xc8b6ff, 1)
      .setStrokeStyle(mobile ? 2 : 1, 0xf4f7ff, 0.9)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 3);
    const orbHighlight = scene.add
      .circle(
        iconX - (mobile ? 4 : 2),
        iconY - (mobile ? 4 : 2),
        mobile ? 4 : 2,
        0xffffff,
        0.65,
      )
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 4);
    group.push(orb, orbHighlight);
  }

  const value = scene.add
    .text(x - w / 2 + (mobile ? 56 : 28), y, `${spec.value}`, {
      fontSize: `${spec.fontSize || 12}px`,
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
function drawPartyRow(
  scene,
  group,
  x,
  y,
  w,
  rowH,
  member,
  slot,
  { mobile = false } = {},
) {
  const alive = (member.hp || 0) > 0;
  const compact = mobile ? rowH < 150 : rowH < 64;
  const frameH = Math.max(mobile ? (compact ? 104 : 150) : 52, rowH - 8);
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
  const portraitX = x + (mobile ? (compact ? 54 : 70) : 40);
  const portraitBackdropWidth = mobile ? (compact ? 82 : 112) : 60;
  const portraitBackdropHeight = mobile
    ? Math.min(frameH - 16, compact ? 90 : 138)
    : frameH - 10;
  const portraitPlateSize = mobile ? (compact ? 70 : 104) : compact ? 40 : 44;
  const portraitFrameSize = mobile ? (compact ? 62 : 94) : compact ? 34 : 38;
  const portraitBackdrop = scene.add
    .rectangle(
      portraitX,
      centerY,
      portraitBackdropWidth,
      portraitBackdropHeight,
      0x0b1324,
      0.98,
    )
    .setStrokeStyle(2, portraitAccent)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  const portraitPlate = scene.add
    .rectangle(
      portraitX,
      centerY,
      portraitPlateSize,
      portraitPlateSize,
      formationRow === "back" ? 0x27395e : 0x4b3e24,
      1,
    )
    .setStrokeStyle(1, 0xe7f2ff, 0.8)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);
  const portraitFrame = scene.add
    .rectangle(
      portraitX,
      centerY,
      portraitFrameSize,
      portraitFrameSize,
      0x162949,
      1,
    )
    .setStrokeStyle(2, portraitAccent)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 3);
  group.push(portraitBackdrop, portraitPlate, portraitFrame);

  const portraitKey = resolvePortraitTextureKey(scene, member);
  if (portraitKey) {
    const portrait = scene.add
      .image(portraitX, centerY, portraitKey)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 4);
    const srcSize = Math.max(portrait.width || 64, portrait.height || 64);
    portrait.setScale(
      (mobile ? portraitFrameSize - 8 : compact ? 34 : 38) / srcSize,
    );
    portrait.__kithlandsPartyMenu = {
      role: "portrait",
      slot,
      kind: "image",
      key: portraitKey,
    };
    group.push(portrait);
  } else {
    const fallbackBg = scene.add
      .rectangle(
        portraitX,
        centerY,
        mobile ? portraitFrameSize - 8 : 34,
        mobile ? portraitFrameSize - 8 : 34,
        0x10233f,
        1,
      )
      .setStrokeStyle(1, 0x88ccff)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 4);
    fallbackBg.__kithlandsPartyMenu = {
      role: "portrait",
      slot,
      kind: "fallback",
    };
    const fallbackGlyph = scene.add
      .text(portraitX, centerY, (member.class_name || "?")[0] || "?", {
        fontSize: mobile
          ? compact
            ? "34px"
            : "46px"
          : compact
            ? "18px"
            : "20px",
        fontStyle: "bold",
        color: "#eef7ff",
        fontFamily: "Georgia",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 5);
    group.push(fallbackBg, fallbackGlyph);
  }

  const infoX = x + (mobile ? (compact ? 104 : 134) : 80);
  const nameText = scene.add
    .text(
      infoX,
      top + (mobile ? (compact ? 8 : 14) : compact ? 5 : 7),
      member.name,
      {
        fontSize: mobile
          ? compact
            ? "20px"
            : "26px"
          : compact
            ? "13px"
            : "15px",
        fontStyle: "bold",
        color: alive ? "#f7fbff" : "#a1adbe",
        fontFamily: "Trebuchet MS",
      },
    )
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);
  applyTextGlow(nameText, "#0d1830", 1);

  const levelFrame = scene.add
    .rectangle(
      x + w - (mobile ? 68 : 42),
      top + (mobile ? (compact ? 18 : 26) : compact ? 13 : 15),
      mobile ? 112 : 66,
      mobile ? (compact ? 34 : 42) : compact ? 18 : 20,
      0x132947,
      0.98,
    )
    .setStrokeStyle(2, FF6_GOLD_DARK)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 1);
  const levelInner = scene.add
    .rectangle(
      x + w - (mobile ? 68 : 42),
      top + (mobile ? (compact ? 18 : 26) : compact ? 13 : 15),
      mobile ? 102 : 58,
      mobile ? (compact ? 24 : 30) : compact ? 12 : 14,
      0x2b4a75,
      0.9,
    )
    .setStrokeStyle(1, FF6_GOLD)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);
  const levelText = scene.add
    .text(
      x + w - (mobile ? 68 : 42),
      top + (mobile ? (compact ? 18 : 26) : compact ? 13 : 15),
      `Lv ${member.level}`,
      {
        fontSize: mobile
          ? compact
            ? "16px"
            : "19px"
          : compact
            ? "9px"
            : "10px",
        fontStyle: "bold",
        color: "#fff5d1",
        fontFamily: "Courier New",
      },
    )
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 3);

  const classText = scene.add
    .text(
      infoX,
      top + (mobile ? (compact ? 34 : 46) : compact ? 17 : 21),
      member.class_name || "Adventurer",
      {
        fontSize: mobile
          ? compact
            ? "14px"
            : "17px"
          : compact
            ? "9px"
            : "10px",
        fontStyle: "italic",
        color: alive ? "#d2bdd7" : "#7b8193",
        fontFamily: "Georgia",
      },
    )
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);
  classText.__kithlandsPartyMenu = { role: "class_text", slot };
  group.push(nameText, levelFrame, levelInner, levelText, classText);

  const compactBarTop =
    top + (mobile ? (compact ? 54 : 70) : compact ? 27 : 33);
  const compactBarGap = mobile ? (compact ? 19 : 27) : compact ? 9 : 11;
  const barHeight = mobile ? (compact ? 8 : 12) : compact ? 5 : 6;
  const trackYOffset = mobile ? (compact ? 5 : 7) : compact ? 3 : 4;
  const statBarBaseStyle = {
    depth: DEPTH_CONTENT + 1,
    width: mobile ? (compact ? 390 : 430) : 258,
    height: barHeight,
    trackYOffset,
    labelWidth: mobile ? 40 : 22,
    valueWidth: mobile ? (compact ? 100 : 116) : 50,
    valueGap: mobile ? 12 : 6,
    labelFontSize: mobile
      ? compact
        ? "14px"
        : "18px"
      : compact
        ? "9px"
        : "10px",
    labelFontStyle: "bold",
    labelFontFamily: "Trebuchet MS",
    valueFontSize: mobile
      ? compact
        ? "14px"
        : "18px"
      : compact
        ? "9px"
        : "10px",
    valueFontStyle: "bold",
    valueFontFamily: "Courier New",
    valueColor: FF6_BAR_TEXT,
    track: FF6_TRACK,
    trackShadow: 0x08111f,
    trackInner: FF6_TRACK_INNER,
    stroke: 0xa7c7ff,
    strokeWidth: 1,
    tickHeight: mobile ? (compact ? 5 : 8) : compact ? 3 : 4,
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
  const scanContext = buildPartyMemberScanContext(member);
  const contextY = mobile
    ? top + frameH - (compact ? 10 : 16)
    : compactBarTop + compactBarGap * 2;
  const nextLevelText = scene.add
    .text(
      x + w - (mobile ? (compact ? 224 : 250) : 190),
      contextY,
      scanContext.xpRemaining == null
        ? "NEXT  —"
        : `NEXT  ${scanContext.xpRemaining} XP`,
      {
        fontSize: mobile
          ? compact
            ? "13px"
            : "16px"
          : compact
            ? "8px"
            : "9px",
        fontStyle: "bold",
        color: "#f4d881",
        fontFamily: "Courier New",
      },
    )
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);
  nextLevelText.__kithlandsPartyMenu = {
    role: "next_level",
    slot,
    value: scanContext.xpRemaining,
  };
  const contextObjects = [nextLevelText];
  if (scanContext.status) {
    const statusText = scene.add
      .text(mobile ? infoX : x + w - 320, contextY, scanContext.status, {
        fontSize: mobile
          ? compact
            ? "13px"
            : "16px"
          : compact
            ? "8px"
            : "9px",
        fontStyle: "bold",
        color: "#ffb38a",
        fontFamily: "Courier New",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 2);
    statusText.__kithlandsPartyMenu = {
      role: "status",
      slot,
      value: scanContext.status,
    };
    contextObjects.push(statusText);
  }
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
    ...contextObjects,
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

function layoutActionButtons(scene, group, cx, y, specs, layout) {
  if (layout.mode !== "grid") {
    return layoutButtonRow(scene, group, cx, y, specs);
  }
  return layoutButtonGrid(scene, group, cx, y, specs, layout);
}

function layoutButtonGrid(scene, group, cx, firstY, specs, layout) {
  const columns = Math.max(1, layout.columns || 1);
  const width = layout.buttonWidth || 220;
  const gap = layout.columnGap || 12;
  const rowGap = layout.rowGap || 104;
  const handles = [];

  for (let start = 0; start < specs.length; start += columns) {
    const rowSpecs = specs.slice(start, start + columns);
    const totalW = rowSpecs.length * width + (rowSpecs.length - 1) * gap;
    let cursor = cx - totalW / 2;
    const rowIndex = Math.floor(start / columns);
    for (const spec of rowSpecs) {
      const x = cursor + width / 2;
      const mobileSpec = { ...spec, mobile: true, w: width };
      const button = drawActionButton(
        scene,
        group,
        x,
        firstY + rowIndex * rowGap,
        width,
        spec.label,
        mobileSpec,
      );
      if (spec.enabled === false) button.setEnabled(false);
      handles.push(button);
      cursor += width + gap;
    }
  }

  return handles;
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
  const mobile = !!spec.mobile;
  const h = mobile ? 92 : primary ? 38 : 30;
  const btn = drawButton(scene, x, y, w, h, label, spec.onClick, {
    fontSize: mobile ? "24px" : primary ? "10px" : "9px",
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
  btn.bg.__kithlandsPartyMenuAction = {
    label,
    hotkey: spec.hotkey || null,
    kind: "button",
    key: null,
  };
  btn.label.setOrigin(0, 0.5);
  btn.label.x = x - w / 2 + (mobile ? 62 : 34);
  btn.label.y = y + (primary ? 1 : 0);
  applyTextGlow(btn.label, "#0d1830", 1);
  group.push(btn);

  const ornament = scene.add
    .rectangle(
      x,
      y - h / 2 + (mobile ? 10 : 5),
      w - (mobile ? 20 : 12),
      mobile ? 10 : 6,
      0xffffff,
      primary ? 0.12 : 0.08,
    )
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT + 2);

  const iconObjects = [ornament];
  const iconX = x - w / 2 + (mobile ? 34 : 16);
  const iconY = y;
  if (spec.iconKey && scene.textures.exists(spec.iconKey)) {
    const icon = scene.add
      .image(iconX, iconY, spec.iconKey)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 3);
    const srcSize = Math.max(icon.width || 16, icon.height || 16);
    icon.setScale((mobile ? 34 : primary ? 15 : 13) / srcSize);
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
        mobile ? 40 : primary ? 18 : 16,
        mobile ? 40 : primary ? 18 : 16,
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
        fontSize: mobile ? "20px" : primary ? "9px" : "8px",
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
      .text(x + w / 2 - (mobile ? 18 : 10), y, `[${spec.hotkey}]`, {
        fontSize: mobile ? "18px" : primary ? "10px" : "9px",
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
