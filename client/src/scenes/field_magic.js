import { gameAction } from "../api.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { drawButton, drawPanel } from "../ui/panel.js";

const PANEL_CX = 400;
const PANEL_CY = 300;
const PANEL_W = 560;
const PANEL_H = 420;
const PANEL_LEFT = PANEL_CX - PANEL_W / 2;
const PANEL_TOP = PANEL_CY - PANEL_H / 2;
const PANEL_BOTTOM = PANEL_CY + PANEL_H / 2;
const DEPTH_BG = 70;
const DEPTH_CONTENT = 71;
const DEPTH_TEXT = 72;
const ROW_H = 28;
const MAX_VISIBLE = 7;

export function isFieldCastableSpell(spell) {
  if (!spell) return false;
  if (spell.effect === "heal" || spell.effect === "cure_status") return true;
  return spell.effect === "utility" && spell.id === "resurrect";
}

export function spellNeedsFieldTarget(spell) {
  return spell?.target === "single_ally";
}

export function fieldSpellTargetLabel(spell) {
  if (!spell) return "No target";
  if (spell.target === "all_allies") return "All allies";
  if (spell.effect === "utility" && spell.id === "resurrect")
    return "One fallen ally";
  if (spell.effect === "cure_status") {
    if (spell.cures_status === "all") return "All afflicted allies";
    if (spell.cures_status === "poison") return "One poisoned ally";
    if (spell.cures_status) return "One afflicted ally";
  }
  return spell.target === "single_ally" ? "One ally" : "Party";
}

export function fieldSpellContext(spell) {
  return `${Number(spell?.mp_cost) || 0} MP · ${fieldSpellTargetLabel(spell)}`;
}

export function canTargetFieldSpell(spell, target) {
  if (!spell || !target) return false;
  switch (spell.effect) {
    case "heal":
      return target.hp > 0 && target.hp < target.max_hp;
    case "cure_status":
      if (target.hp <= 0) return false;
      if (spell.cures_status === "all") {
        return target.status && target.status !== "death";
      }
      return target.status === spell.cures_status;
    case "utility":
      return spell.id === "resurrect" && target.hp <= 0;
    default:
      return false;
  }
}

function hasValidFieldTarget(spell, party) {
  if (!spell || !Array.isArray(party)) return false;
  if (spellNeedsFieldTarget(spell)) {
    return party.some((target) => canTargetFieldSpell(spell, target));
  }
  switch (spell.effect) {
    case "heal":
      return party.some((target) => target.hp > 0 && target.hp < target.max_hp);
    case "cure_status":
      return party.some((target) => canTargetFieldSpell(spell, target));
    default:
      return false;
  }
}

export function collectFieldSpellTargets(spell, party) {
  if (!spellNeedsFieldTarget(spell) || !Array.isArray(party)) return [];
  return party
    .map((target, slot) => ({ ...target, slot }))
    .filter((target) => canTargetFieldSpell(spell, target));
}

function fieldSpellDisabledReason(spell, currentMP) {
  if ((spell?.mp_cost ?? 0) > currentMP) return "low MP";
  return null;
}

function fieldTargetDisabledReason(spell, target) {
  if (!spell || !target) return "invalid target";
  switch (spell?.effect) {
    case "heal":
      if (target.hp <= 0) return "KO";
      return target.hp >= target.max_hp ? "full HP" : null;
    case "cure_status":
      if (target.hp <= 0) return "KO";
      if (spell.cures_status === "all") {
        return target.status && target.status !== "death" ? null : "no status";
      }
      return target.status === spell.cures_status
        ? null
        : `no ${spell.cures_status}`;
    case "utility":
      return spell.id === "resurrect" && target.hp <= 0 ? null : "not KO";
    default:
      return "invalid target";
  }
}

export function buildFieldSpellList(caster, party) {
  if (!caster || !Array.isArray(caster.spells)) return [];
  const currentMP = caster.mp ?? 0;
  return caster.spells
    .filter((spell) => isFieldCastableSpell(spell))
    .map((spell) => {
      const greyed = currentMP < (spell.mp_cost ?? 0);
      return {
        ...spell,
        greyed,
        disabledReason: greyed
          ? fieldSpellDisabledReason(spell, currentMP)
          : null,
        hasValidTarget: hasValidFieldTarget(spell, party),
      };
    });
}

export function hasCastableFieldSpell(caster, party) {
  return buildFieldSpellList(caster, party).length > 0;
}

function buildFieldCasterList(gs) {
  const party = Array.isArray(gs?.party) ? gs.party : [];
  return party
    .map((member, slot) => ({
      ...member,
      slot,
      fieldSpells: buildFieldSpellList(member, party),
    }))
    .filter((member) => member.fieldSpells.length > 0);
}

export async function castFieldSpell(
  scene,
  casterSlot,
  spell,
  targetSlot = -1,
) {
  const req = {
    type: "spell",
    slot_idx: casterSlot,
    spell_id: spell.id,
  };
  if (targetSlot >= 0) req.target_id = targetSlot;
  const result = await gameAction(scene.gameState.id, req);
  if (result && !result.error) {
    Object.assign(scene.gameState, result);
    scene.updateHUD?.();
    if (result.message && scene.showMessage) {
      scene.showMessage(result.message);
      scene.time?.delayedCall(1400, () => scene.hideMessage?.());
    }
  } else if (result?.error && scene.showMessage) {
    scene.showMessage(result.error);
    scene.time?.delayedCall(1400, () => scene.hideMessage?.());
  }
  return result;
}

export function showFieldMagicMenu(scene, opts = {}) {
  pauseWorldFor(scene, "field_magic");
  const state = {
    scene,
    opts,
    overlay: [],
    rowObjects: [],
    keyHandler: null,
    closed: false,
    cursor: 0,
    scrollTop: 0,
    titleText: null,
    countText: null,
    stageText: null,
    detailNameText: null,
    detailMetaText: null,
    descText: null,
    hintText: null,
    casterSlot: Number.isInteger(opts.casterSlot) ? opts.casterSlot : null,
    spell: null,
  };
  scene.fieldMagicMenuState = state;

  const panel = drawPanel(scene, PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, {
    depth: DEPTH_BG,
  });
  state.overlay.push(panel.bg);

  state.titleText = scene.add
    .text(PANEL_LEFT + 22, PANEL_TOP + 22, "FIELD MAGIC", {
      fontSize: "18px",
      color: "#f3d878",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.titleText);

  state.countText = scene.add
    .text(PANEL_LEFT + PANEL_W - 22, PANEL_TOP + 22, "", {
      fontSize: "11px",
      color: "#9fc4e8",
      fontFamily: "Arial, sans-serif",
    })
    .setOrigin(1, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.countText);

  state.overlay.push(
    scene.add
      .rectangle(PANEL_CX, PANEL_TOP + 45, PANEL_W - 40, 1, 0x6d93b7, 0.65)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT),
  );

  state.stageText = scene.add
    .text(PANEL_LEFT + 22, PANEL_TOP + 57, "SELECT CASTER", {
      fontSize: "9px",
      color: "#77d4ec",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.stageText);

  state.overlay.push(
    scene.add
      .rectangle(PANEL_CX, PANEL_BOTTOM - 116, PANEL_W - 40, 1, 0x6d93b7, 0.65)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT),
  );
  state.detailNameText = scene.add
    .text(PANEL_LEFT + 22, PANEL_BOTTOM - 99, "", {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.detailMetaText = scene.add
    .text(PANEL_LEFT + PANEL_W - 22, PANEL_BOTTOM - 99, "", {
      fontSize: "9px",
      color: "#77d4ec",
      fontFamily: "Arial, sans-serif",
    })
    .setOrigin(1, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.descText = scene.add
    .text(PANEL_LEFT + 22, PANEL_BOTTOM - 80, "", {
      fontSize: "11px",
      color: "#c7d8e9",
      fontFamily: "Arial, sans-serif",
      wordWrap: { width: PANEL_W - 44 },
    })
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(
    state.detailNameText,
    state.detailMetaText,
    state.descText,
  );

  const backBtn = drawButton(
    scene,
    PANEL_CX,
    PANEL_BOTTOM - 21,
    190,
    26,
    "BACK / ESC",
    () => goBack(state),
    { depth: DEPTH_CONTENT },
  );
  state.overlay.push(backBtn);

  state.hintText = scene.add
    .text(PANEL_LEFT + 22, PANEL_BOTTOM - 45, "↑↓ move    Enter/click select", {
      fontSize: "9px",
      color: "#8ea4b8",
      fontFamily: "Arial, sans-serif",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.hintText);

  state.keyHandler = (ev) => onKey(state, ev);
  scene.input?.keyboard?.on("keydown", state.keyHandler);

  if (state.casterSlot != null && opts.spellId) {
    const caster = scene.gameState?.party?.[state.casterSlot];
    state.spell = buildFieldSpellList(caster, scene.gameState?.party).find(
      (spell) => spell.id === opts.spellId,
    );
  }

  rebuildRows(state);

  return {
    close: () => closeFieldMagicMenu(state),
  };
}

function rebuildRows(state) {
  clearRows(state);

  if (state.casterSlot == null) {
    state.titleText.setText("FIELD MAGIC");
    state.stageText.setText("SELECT CASTER");
    state.countText.setText("Choose a caster");
    renderCasterRows(state);
    return;
  }

  const caster = state.scene.gameState?.party?.[state.casterSlot];
  if (!caster) {
    closeFieldMagicMenu(state);
    return;
  }

  if (!state.spell) {
    state.titleText.setText(`${caster.name} MAGIC`);
    state.stageText.setText("SELECT SPELL");
    state.countText.setText(`MP ${caster.mp}/${caster.max_mp}`);
    renderSpellRows(state, caster);
    return;
  }

  if (!spellNeedsFieldTarget(state.spell)) {
    void executeCast(state, -1);
    return;
  }

  state.titleText.setText(`${caster.name} → ${state.spell.name}`);
  state.stageText.setText("SELECT TARGET");
  state.countText.setText(fieldSpellContext(state.spell));
  renderTargetRows(state);
}

function renderCasterRows(state) {
  const casters = buildFieldCasterList(state.scene.gameState);
  const rows = casters.map((caster) => ({
    id: `caster-${caster.slot}`,
    label: `${caster.name}  MP:${caster.mp}/${caster.max_mp}`,
    meta:
      caster.fieldSpells.length === 1
        ? caster.fieldSpells[0].name
        : `${caster.fieldSpells.length} field spells`,
    detail: {
      name: caster.name,
      meta: `MP ${caster.mp}/${caster.max_mp}`,
      description: `${caster.fieldSpells.length} field ${caster.fieldSpells.length === 1 ? "spell" : "spells"} available.`,
    },
    onSelect: () => {
      state.casterSlot = caster.slot;
      state.spell = null;
      state.cursor = 0;
      state.scrollTop = 0;
      rebuildRows(state);
    },
  }));
  renderRows(state, rows, "(no field spells)");
}

function renderSpellRows(state, caster) {
  const spells = buildFieldSpellList(caster, state.scene.gameState?.party);
  const rows = spells.map((spell) => ({
    id: spell.id,
    label: `${spell.name} (${spell.mp_cost ?? 0} MP)`,
    meta: spell.greyed ? spell.disabledReason : fieldSpellTargetLabel(spell),
    detail: {
      name: spell.name,
      meta: fieldSpellContext(spell),
      description: `${spell.description || "No description available."}${spell.greyed ? `  Unavailable: ${spell.disabledReason}.` : !spell.hasValidTarget ? "  No valid target right now." : ""}`,
    },
    greyed: !!spell.greyed,
    onSelect: () => {
      if (spell.greyed) return;
      state.spell = spell;
      state.cursor = 0;
      state.scrollTop = 0;
      rebuildRows(state);
    },
  }));
  renderRows(state, rows, "(no field spells)");
}

function renderTargetRows(state) {
  const party = Array.isArray(state.scene.gameState?.party)
    ? state.scene.gameState.party
    : [];
  const rows = party.map((target, slot) => {
    const greyed = !canTargetFieldSpell(state.spell, target);
    return {
      id: `target-${slot}`,
      label:
        `${target.name}  HP:${target.hp}/${target.max_hp}` +
        ((target.max_mp || 0) > 0 ? `  MP:${target.mp}/${target.max_mp}` : ""),
      meta: greyed
        ? fieldTargetDisabledReason(state.spell, target)
        : target.status
          ? `status: ${target.status}`
          : "",
      detail: {
        name: state.spell.name,
        meta: fieldSpellContext(state.spell),
        description: `${state.spell.description || "No description available."}  ${target.name}: HP ${target.hp}/${target.max_hp}${greyed ? ` · ${fieldTargetDisabledReason(state.spell, target)}` : " · valid target"}.`,
      },
      greyed,
      onSelect: () => {
        if (greyed) return;
        void executeCast(state, slot);
      },
    };
  });
  const firstValid = rows.findIndex((row) => !row.greyed);
  if (firstValid >= 0 && rows[state.cursor]?.greyed) state.cursor = firstValid;
  renderRows(state, rows, "(no party members)");
}

function renderRows(state, rows, emptyText) {
  const startY = PANEL_TOP + 71;
  const visible = Math.min(MAX_VISIBLE, rows.length);
  state.rows = rows;
  if (state.cursor >= rows.length) state.cursor = Math.max(0, rows.length - 1);
  state.scrollTop = Math.min(
    Math.max(0, state.scrollTop),
    Math.max(0, rows.length - MAX_VISIBLE),
  );

  for (let i = 0; i < visible; i += 1) {
    const idx = state.scrollTop + i;
    if (idx >= rows.length) break;
    const row = rows[idx];
    const y = startY + i * ROW_H + ROW_H / 2;
    const baseColor = row.greyed ? "#666666" : "#ffffff";

    const bg = state.scene.add
      .rectangle(PANEL_CX, y, PANEL_W - 56, ROW_H - 2, 0x1a2a4a, 0.8)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT)
      .setStrokeStyle(1, 0x5f7f9f, 0)
      .setInteractive({ useHandCursor: !row.greyed });
    const label = state.scene.add
      .text(PANEL_LEFT + 28, y, row.label, {
        fontSize: "12px",
        color: baseColor,
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    const meta = state.scene.add
      .text(PANEL_CX + 110, y, row.meta || "", {
        fontSize: "10px",
        color: row.greyed ? "#555555" : "#88aacc",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);

    bg.on("pointerover", () => {
      state.cursor = idx;
      refreshCursor(state);
    });
    bg.on("pointerdown", () => {
      if (row.greyed) return;
      state.cursor = idx;
      row.onSelect();
    });
    state.overlay.push(bg, label, meta);
    state.rowObjects.push({ bg, label, meta, row, idx });
  }

  if (rows.length === 0) {
    const empty = state.scene.add
      .text(PANEL_CX, startY + 40, emptyText, {
        fontSize: "11px",
        color: "#888888",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    state.overlay.push(empty);
  }

  refreshCursor(state);
}

function clearRows(state) {
  for (const row of state.rowObjects) {
    row.bg.destroy();
    row.label.destroy();
    row.meta.destroy();
  }
  state.rowObjects = [];
  state.rows = [];
}

function refreshCursor(state) {
  for (const row of state.rowObjects) {
    const active = row.idx === state.cursor;
    if (active && !row.row.greyed) {
      row.bg.setFillStyle(0x315884, 0.95);
      row.bg.setStrokeStyle(1, 0xf1d66e, 1);
      row.label.setColor("#ffffff");
    } else if (active) {
      row.bg.setFillStyle(0x333344, 0.8);
      row.bg.setStrokeStyle(1, 0xf1d66e, 0.55);
      row.label.setColor("#666666");
    } else {
      row.bg.setFillStyle(0x1a2a4a, 0.8);
      row.bg.setStrokeStyle(1, 0x5f7f9f, 0);
      row.label.setColor(row.row.greyed ? "#666666" : "#ffffff");
    }
  }
  const detail = state.rows?.[state.cursor]?.detail;
  state.detailNameText?.setText(detail?.name || "Nothing selected");
  state.detailMetaText?.setText(detail?.meta || "");
  state.descText?.setText(
    detail?.description || "Choose an option to see what it does.",
  );
}

function onKey(state, ev) {
  if (state.closed) return;
  switch (ev.key) {
    case "ArrowDown":
    case "ArrowRight":
      if (!state.rows?.length) return;
      moveCursor(state, 1);
      break;
    case "ArrowUp":
    case "ArrowLeft":
      if (!state.rows?.length) return;
      moveCursor(state, -1);
      break;
    case "Enter":
    case " ":
      if (!state.rows?.length) return;
      state.rows[state.cursor]?.onSelect?.();
      break;
    case "Escape":
      goBack(state);
      break;
  }
}

function moveCursor(state, delta) {
  state.cursor = (state.cursor + delta + state.rows.length) % state.rows.length;
  const previousScroll = state.scrollTop;
  if (state.cursor < state.scrollTop) state.scrollTop = state.cursor;
  if (state.cursor >= state.scrollTop + MAX_VISIBLE)
    state.scrollTop = state.cursor - MAX_VISIBLE + 1;
  if (state.cursor === 0) state.scrollTop = 0;
  if (state.cursor === state.rows.length - 1)
    state.scrollTop = Math.max(0, state.rows.length - MAX_VISIBLE);
  if (previousScroll !== state.scrollTop) rebuildRows(state);
  else refreshCursor(state);
}

function goBack(state) {
  if (state.spell) {
    state.spell = null;
    state.cursor = 0;
    state.scrollTop = 0;
    rebuildRows(state);
    return;
  }
  if (state.casterSlot != null && state.opts.casterSlot == null) {
    state.casterSlot = null;
    state.cursor = 0;
    state.scrollTop = 0;
    rebuildRows(state);
    return;
  }
  closeFieldMagicMenu(state);
}

async function executeCast(state, targetSlot) {
  const spell = state.spell;
  if (!spell) return;
  await castFieldSpell(state.scene, state.casterSlot, spell, targetSlot);
  closeFieldMagicMenu(state);
}

function closeFieldMagicMenu(state) {
  if (state.closed) return;
  state.closed = true;
  state.scene.input?.keyboard?.off("keydown", state.keyHandler);
  for (const obj of state.overlay) {
    obj?.destroy?.();
  }
  state.overlay = [];
  state.rowObjects = [];
  state.scene.fieldMagicMenuState = null;
  resumeWorldFor(state.scene, "field_magic");
  state.opts.onClose?.();
}
