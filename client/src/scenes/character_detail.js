import { drawPanel, drawButton, drawLabeledStatBar } from "../ui/panel.js";
import { hpBarColorPct } from "../systems/hpBar.js";
import { showEquipPicker } from "./world_menu.js";
import { showGemWorkshop } from "./gem_workshop.js";
import { buildFieldSpellList, showFieldMagicMenu } from "./field_magic.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";

// Depth layering. The party menu panel sits at 40-41; character detail
// sits above it at 60+ so it can be opened over the menu or standalone
// without z-fighting.
const DEPTH_BG = 60;
const DEPTH_CONTENT = 61;
const DEPTH_LABEL = 62;

const PANEL_CX = 400;
const PANEL_CY = 300;
const PANEL_W = 760;
const PANEL_H = 540;
const PANEL_LEFT = PANEL_CX - PANEL_W / 2;
const PANEL_RIGHT = PANEL_CX + PANEL_W / 2;
const PANEL_TOP = PANEL_CY - PANEL_H / 2;
const PANEL_BOTTOM = PANEL_CY + PANEL_H / 2;
const NAV_BTN_W = 34;
const NAV_BTN_H = 34;
const NAV_BTN_Y = PANEL_TOP + 42;
const NAV_LEFT_X = PANEL_LEFT + 28;
const NAV_RIGHT_X = PANEL_RIGHT - 28;

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

  pauseWorldFor(scene, "character_detail");
  scene.characterDetailGroup = [];
  scene.characterDetailIndex = partyIndex;
  const group = scene.characterDetailGroup;

  const panel = drawPanel(scene, PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, {
    depth: DEPTH_BG,
  });
  group.push(panel.bg);

  const positionLabel = formatCharacterDetailPosition(gs.party, partyIndex);
  const prevBtn = drawButton(
    scene,
    NAV_LEFT_X,
    NAV_BTN_Y,
    NAV_BTN_W,
    NAV_BTN_H,
    "<",
    () => cycleCharacterDetail(scene, -1),
  );
  const nextBtn = drawButton(
    scene,
    NAV_RIGHT_X,
    NAV_BTN_Y,
    NAV_BTN_W,
    NAV_BTN_H,
    ">",
    () => cycleCharacterDetail(scene, 1),
  );
  group.push(prevBtn, nextBtn);

  // Header: name + class · level, centered, with party position shown near
  // the title strip so the player can see which member they're on.
  group.push(
    scene.add
      .text(PANEL_CX, PANEL_TOP + 32, member.name, {
        fontSize: "22px",
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );
  group.push(
    scene.add
      .text(PANEL_RIGHT - 84, PANEL_TOP + 32, positionLabel, {
        fontSize: "14px",
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
        PANEL_CX,
        PANEL_TOP + 58,
        `${member.class_name} · Lv.${member.level}`,
        { fontSize: "13px", color: "#ffcc44", fontFamily: "monospace" },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );

  // Divider under the title strip, matching world_menu.js.
  group.push(
    scene.add
      .rectangle(PANEL_CX, PANEL_TOP + 82, PANEL_W - 40, 1, 0x4488ff, 0.6)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT),
  );

  // Three-column body.
  drawPortrait(scene, group, member, PANEL_LEFT + 120, PANEL_TOP + 230);
  drawStatBlock(scene, group, member, equip, PANEL_LEFT + 230, PANEL_TOP + 110);
  drawEquipSlot(
    scene,
    group,
    PANEL_RIGHT - 140,
    PANEL_TOP + 135,
    "WEAPON",
    equip.weapon_name,
    () => handOffToEquipPicker(scene, partyIndex, "weapon"),
    {
      item: equip.weapon_item,
      onSocket: () =>
        handOffToGemWorkshop(scene, partyIndex, equip.weapon_item?.instance_id),
    },
  );
  drawEquipSlot(
    scene,
    group,
    PANEL_RIGHT - 140,
    PANEL_TOP + 245,
    "ARMOR",
    equip.armor_name,
    () => handOffToEquipPicker(scene, partyIndex, "armor"),
    {
      item: equip.armor_item,
      onSocket: () =>
        handOffToGemWorkshop(scene, partyIndex, equip.armor_item?.instance_id),
    },
  );

  // Bottom strip: spell list.
  drawSpells(
    scene,
    group,
    member,
    partyIndex,
    PANEL_LEFT + 20,
    PANEL_BOTTOM - 124,
  );

  // Close button, mirrors the party menu footer style.
  const closeBtn = drawButton(
    scene,
    PANEL_CX,
    PANEL_BOTTOM - 40,
    200,
    34,
    "CLOSE (ESC)",
    () => closeCharacterDetail(scene),
  );
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
  scene.characterDetailGroup.forEach((c) => c.destroy());
  scene.characterDetailGroup = null;
  scene.characterDetailIndex = null;
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

function drawPortrait(scene, group, member, cx, cy) {
  // Framed portrait slot. Uses the class sprite (promoted -> base fallback)
  // scaled to fit a 150x150 box. Falls back to a '?' glyph if the texture
  // hasn't loaded for some reason.
  group.push(
    scene.add
      .rectangle(cx, cy, 180, 200, 0x1a2a4a, 0.9)
      .setStrokeStyle(2, 0x4488ff)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT),
  );

  const portraitKey = resolvePortraitTextureKey(scene, member);
  if (portraitKey && scene.textures.exists(portraitKey)) {
    const img = scene.add
      .image(cx, cy, portraitKey)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 1);
    const srcSize = Math.max(img.width || 64, img.height || 64);
    img.setScale(160 / srcSize);
    group.push(img);
  } else {
    group.push(
      scene.add
        .text(cx, cy, (member.class_name || "?")[0] || "?", {
          fontSize: "64px",
          color: "#88ccff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 1),
    );
  }
}

function drawStatBlock(scene, group, member, equip, x, y) {
  // HP / MP / XP bars — re-using the integer-safe helpers from hpBar.js.
  const hpFill = hpColorFor(member.hp, member.max_hp);
  const hpBar = drawLabeledStatBar(
    scene,
    x,
    y,
    240,
    member.hp,
    member.max_hp,
    "HP",
    {
      depth: DEPTH_CONTENT,
      fill: hpFill,
      labelColor: colorHex(hpFill),
    },
  );
  const mpBar = drawLabeledStatBar(
    scene,
    x,
    y + 26,
    240,
    member.mp || 0,
    member.max_mp || 0,
    "MP",
    {
      depth: DEPTH_CONTENT,
      fill: 0x88aaff,
      labelColor: "#88aaff",
      valueText: (member.max_mp || 0) > 0 ? null : "\u2014",
    },
  );
  const xpBar = drawLabeledStatBar(
    scene,
    x,
    y + 52,
    240,
    member.xp,
    member.xp_next,
    "XP",
    {
      depth: DEPTH_CONTENT,
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
    group.push(plainText(scene, x, y + 88 + i * 20, line, "#ffffff", "12px"));
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
  { item, onSocket } = {},
) {
  const card = scene.add
    .rectangle(cx, cy, 220, 90, 0x1a2a4a, 0.95)
    .setStrokeStyle(2, 0x4488ff)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT)
    .setInteractive({ useHandCursor: true });
  card.on("pointerover", () => card.setStrokeStyle(2, 0xffcc44));
  card.on("pointerout", () => card.setStrokeStyle(2, 0x4488ff));
  card.on("pointerup", onClick);
  group.push(card);

  group.push(
    scene.add
      .text(cx, cy - 30, slotLabel, {
        fontSize: "11px",
        color: "#ffcc44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );
  group.push(
    scene.add
      .text(cx, cy, itemName || "(empty)", {
        fontSize: "13px",
        color: itemName ? "#ffffff" : "#888888",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );
  group.push(
    scene.add
      .text(cx - 48, cy + 29, "CHANGE", {
        fontSize: "9px",
        color: "#88ccff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_LABEL),
  );

  const hasOpenSocket = item?.sockets?.some((socket) => !socket.gem_id);
  if (item?.instance_id && hasOpenSocket) {
    const socketButton = drawButton(
      scene,
      cx + 55,
      cy + 29,
      92,
      22,
      "SOCKET",
      onSocket,
      {
        depth: DEPTH_LABEL,
        fontSize: "9px",
        fill: 0x1f5d48,
        fillHover: 0x2b7d62,
        stroke: 0xa5f0c8,
        strokeWidth: 1,
      },
    );
    group.push(socketButton);
  } else {
    const appliedGems = (item?.sockets || [])
      .filter((socket) => socket.gem_id)
      .map((socket) => socket.gem_name || "GEM");
    const socketStatus =
      appliedGems.length > 0
        ? `◆ ${appliedGems.join(" + ").toUpperCase()}`
        : item?.instance_id
          ? "SOCKETS FULL"
          : "NO SOCKETS";
    group.push(
      scene.add
        .text(cx + 55, cy + 29, socketStatus, {
          fontSize: "8px",
          color: appliedGems.length > 0 ? "#8ff0a4" : "#6f819c",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH_LABEL),
    );
  }
}

function drawSpells(scene, group, member, partyIndex, x, y) {
  group.push(plainText(scene, x, y, "SPELLS", "#8888ff", "12px"));
  if (!member.spells || member.spells.length === 0) {
    group.push(plainText(scene, x + 80, y, "(no spells)", "#666666", "11px"));
    return;
  }
  const fieldSpells = buildFieldSpellList(member, scene.gameState?.party);
  const fieldByID = new Map(fieldSpells.map((spell) => [spell.id, spell]));

  member.spells.slice(0, 8).forEach((spell, idx) => {
    const col = Math.floor(idx / 4);
    const row = idx % 4;
    const tx = x + 82 + col * 230;
    const ty = y + 4 + row * 18;
    const fieldSpell = fieldByID.get(spell.id);
    const interactive = fieldSpell && !fieldSpell.greyed;
    const color = interactive ? "#aaccff" : fieldSpell ? "#666666" : "#555555";
    let label =
      spell.mp_cost != null ? `${spell.name} (${spell.mp_cost})` : spell.name;
    if (fieldSpell?.greyed && fieldSpell.disabledReason) {
      label += ` - ${fieldSpell.disabledReason}`;
    }

    const text = plainText(scene, tx, ty, label, color, "11px");
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
        x + 82,
        y + 80,
        "Select a spell, then choose a valid target.",
        "#888888",
        "10px",
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
