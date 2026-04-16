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
const MAX_VISIBLE = 9;

export function isFieldCastableSpell(spell) {
  if (!spell) return false;
  if (spell.effect === "heal" || spell.effect === "cure_status") return true;
  return spell.effect === "utility" && spell.id === "resurrect";
}

export function spellNeedsFieldTarget(spell) {
  return spell?.target === "single_ally";
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

export function buildFieldSpellList(caster, party) {
  if (!caster || !Array.isArray(caster.spells)) return [];
  const currentMP = caster.mp ?? 0;
  return caster.spells
    .filter((spell) => isFieldCastableSpell(spell))
    .map((spell) => ({
      ...spell,
      greyed:
        currentMP < (spell.mp_cost ?? 0) || !hasValidFieldTarget(spell, party),
    }));
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
    titleText: null,
    descText: null,
    casterSlot: Number.isInteger(opts.casterSlot) ? opts.casterSlot : null,
    spell: null,
  };

  const panel = drawPanel(scene, PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, {
    depth: DEPTH_BG,
  });
  state.overlay.push(panel.bg);

  state.titleText = scene.add
    .text(PANEL_CX, PANEL_TOP + 24, "MAGIC", {
      fontSize: "18px",
      color: "#ffff44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.titleText);

  state.descText = scene.add
    .text(PANEL_LEFT + 24, PANEL_TOP + 56, "", {
      fontSize: "11px",
      color: "#aaccff",
      fontFamily: "monospace",
      wordWrap: { width: PANEL_W - 48 },
    })
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.descText);

  state.overlay.push(
    scene.add
      .rectangle(PANEL_CX, PANEL_TOP + 92, PANEL_W - 40, 1, 0x4488ff, 0.6)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT),
  );

  const backBtn = drawButton(
    scene,
    PANEL_CX,
    PANEL_BOTTOM - 34,
    220,
    34,
    "BACK / ESC",
    () => goBack(state),
    { depth: DEPTH_CONTENT },
  );
  state.overlay.push(backBtn);

  const hint = scene.add
    .text(PANEL_CX, PANEL_BOTTOM - 62, "↑↓ move    Enter/click select", {
      fontSize: "10px",
      color: "#888888",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(hint);

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
    state.titleText.setText("MAGIC");
    state.descText.setText("Choose a caster.");
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
    state.descText.setText("Choose a spell.");
    renderSpellRows(state, caster);
    return;
  }

  if (!spellNeedsFieldTarget(state.spell)) {
    void executeCast(state, -1);
    return;
  }

  state.titleText.setText(`${caster.name} -> ${state.spell.name}`);
  state.descText.setText("Choose a target.");
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
    onSelect: () => {
      state.casterSlot = caster.slot;
      state.spell = null;
      state.cursor = 0;
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
    meta:
      spell.target === "all_allies"
        ? "all allies"
        : spell.effect === "utility"
          ? "revive"
          : "single ally",
    greyed: !!spell.greyed,
    onSelect: () => {
      if (spell.greyed) return;
      state.spell = spell;
      state.cursor = 0;
      rebuildRows(state);
    },
  }));
  renderRows(state, rows, "(no field spells)");
}

function renderTargetRows(state) {
  const targets = collectFieldSpellTargets(
    state.spell,
    state.scene.gameState?.party,
  );
  const rows = targets.map((target) => ({
    id: `target-${target.slot}`,
    label:
      `${target.name}  HP:${target.hp}/${target.max_hp}` +
      ((target.max_mp || 0) > 0 ? `  MP:${target.mp}/${target.max_mp}` : ""),
    meta: target.status ? `status: ${target.status}` : "",
    onSelect: () => {
      void executeCast(state, target.slot);
    },
  }));
  renderRows(state, rows, "(no valid targets)");
}

function renderRows(state, rows, emptyText) {
  const startY = PANEL_TOP + 120;
  const visible = Math.min(MAX_VISIBLE, rows.length);
  state.rows = rows;
  if (state.cursor >= rows.length) state.cursor = Math.max(0, rows.length - 1);

  for (let i = 0; i < visible; i += 1) {
    const row = rows[i];
    const y = startY + i * ROW_H + ROW_H / 2;
    const baseColor = row.greyed ? "#666666" : "#ffffff";

    const bg = state.scene.add
      .rectangle(PANEL_CX, y, PANEL_W - 56, ROW_H - 2, 0x1a2a4a, 0.8)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT)
      .setInteractive({ useHandCursor: !row.greyed });
    const label = state.scene.add
      .text(PANEL_LEFT + 28, y, row.label, {
        fontSize: "12px",
        color: baseColor,
        fontFamily: "monospace",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    const meta = state.scene.add
      .text(PANEL_CX + 110, y, row.meta || "", {
        fontSize: "10px",
        color: row.greyed ? "#555555" : "#88aacc",
        fontFamily: "monospace",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);

    bg.on("pointerover", () => {
      state.cursor = i;
      refreshCursor(state);
    });
    bg.on("pointerdown", () => {
      if (row.greyed) return;
      state.cursor = i;
      row.onSelect();
    });
    if (!row.greyed) {
      label.setInteractive({ useHandCursor: true });
      label.on("pointerover", () => {
        state.cursor = i;
        refreshCursor(state);
      });
      label.on("pointerup", () => {
        state.cursor = i;
        row.onSelect();
      });
    }

    state.overlay.push(bg, label, meta);
    state.rowObjects.push({ bg, label, meta, row, idx: i });
  }

  if (rows.length === 0) {
    const empty = state.scene.add
      .text(PANEL_CX, startY + 40, emptyText, {
        fontSize: "11px",
        color: "#888888",
        fontFamily: "monospace",
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
      row.bg.setFillStyle(0x2a4a7a, 0.95);
      row.label.setColor("#ffffff");
    } else if (active) {
      row.bg.setFillStyle(0x333344, 0.8);
      row.label.setColor("#666666");
    } else {
      row.bg.setFillStyle(0x1a2a4a, 0.8);
      row.label.setColor(row.row.greyed ? "#666666" : "#ffffff");
    }
  }
}

function onKey(state, ev) {
  if (state.closed) return;
  switch (ev.key) {
    case "ArrowDown":
    case "ArrowRight":
      if (!state.rows?.length) return;
      state.cursor = (state.cursor + 1) % state.rows.length;
      refreshCursor(state);
      break;
    case "ArrowUp":
    case "ArrowLeft":
      if (!state.rows?.length) return;
      state.cursor = (state.cursor - 1 + state.rows.length) % state.rows.length;
      refreshCursor(state);
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

function goBack(state) {
  if (state.spell) {
    state.spell = null;
    state.cursor = 0;
    rebuildRows(state);
    return;
  }
  if (state.casterSlot != null && state.opts.casterSlot == null) {
    state.casterSlot = null;
    state.cursor = 0;
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
  resumeWorldFor(state.scene, "field_magic");
  state.opts.onClose?.();
}
