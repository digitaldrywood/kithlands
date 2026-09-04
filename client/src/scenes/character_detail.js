import { drawPanel, drawButton, drawLabeledStatBar } from "../ui/panel.js";
import { hpBarColorPct } from "../systems/hpBar.js";
import { showEquipPicker } from "./world_menu.js";
import { showGemWorkshop } from "./gem_workshop.js";
import { showEquipmentScreen } from "./equipment_screen.js";
import { buildFieldSpellList, showFieldMagicMenu } from "./field_magic.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { characterDetailLayout } from "./character_detail_layout.js";
import {
  applyMenuOverlayGameSize,
  restoreMenuOverlayGameSize,
} from "./menu_overlay_layout.js";

// Depth layering. The party menu panel sits at 40-41; character detail
// sits above it at 60+ so it can be opened over the menu or standalone
// without z-fighting.
const DEPTH_BG = 60;
const DEPTH_CONTENT = 61;
const DEPTH_LABEL = 62;

// Opens the detail overlay for a single party member. Idempotent: calling
// twice closes the previous instance before opening the new one, so the
// equip-picker return path can safely re-open for the same or different
// hero without leaking Phaser objects.
export function openCharacterDetail(scene, partyIndex) {
  if (scene.characterDetailGroup) closeCharacterDetail(scene);

  const gs = scene.gameState;
  const member = gs && gs.party ? gs.party[partyIndex] : null;
  if (!member) return;
  const equip = (gs.equipment && gs.equipment[partyIndex]) || {};

  const layout = characterDetailLayout({
    viewportWidth: globalThis.window?.innerWidth ?? 800,
    viewportHeight: globalThis.window?.innerHeight ?? 600,
  });
  const previousGameSize = scene?.scale?.gameSize
    ? applyMenuOverlayGameSize(scene, layout)
    : null;

  pauseWorldFor(scene, "character_detail");
  scene.characterDetailGroup = [];
  scene.characterDetailIndex = partyIndex;
  const group = scene.characterDetailGroup;
  const state = {
    layout,
    previousGameSize,
    panel: null,
    previousButton: null,
    nextButton: null,
    loadoutButton: null,
    closeButton: null,
    equipmentCards: [],
  };
  scene.characterDetailState = state;

  const panel = drawPanel(
    scene,
    layout.shell.x,
    layout.shell.y,
    layout.shell.width,
    layout.shell.height,
    {
      depth: DEPTH_BG,
      fill: 0x071328,
      fillAlpha: 0.98,
      stroke: 0x76a9eb,
      strokeWidth: layout.mode === "mobile" ? 4 : 2,
    },
  );
  panel.bg.characterDetailMeta = { role: "shell" };
  state.panel = panel.bg;
  group.push(panel.bg);

  const positionLabel = formatCharacterDetailPosition(gs.party, partyIndex);
  const previousLayout = layout.header.previous;
  const prevBtn = drawButton(
    scene,
    previousLayout.x,
    previousLayout.y,
    previousLayout.width,
    previousLayout.height,
    "<",
    () => cycleCharacterDetail(scene, -1),
    { depth: DEPTH_LABEL, fontSize: `${previousLayout.fontSize}px` },
  );
  const nextLayout = layout.header.next;
  const nextBtn = drawButton(
    scene,
    nextLayout.x,
    nextLayout.y,
    nextLayout.width,
    nextLayout.height,
    ">",
    () => cycleCharacterDetail(scene, 1),
    { depth: DEPTH_LABEL, fontSize: `${nextLayout.fontSize}px` },
  );
  prevBtn.bg.characterDetailMeta = { role: "previous" };
  nextBtn.bg.characterDetailMeta = { role: "next" };
  state.previousButton = prevBtn;
  state.nextButton = nextBtn;
  group.push(prevBtn, nextBtn);

  // Header: name + class · level, centered, with party position shown near
  // the title strip so the player can see which member they're on.
  group.push(
    scene.add
      .text(layout.header.name.x, layout.header.name.y, member.name, {
        fontSize: `${layout.header.name.fontSize}px`,
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );

  const loadoutLayout = layout.header.loadout;
  const loadoutBtn = drawButton(
    scene,
    loadoutLayout.x,
    loadoutLayout.y,
    loadoutLayout.width,
    loadoutLayout.height,
    "FULL LOADOUT",
    () => handOffToEquipmentScreen(scene, partyIndex),
    {
      depth: DEPTH_LABEL,
      fontSize: `${loadoutLayout.fontSize}px`,
      fill: 0x1f5d48,
      fillHover: 0x2b7d62,
      stroke: 0xa5f0c8,
      strokeWidth: 1,
    },
  );
  loadoutBtn.bg.characterDetailMeta = { role: "full_loadout" };
  state.loadoutButton = loadoutBtn;
  group.push(loadoutBtn);
  group.push(
    scene.add
      .text(layout.header.position.x, layout.header.position.y, positionLabel, {
        fontSize: `${layout.header.position.fontSize}px`,
        color: "#88ccff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );
  group.push(
    scene.add
      .text(
        layout.header.className.x,
        layout.header.className.y,
        `${member.class_name} · Lv.${member.level}`,
        {
          fontSize: `${layout.header.className.fontSize}px`,
          color: "#ffcc44",
          fontFamily: "monospace",
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );

  // Divider under the title strip, matching world_menu.js.
  group.push(
    scene.add
      .rectangle(
        layout.shell.x,
        layout.header.dividerY,
        layout.header.dividerWidth,
        layout.mode === "mobile" ? 2 : 1,
        0x4488ff,
        0.6,
      )
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT),
  );

  // Desktop uses the original three-column composition. Portrait screens use
  // the same information hierarchy with a larger hero summary and touch-safe
  // equipment controls below it.
  drawPortrait(scene, group, member, layout.portrait);
  drawStatBlock(scene, group, member, equip, layout.stats);
  const equipmentInspector = drawEquipmentInspector(
    scene,
    group,
    member,
    equip,
    equip.weapon_name ? "weapon" : "armor",
    layout.equipment.inspector,
  );
  scene.characterEquipmentInspector = equipmentInspector;

  const weaponCard = layout.equipment.cards[0];
  drawEquipSlot(
    scene,
    group,
    weaponCard.x,
    weaponCard.y,
    "WEAPON",
    equip.weapon_name,
    () => handOffToEquipPicker(scene, partyIndex, "weapon"),
    {
      kind: "weapon",
      item: equip.weapon_item,
      total: equip.weapon_power,
      inspector: equipmentInspector,
      onSocket: () =>
        handOffToGemWorkshop(scene, partyIndex, equip.weapon_item?.instance_id),
      layout: layout.equipment,
      state,
    },
  );
  const armorCard = layout.equipment.cards[1];
  drawEquipSlot(
    scene,
    group,
    armorCard.x,
    armorCard.y,
    "ARMOR",
    equip.armor_name,
    () => handOffToEquipPicker(scene, partyIndex, "armor"),
    {
      kind: "armor",
      item: equip.armor_item,
      total: equip.armor_absorb,
      inspector: equipmentInspector,
      onSocket: () =>
        handOffToGemWorkshop(scene, partyIndex, equip.armor_item?.instance_id),
      layout: layout.equipment,
      state,
    },
  );

  // Bottom strip: spell list.
  drawSpells(scene, group, member, partyIndex, layout.spells);

  // Close button, mirrors the party menu footer style.
  const closeLayout = layout.close;
  const closeBtn = drawButton(
    scene,
    closeLayout.x,
    closeLayout.y,
    closeLayout.width,
    closeLayout.height,
    "CLOSE (ESC)",
    () => closeCharacterDetail(scene),
    { depth: DEPTH_LABEL, fontSize: `${closeLayout.fontSize}px` },
  );
  closeBtn.bg.characterDetailMeta = { role: "close" };
  state.closeButton = closeBtn;
  group.push(closeBtn);

  // ESC also closes. Stored so closeCharacterDetail can detach cleanly
  // if the user closes via click instead.
  const escHandler = () => closeCharacterDetail(scene);
  scene.input.keyboard.once("keydown-ESC", escHandler);
  scene.characterDetailEscHandler = escHandler;

  const leftHandler = () => cycleCharacterDetail(scene, -1);
  const rightHandler = () => cycleCharacterDetail(scene, 1);
  scene.input.keyboard.on("keydown-LEFT", leftHandler);
  scene.input.keyboard.on("keydown-RIGHT", rightHandler);
  scene.characterDetailLeftHandler = leftHandler;
  scene.characterDetailRightHandler = rightHandler;
}

export function closeCharacterDetail(scene) {
  if (!scene.characterDetailGroup) return;
  const previousGameSize = scene.characterDetailState?.previousGameSize;
  scene.characterDetailGroup.forEach((c) => c.destroy());
  scene.characterDetailGroup = null;
  scene.characterDetailIndex = null;
  scene.characterEquipmentInspector = null;
  scene.characterDetailState = null;
  if (scene.characterDetailEscHandler) {
    scene.input.keyboard.off("keydown-ESC", scene.characterDetailEscHandler);
    scene.characterDetailEscHandler = null;
  }
  if (scene.characterDetailLeftHandler) {
    scene.input.keyboard.off("keydown-LEFT", scene.characterDetailLeftHandler);
    scene.characterDetailLeftHandler = null;
  }
  if (scene.characterDetailRightHandler) {
    scene.input.keyboard.off(
      "keydown-RIGHT",
      scene.characterDetailRightHandler,
    );
    scene.characterDetailRightHandler = null;
  }
  if (scene?.scale?.gameSize) {
    restoreMenuOverlayGameSize(scene, previousGameSize);
  }
  resumeWorldFor(scene, "character_detail");
}

// handOffToEquipPicker closes the detail screen, opens the equip picker
// scoped to this hero + slot, and instructs the picker to re-open the
// detail screen on success/cancel via its returnTo hook.
function handOffToEquipPicker(scene, partyIndex, type) {
  closeCharacterDetail(scene);
  showEquipPicker(scene, partyIndex, type, {
    returnTo: { type: "character", index: partyIndex },
  });
}

function handOffToGemWorkshop(scene, partyIndex, instanceID) {
  if (!instanceID) return;
  closeCharacterDetail(scene);
  showGemWorkshop(scene, {
    preselectedInstanceID: instanceID,
    onClose: () => openCharacterDetail(scene, partyIndex),
  });
}

function handOffToEquipmentScreen(scene, partyIndex) {
  closeCharacterDetail(scene);
  showEquipmentScreen(scene, partyIndex, {
    onClose: () => openCharacterDetail(scene, partyIndex),
  });
}

function cycleCharacterDetail(scene, delta) {
  const slots = activePartySlots(scene?.gameState?.party);
  if (slots.length === 0) return;

  const currentPos = slots.indexOf(scene.characterDetailIndex);
  const basePos = currentPos >= 0 ? currentPos : 0;
  const nextPos = (basePos + delta + slots.length) % slots.length;
  openCharacterDetail(scene, slots[nextPos]);
}

function formatCharacterDetailPosition(party, partyIndex) {
  const slots = activePartySlots(party);
  if (slots.length === 0) return "0/0";
  const currentPos = slots.indexOf(partyIndex);
  const shownPos = currentPos >= 0 ? currentPos + 1 : 1;
  return `${shownPos}/${slots.length}`;
}

function activePartySlots(party) {
  const slots = [];
  for (let i = 0; i < (party || []).length; i += 1) {
    if (party[i]) slots.push(i);
  }
  return slots;
}

// ------ internal layout helpers ------

function drawPortrait(scene, group, member, layout) {
  // Framed portrait slot. Uses the class sprite (promoted -> base fallback)
  // scaled to fit a 150x150 box. Falls back to a '?' glyph if the texture
  // hasn't loaded for some reason.
  group.push(
    scene.add
      .rectangle(layout.x, layout.y, layout.width, layout.height, 0x1a2a4a, 0.9)
      .setStrokeStyle(2, 0x4488ff)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT),
  );

  const portraitKey = resolvePortraitTextureKey(scene, member);
  if (portraitKey && scene.textures.exists(portraitKey)) {
    const img = scene.add
      .image(layout.x, layout.y, portraitKey)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 1);
    const srcSize = Math.max(img.width || 64, img.height || 64);
    img.setScale(layout.imageSize / srcSize);
    group.push(img);
  } else {
    group.push(
      scene.add
        .text(layout.x, layout.y, (member.class_name || "?")[0] || "?", {
          fontSize: `${layout.fallbackFontSize}px`,
          color: "#88ccff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 1),
    );
  }
}

function drawStatBlock(scene, group, member, equip, layout) {
  // HP / MP / XP bars — re-using the integer-safe helpers from hpBar.js.
  const hpFill = hpColorFor(member.hp, member.max_hp);
  const barStyle = {
    depth: DEPTH_CONTENT,
    height: layout.barHeight,
    labelFontSize: `${layout.labelFontSize}px`,
    valueFontSize: `${layout.valueFontSize}px`,
    labelWidth: layout.labelWidth,
    valueWidth: layout.valueWidth,
  };
  const hpBar = drawLabeledStatBar(
    scene,
    layout.x,
    layout.y,
    layout.barWidth,
    member.hp,
    member.max_hp,
    "HP",
    {
      ...barStyle,
      fill: hpFill,
      labelColor: colorHex(hpFill),
    },
  );
  const mpBar = drawLabeledStatBar(
    scene,
    layout.x,
    layout.y + layout.barGap,
    layout.barWidth,
    member.mp || 0,
    member.max_mp || 0,
    "MP",
    {
      ...barStyle,
      fill: 0x88aaff,
      labelColor: "#88aaff",
      valueText: (member.max_mp || 0) > 0 ? null : "\u2014",
    },
  );
  const xpBar = drawLabeledStatBar(
    scene,
    layout.x,
    layout.y + layout.barGap * 2,
    layout.barWidth,
    member.xp,
    member.xp_next,
    "XP",
    {
      ...barStyle,
      fill: 0xffcc44,
      labelColor: "#ffcc44",
    },
  );
  group.push(
    hpBar.prefixLabel,
    hpBar.track,
    hpBar.fill,
    hpBar.valueLabel,
    mpBar.prefixLabel,
    mpBar.track,
    mpBar.fill,
    mpBar.valueLabel,
    xpBar.prefixLabel,
    xpBar.track,
    xpBar.fill,
    xpBar.valueLabel,
  );

  // Scalar stats + status + perks.
  const lines = [
    `ATK: ${derivedAttack(member, equip)}`,
    `STR: ${member.str}`,
    `AGI: ${member.agi}`,
    `INT: ${member.int_stat}`,
    `Status: ${member.status || "—"}`,
    // Perks aren't on the party model yet — render a placeholder so the
    // layout slot is reserved for when the server starts sending them.
    `Perks:  —`,
  ];
  lines.forEach((line, i) => {
    group.push(
      plainText(
        scene,
        layout.x,
        layout.y + layout.scalarOffsetY + i * layout.scalarGap,
        line,
        "#ffffff",
        `${layout.scalarFontSize}px`,
      ),
    );
  });
}

function derivedAttack(member, equip) {
  return (member?.str || 0) + (equip?.weapon_power || 0);
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

function drawEquipSlot(
  scene,
  group,
  cx,
  cy,
  slotLabel,
  itemName,
  onClick,
  { kind, item, total, inspector, onSocket, layout, state } = {},
) {
  const content = layout.cardContent;
  const card = scene.add
    .rectangle(cx, cy, layout.cardWidth, layout.cardHeight, 0x1a2a4a, 0.95)
    .setStrokeStyle(2, 0x4488ff)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT)
    .setInteractive({ useHandCursor: true });
  card.characterDetailMeta = { role: "equipment_card", slot: kind };
  card.on("pointerover", () => {
    card.setStrokeStyle(2, 0xffcc44);
    inspector?.hover(kind);
  });
  card.on("pointerout", () => {
    card.setStrokeStyle(2, 0x4488ff);
    inspector?.leave(kind);
  });
  card.on("pointerup", onClick);
  state?.equipmentCards.push(card);
  group.push(card);

  group.push(
    scene.add
      .text(cx + content.labelX, cy + content.headerY, slotLabel, {
        fontSize: `${layout.labelFontSize}px`,
        color: "#ffcc44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );
  const detailsButton = drawButton(
    scene,
    cx + content.detailsX,
    cy + content.headerY,
    layout.details.width,
    layout.details.height,
    "DETAILS",
    () => inspector?.togglePin(kind),
    {
      depth: DEPTH_LABEL,
      fontSize: `${layout.details.fontSize}px`,
      fill: 0x14233f,
      fillHover: 0x21406e,
      stroke: 0x6f9fd8,
      strokeWidth: 1,
    },
  );
  detailsButton.bg.characterDetailMeta = {
    role: "equipment_details",
    slot: kind,
  };
  group.push(detailsButton);
  group.push(
    scene.add
      .text(cx, cy + content.itemY, itemName || "(empty)", {
        fontSize: `${layout.itemFontSize}px`,
        color: itemName ? "#ffffff" : "#888888",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );
  group.push(
    scene.add
      .text(cx, cy + content.statY, compactEquipmentStat(kind, item, total), {
        fontSize: `${layout.statFontSize}px`,
        color: "#a8cfff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );
  group.push(
    scene.add
      .text(cx + content.changeX, cy + content.actionY, "CHANGE", {
        fontSize: `${layout.actionFontSize}px`,
        color: "#88ccff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );

  const hasSockets = item?.sockets?.length > 0;
  const appliedGems = (item?.sockets || [])
    .filter((socket) => socket.gem_id)
    .map((socket) => socket.gem_name || "GEM");
  if (item?.instance_id && hasSockets) {
    const hasOpenSocket = item.sockets.some((socket) => !socket.gem_id);
    const workshopLabel = hasOpenSocket
      ? "SOCKET"
      : `◆ ${appliedGems.join(" + ").toUpperCase()}`;
    const socketButton = drawButton(
      scene,
      cx + content.socketX,
      cy + content.actionY,
      layout.socket.width,
      layout.socket.height,
      workshopLabel,
      onSocket,
      {
        depth: DEPTH_LABEL,
        fontSize: `${layout.socket.fontSize}px`,
        fill: 0x1f5d48,
        fillHover: 0x2b7d62,
        stroke: 0xa5f0c8,
        strokeWidth: 1,
      },
    );
    group.push(socketButton);
  } else {
    const socketStatus =
      appliedGems.length > 0
        ? `◆ ${appliedGems.join(" + ").toUpperCase()}`
        : item?.instance_id
          ? "SOCKETS FULL"
          : "NO SOCKETS";
    group.push(
      scene.add
        .text(cx + content.socketX, cy + content.actionY, socketStatus, {
          fontSize: `${layout.statFontSize}px`,
          color: appliedGems.length > 0 ? "#8ff0a4" : "#6f819c",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH_LABEL),
    );
  }
}

export function buildEquipmentBreakdown(item, kind, fallbackTotal = 0) {
  const stat = kind === "armor" ? "absorb" : "power";
  const statLabel = kind === "armor" ? "ABSORB" : "POWER";
  const itemTotal = Number(item?.[stat]);
  const fallback = Number(fallbackTotal);
  const total = Number.isFinite(itemTotal)
    ? itemTotal
    : Number.isFinite(fallback)
      ? fallback
      : 0;
  const additions = [];

  for (const affix of item?.affixes || []) {
    if (affix?.stat !== stat || !Number.isFinite(Number(affix?.value))) {
      continue;
    }
    additions.push({
      source: affix.name || "Affix",
      value: Number(affix.value),
      type: "affix",
    });
  }
  for (const socket of item?.sockets || []) {
    if (
      !socket?.gem_id ||
      socket?.stat !== stat ||
      !Number.isFinite(Number(socket?.value))
    ) {
      continue;
    }
    additions.push({
      source: socket.gem_name || "Socketed gem",
      value: Number(socket.value),
      type: "gem",
    });
  }

  return {
    kind,
    stat,
    statLabel,
    total,
    base: total - additions.reduce((sum, entry) => sum + entry.value, 0),
    additions,
  };
}

function compactEquipmentStat(kind, item, fallbackTotal) {
  const breakdown = buildEquipmentBreakdown(item, kind, fallbackTotal);
  return `${titleCase(breakdown.stat)} ${breakdown.total}`;
}

function drawEquipmentInspector(
  scene,
  group,
  member,
  equip,
  defaultSlot,
  layout,
) {
  const slots = {
    weapon: {
      kind: "weapon",
      name: equip.weapon_name || "(empty)",
      item: equip.weapon_item,
      total: equip.weapon_power,
    },
    armor: {
      kind: "armor",
      name: equip.armor_name || "(empty)",
      item: equip.armor_item,
      total: equip.armor_absorb,
    },
  };
  const state = { activeSlot: defaultSlot, pinnedSlot: null };
  const left = layout.x - layout.width / 2 + layout.horizontalPadding;
  const right = layout.x + layout.width / 2 - layout.horizontalPadding;
  const top = layout.top;

  const panel = scene.add
    .rectangle(
      layout.x,
      top + layout.height / 2,
      layout.width,
      layout.height,
      0x10213c,
      0.98,
    )
    .setStrokeStyle(1, 0x4488ff)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  panel.characterDetailMeta = { role: "equipment_inspector" };
  group.push(panel);

  const heading = detailText(
    scene,
    left,
    top + layout.headingOffsetY,
    "EQUIPMENT DETAILS",
    "#ffcc44",
    `${layout.headingFontSize}px`,
  );
  const interaction = detailText(
    scene,
    right,
    top + layout.headingOffsetY,
    "HOVER • TAP DETAILS",
    "#88ccff",
    `${layout.interactionFontSize}px`,
  ).setOrigin(1, 0);
  const name = detailText(
    scene,
    left,
    top + layout.nameOffsetY,
    "",
    "#ffffff",
    `${layout.nameFontSize}px`,
  );
  const meta = detailText(
    scene,
    left,
    top + layout.metaOffsetY,
    "",
    "#8fb8e8",
    `${layout.metaFontSize}px`,
  );
  const secondary = detailText(
    scene,
    left,
    top + layout.secondaryOffsetY,
    "",
    "#a8cfff",
    `${layout.metaFontSize}px`,
  );
  const divider = scene.add
    .rectangle(
      layout.x,
      top + layout.dividerOffsetY,
      layout.width - layout.horizontalPadding * 2,
      1,
      0x4488ff,
      0.45,
    )
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const breakdownLabel = detailText(
    scene,
    left,
    top + layout.breakdownOffsetY,
    "",
    "#ffcc44",
    `${layout.breakdownFontSize}px`,
  );
  const breakdownLines = Array.from({ length: 6 }, (_, index) =>
    detailText(
      scene,
      left,
      top + layout.lineStartOffsetY + index * layout.lineGap,
      "",
      "#d7e6f7",
      `${layout.lineFontSize}px`,
    ),
  );
  const impact = detailText(
    scene,
    left,
    top + layout.lineStartOffsetY + layout.lineGap * 6 + layout.impactGap,
    "",
    "#8ff0a4",
    `${layout.impactFontSize}px`,
  );
  const strength = detailText(
    scene,
    left,
    impact.y + layout.secondaryGap,
    "",
    "#b9c8dc",
    `${layout.secondaryFontSize}px`,
  );
  const agility = detailText(
    scene,
    left,
    strength.y + layout.secondaryGap,
    "",
    "#b9c8dc",
    `${layout.secondaryFontSize}px`,
  );
  group.push(
    heading,
    interaction,
    name,
    meta,
    secondary,
    divider,
    breakdownLabel,
    ...breakdownLines,
    impact,
    strength,
    agility,
  );

  function render(slot) {
    const selected = slots[slot] || slots[defaultSlot];
    if (!selected) return;
    state.activeSlot = selected.kind;
    const breakdown = buildEquipmentBreakdown(
      selected.item,
      selected.kind,
      selected.total,
    );
    name.setText(selected.name);
    meta.setText(itemMeta(selected.item));
    secondary.setText(equipmentSecondaryStats(selected.kind, equip));
    breakdownLabel.setText(`${breakdown.statLabel} BREAKDOWN`);

    const lines = [
      `Base item  ${breakdown.base}`,
      ...breakdown.additions.map(
        (entry) => `${entry.source}  ${formatSigned(entry.value)}`,
      ),
      `TOTAL ${breakdown.statLabel}  ${breakdown.total}`,
    ];
    breakdownLines.forEach((line, index) => {
      line.setText(lines[index] || "");
      line.setColor(index === lines.length - 1 ? "#8ff0a4" : "#d7e6f7");
    });

    const impactY =
      top +
      layout.lineStartOffsetY +
      Math.min(lines.length, 6) * layout.lineGap +
      layout.impactGap;
    impact.y = impactY;
    strength.y = impactY + layout.secondaryGap;
    agility.y = impactY + layout.secondaryGap * 2;

    const str = Number(member?.str) || 0;
    const agi = Number(member?.agi) || 0;
    impact.setText(
      selected.kind === "weapon"
        ? `ATK ${str + breakdown.total} = STR ${str} + WEAPON ${breakdown.total}`
        : `DAMAGE ABSORB ${breakdown.total} = ARMOR ${breakdown.total}`,
    );
    strength.setText(`STR ${str} = HERO ${str} + GEAR 0`);
    agility.setText(`AGI ${agi} = HERO ${agi} + GEAR 0`);
    interaction.setText(
      state.pinnedSlot ? "PINNED • TAP TO RELEASE" : "HOVER • TAP DETAILS",
    );
  }

  const controller = {
    state,
    hover(slot) {
      if (!state.pinnedSlot) render(slot);
    },
    leave() {
      if (!state.pinnedSlot) render(defaultSlot);
    },
    togglePin(slot) {
      state.pinnedSlot = state.pinnedSlot === slot ? null : slot;
      render(state.pinnedSlot || slot);
    },
    show(slot) {
      render(slot);
    },
  };
  render(defaultSlot);
  return controller;
}

function itemMeta(item) {
  if (!item?.instance_id) return "CATALOG EQUIPMENT";
  const rarity = String(item.rarity || "ROLLED").toUpperCase();
  const itemLevel = Number(item.item_level) || 1;
  const required = Number(item.required_level) || 1;
  return `${rarity} • ITEM LV.${itemLevel} • REQ LV.${required}`;
}

function equipmentSecondaryStats(kind, equip) {
  if (kind === "armor") {
    return `M.DEF ${Number(equip?.armor_magic_defense) || 0} • EVADE ${formatPercent(Number(equip?.armor_evade_penalty) || 0)}`;
  }
  return `HIT ${formatPercent(Number(equip?.weapon_hit_pct) || 0)} • CRIT ${formatPercent(Number(equip?.weapon_crit_pct) || 0)}`;
}

function detailText(scene, x, y, value, color, fontSize) {
  return scene.add
    .text(x, y, value, { color, fontSize, fontFamily: "monospace" })
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(DEPTH_LABEL);
}

function formatSigned(value) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value}%`;
}

function titleCase(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}

function drawSpells(scene, group, member, partyIndex, layout) {
  group.push(
    plainText(
      scene,
      layout.x,
      layout.y,
      "SPELLS",
      "#8888ff",
      `${layout.titleFontSize}px`,
    ),
  );
  if (!member.spells || member.spells.length === 0) {
    group.push(
      plainText(
        scene,
        layout.x + layout.labelInset,
        layout.y,
        "(no spells)",
        "#666666",
        `${layout.emptyFontSize}px`,
      ),
    );
    return;
  }
  const fieldSpells = buildFieldSpellList(member, scene.gameState?.party);
  const fieldByID = new Map(fieldSpells.map((spell) => [spell.id, spell]));

  member.spells.slice(0, 8).forEach((spell, idx) => {
    const col = Math.floor(idx / 4);
    const row = idx % 4;
    const tx = layout.x + layout.labelInset + col * layout.columnGap;
    const ty = layout.y + 4 + row * layout.rowGap;
    const fieldSpell = fieldByID.get(spell.id);
    const interactive = fieldSpell && !fieldSpell.greyed;
    const color = interactive ? "#aaccff" : fieldSpell ? "#666666" : "#555555";
    let label =
      spell.mp_cost != null ? `${spell.name} (${spell.mp_cost})` : spell.name;
    if (fieldSpell?.greyed && fieldSpell.disabledReason) {
      label += ` - ${fieldSpell.disabledReason}`;
    }

    const text = plainText(
      scene,
      tx,
      ty,
      label,
      color,
      `${layout.spellFontSize}px`,
    );
    if (interactive) {
      text.setInteractive({ useHandCursor: true });
      text.on("pointerover", () => text.setColor("#ffffff"));
      text.on("pointerout", () => text.setColor("#aaccff"));
      text.on("pointerdown", () => {
        closeCharacterDetail(scene);
        showFieldMagicMenu(scene, {
          casterSlot: partyIndex,
          spellId: spell.id,
          onClose: () => openCharacterDetail(scene, partyIndex),
        });
      });
    }
    group.push(text);
  });

  if (fieldSpells.some((spell) => !spell.hasValidTarget)) {
    group.push(
      plainText(
        scene,
        layout.x + layout.labelInset,
        layout.y + layout.hintOffsetY,
        "Select a spell, then choose a valid target.",
        "#888888",
        `${layout.hintFontSize}px`,
      ),
    );
  }
}

function plainText(scene, x, y, str, color, size) {
  return scene.add
    .text(x, y, str, { fontSize: size, color, fontFamily: "monospace" })
    .setScrollFactor(0)
    .setDepth(DEPTH_LABEL);
}
