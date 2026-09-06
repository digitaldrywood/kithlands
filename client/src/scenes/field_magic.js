import { roundedRectangle } from "../ui/theme.js";
import { gameAction } from "../api.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { drawButton, drawPanel } from "../ui/panel.js";
import {
  applyMenuOverlayGameSize,
  menuOverlayLayout,
  restoreMenuOverlayGameSize,
} from "./menu_overlay_layout.js";

const DEPTH_BG = 70;
const DEPTH_CONTENT = 71;
const DEPTH_TEXT = 72;

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
  const layout = menuOverlayLayout({
    viewportWidth: globalThis.window?.innerWidth ?? 800,
    viewportHeight: globalThis.window?.innerHeight ?? 600,
    desktopRowHeight: 28,
    desktopMaxVisible: 7,
  });
  if (layout.mode === "desktop") {
    layout.panel.width = 640;
    layout.panel.height = 460;
    layout.title.fontSize = 20;
    layout.count.fontSize = 13;
    layout.list.labelFontSize = 16;
    layout.list.metaFontSize = 13;
    layout.detail.descriptionFontSize = 12;
    layout.footer.hintFontSize = 11;
  }
  const state = {
    scene,
    opts,
    layout,
    previousGameSize: applyMenuOverlayGameSize(scene, layout),
    overlay: [],
    rowObjects: [],
    keyHandler: null,
    closed: false,
    busy: false,
    feedback: "",
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

  const { panel } = layout;
  const panelLeft = panel.x - panel.width / 2;
  const panelRight = panel.x + panel.width / 2;
  const panelTop = panel.y - panel.height / 2;
  const panelBottom = panel.y + panel.height / 2;

  if (layout.mode === "mobile") {
    state.overlay.push(
      roundedRectangle(
        scene,
        layout.gameWidth / 2,
        layout.gameHeight / 2,
        layout.gameWidth,
        layout.gameHeight,
        0x151e2b,
        0.96,
      )
        .setScrollFactor(0)
        .setDepth(DEPTH_BG - 1)
        .setInteractive(),
    );
  }

  const panelHandle = drawPanel(
    scene,
    panel.x,
    panel.y,
    panel.width,
    panel.height,
    { depth: DEPTH_BG },
  );
  panelHandle.bg.__kithlandsMenuOverlay = { role: "panel", kind: "magic" };
  state.overlay.push(panelHandle.bg);

  state.titleText = scene.add
    .text(
      panelLeft + layout.title.xInset,
      panelTop + layout.title.yInset,
      "FIELD MAGIC",
      {
        fontSize: `${layout.title.fontSize}px`,
        color: "#f3d878",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      },
    )
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.titleText);

  state.countText = scene.add
    .text(
      panelRight - layout.count.xInset,
      panelTop + layout.count.yInset,
      "",
      {
        fontSize: `${layout.count.fontSize}px`,
        color: "#9fc4e8",
        fontFamily: "Arial, sans-serif",
      },
    )
    .setOrigin(1, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.countText);

  state.overlay.push(
    roundedRectangle(
      scene,
      panel.x,
      panelTop + layout.headerDividerInset,
      panel.width - layout.list.xInset * 2,
      1,
      0x384859,
      0.65,
    )
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT),
  );

  state.stageText = scene.add
    .text(
      panelLeft + layout.stage.xInset,
      panelTop + layout.stage.yInset,
      "SELECT CASTER",
      {
        fontSize: `${layout.stage.fontSize}px`,
        color: "#77d4ec",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      },
    )
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.stageText);

  state.overlay.push(
    roundedRectangle(
      scene,
      panel.x,
      panelBottom - layout.detail.dividerBottomInset,
      panel.width - layout.list.xInset * 2,
      1,
      0x384859,
      0.65,
    )
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT),
  );
  state.detailNameText = scene.add
    .text(
      panelLeft + layout.detail.horizontalInset,
      panelBottom - layout.detail.nameBottomInset,
      "",
      {
        fontSize: `${layout.detail.nameFontSize}px`,
        color: "#e9eef7",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      },
    )
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.detailMetaText = scene.add
    .text(
      panelRight - layout.detail.horizontalInset,
      panelBottom - layout.detail.nameBottomInset,
      "",
      {
        fontSize: `${layout.detail.metaFontSize}px`,
        color: "#77d4ec",
        fontFamily: "Arial, sans-serif",
      },
    )
    .setOrigin(1, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.descText = scene.add
    .text(
      panelLeft + layout.detail.horizontalInset,
      panelBottom - layout.detail.descriptionBottomInset,
      "",
      {
        fontSize: `${layout.detail.descriptionFontSize}px`,
        color: "#c7d8e9",
        fontFamily: "Arial, sans-serif",
        wordWrap: {
          width: panel.width - layout.detail.horizontalInset * 2,
        },
      },
    )
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(
    state.detailNameText,
    state.detailMetaText,
    state.descText,
  );

  const backBtn = drawButton(
    scene,
    panel.x - panel.width / 4 + 6,
    panelBottom - layout.footer.buttonYBottomInset,
    panel.width / 2 - 32,
    layout.footer.buttonHeight,
    "BACK / ESC",
    () => goBack(state),
    {
      depth: DEPTH_CONTENT,
      fontSize: `${layout.footer.buttonFontSize}px`,
    },
  );
  backBtn.bg.__kithlandsMenuOverlay = { role: "back", kind: "magic" };
  state.overlay.push(backBtn);
  const doneBtn = drawButton(
    scene,
    panel.x + panel.width / 4 - 6,
    panelBottom - layout.footer.buttonYBottomInset,
    panel.width / 2 - 32,
    layout.footer.buttonHeight,
    "DONE",
    () => {
      if (!state.busy) closeFieldMagicMenu(state);
    },
    { depth: DEPTH_CONTENT, fontSize: `${layout.footer.buttonFontSize}px` },
  );
  state.overlay.push(doneBtn);

  state.hintText = scene.add
    .text(
      panelLeft + layout.detail.horizontalInset,
      panelBottom - layout.footer.hintBottomInset,
      "↑↓ move    Enter/click select",
      {
        fontSize: `${layout.footer.hintFontSize}px`,
        color: "#94a8bd",
        fontFamily: "Arial, sans-serif",
      },
    )
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
  state.hintText?.setText("↑↓ move · Enter/click select · Done to finish");

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
  state.countText.setText(
    `MP ${caster.mp}/${caster.max_mp} · ${state.spell.mp_cost ?? 0} / cast`,
  );
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
    const caster = state.scene.gameState?.party?.[state.casterSlot];
    const lowMP = (caster?.mp ?? 0) < (state.spell.mp_cost ?? 0);
    const greyed =
      state.busy || lowMP || !canTargetFieldSpell(state.spell, target);
    return {
      id: `target-${slot}`,
      target,
      label:
        `${target.name}  HP:${target.hp}/${target.max_hp}` +
        ((target.max_mp || 0) > 0 ? `  MP:${target.mp}/${target.max_mp}` : ""),
      meta: greyed
        ? lowMP
          ? "low MP"
          : fieldTargetDisabledReason(state.spell, target)
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
  const { layout } = state;
  const { panel } = layout;
  const panelLeft = panel.x - panel.width / 2;
  const panelRight = panel.x + panel.width / 2;
  const panelTop = panel.y - panel.height / 2;
  const targetCards = rows.some((row) => row.target);
  const maxVisible = targetCards ? 4 : layout.list.maxVisible;
  const rowHeight = targetCards
    ? layout.mode === "mobile"
      ? 160
      : 56
    : layout.list.rowHeight;
  const startY = panelTop + layout.list.startInset;
  const visible = Math.min(maxVisible, rows.length);
  state.rows = rows;
  if (state.cursor >= rows.length) state.cursor = Math.max(0, rows.length - 1);
  state.scrollTop = Math.min(
    Math.max(0, state.scrollTop),
    Math.max(0, rows.length - maxVisible),
  );

  for (let i = 0; i < visible; i += 1) {
    const idx = state.scrollTop + i;
    if (idx >= rows.length) break;
    const row = rows[idx];
    const y = startY + i * rowHeight + rowHeight / 2;
    const baseColor = row.greyed ? "#697888" : "#e9eef7";

    const bg = roundedRectangle(
      state.scene,
      panel.x,
      y,
      panel.width - layout.list.xInset * 2,
      rowHeight - (layout.mode === "mobile" ? 8 : 2),
      0x1c2736,
      0.8,
    )
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT)
      .setStrokeStyle(1, 0x384859, 0)
      .setInteractive({ useHandCursor: !row.greyed });
    bg.__kithlandsMenuOverlay = {
      role: "row",
      kind: "magic",
      index: idx,
    };
    const lineOffset = targetCards ? rowHeight * 0.21 : 0;
    const label = state.scene.add
      .text(
        panelLeft + layout.list.labelInset,
        y - lineOffset,
        row.target ? row.target.name : row.label,
        {
          fontSize: `${layout.list.labelFontSize}px`,
          color: baseColor,
          fontFamily: "Arial, sans-serif",
        },
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    const meta = state.scene.add
      .text(
        targetCards || layout.mode === "mobile"
          ? panelRight - 40
          : panel.x + 110,
        y - lineOffset,
        row.target
          ? `HP ${row.target.hp}/${row.target.max_hp}${row.meta ? ` · ${row.meta}` : ""}`
          : row.meta || "",
        {
          fontSize: `${layout.list.metaFontSize}px`,
          color: row.greyed ? "#555555" : "#88aacc",
          fontFamily: "Arial, sans-serif",
        },
      )
      .setOrigin(targetCards || layout.mode === "mobile" ? 1 : 0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);

    const extras = [];
    if (row.target) {
      const barWidth = panel.width - layout.list.labelInset - 40;
      const barY = y + rowHeight * 0.22;
      const barX = panelLeft + layout.list.labelInset;
      const ratio = Math.max(0, Math.min(1, row.target.hp / row.target.max_hp));
      for (const [width, color] of [
        [barWidth, 0x384859],
        [barWidth * ratio, 0x8dcab5],
      ]) {
        const bar = state.scene.add
          .rectangle(
            barX,
            barY,
            width,
            layout.mode === "mobile" ? 10 : 4,
            color,
          )
          .setOrigin(0, 0.5)
          .setScrollFactor(0)
          .setDepth(DEPTH_TEXT);
        extras.push(bar);
      }
    }
    bg.on("pointerover", () => {
      if (state.busy) return;
      state.cursor = idx;
      refreshCursor(state);
    });
    bg.on("pointerdown", () => {
      if (state.busy || row.greyed) return;
      state.cursor = idx;
      row.onSelect();
    });
    state.overlay.push(bg, label, meta, ...extras);
    state.rowObjects.push({ bg, label, meta, extras, row, idx });
  }

  if (rows.length === 0) {
    const empty = state.scene.add
      .text(panel.x, startY + rowHeight, emptyText, {
        fontSize: `${layout.detail.descriptionFontSize}px`,
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
    for (const extra of row.extras || []) extra.destroy();
    state.overlay = state.overlay.filter(
      (object) =>
        ![row.bg, row.label, row.meta, ...(row.extras || [])].includes(object),
    );
  }
  state.rowObjects = [];
  state.rows = [];
}

function refreshCursor(state) {
  for (const row of state.rowObjects) {
    const active = row.idx === state.cursor;
    if (active && !row.row.greyed) {
      row.bg.setFillStyle(0x384859, 0.95);
      row.bg.setStrokeStyle(1, 0xf1d66e, 1);
      row.label.setColor("#e9eef7");
    } else if (active) {
      row.bg.setFillStyle(0x333344, 0.8);
      row.bg.setStrokeStyle(1, 0xf1d66e, 0.55);
      row.label.setColor("#697888");
    } else {
      row.bg.setFillStyle(0x1c2736, 0.8);
      row.bg.setStrokeStyle(1, 0x384859, 0);
      row.label.setColor(row.row.greyed ? "#697888" : "#e9eef7");
    }
  }
  const detail = state.rows?.[state.cursor]?.detail;
  state.detailNameText?.setText(detail?.name || "Nothing selected");
  state.detailMetaText?.setText(detail?.meta || "");
  state.descText?.setText(
    state.feedback ||
      detail?.description ||
      "Choose an option to see what it does.",
  );
}

function onKey(state, ev) {
  if (state.closed || state.busy) return;
  if (ev.repeat && ["Enter", " "].includes(ev.key)) return;
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
  const maxVisible = state.layout.list.maxVisible;
  state.cursor = (state.cursor + delta + state.rows.length) % state.rows.length;
  const previousScroll = state.scrollTop;
  if (state.cursor < state.scrollTop) state.scrollTop = state.cursor;
  if (state.cursor >= state.scrollTop + maxVisible)
    state.scrollTop = state.cursor - maxVisible + 1;
  if (state.cursor === 0) state.scrollTop = 0;
  if (state.cursor === state.rows.length - 1)
    state.scrollTop = Math.max(0, state.rows.length - maxVisible);
  if (previousScroll !== state.scrollTop) rebuildRows(state);
  else refreshCursor(state);
}

function goBack(state) {
  if (state.busy) return;
  state.feedback = "";
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
  if (!spell || state.closed || state.busy) return;
  const caster = state.scene.gameState?.party?.[state.casterSlot];
  if (!caster || (caster.mp ?? 0) < (spell.mp_cost ?? 0)) return;
  if (
    targetSlot >= 0 &&
    !canTargetFieldSpell(spell, state.scene.gameState?.party?.[targetSlot])
  )
    return;
  state.busy = true;
  state.hintText.setText(`Casting ${spell.name}…`);
  try {
    const result = await castFieldSpell(
      state.scene,
      state.casterSlot,
      spell,
      targetSlot,
    );
    state.feedback = result?.error || result?.message || `${spell.name} cast.`;
  } catch {
    state.feedback = "Could not confirm the cast. Try again.";
  } finally {
    state.busy = false;
    if (!state.closed) {
      // A group spell returns to its list so rebuilding never auto-casts again.
      if (!spellNeedsFieldTarget(spell)) state.spell = null;
      rebuildRows(state);
      const latest = state.scene.gameState?.party?.[state.casterSlot];
      state.hintText.setText(
        (latest?.mp ?? 0) < (spell.mp_cost ?? 0)
          ? "Not enough MP · Back to change spell · Done to finish"
          : !hasValidFieldTarget(spell, state.scene.gameState?.party)
            ? "No targets need this spell · Done to finish"
            : state.spell
              ? "Choose another target to cast again · Done to finish"
              : "Choose a spell to cast again · Done to finish",
      );
    }
  }
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
  restoreMenuOverlayGameSize(state.scene, state.previousGameSize);
  state.previousGameSize = null;
  resumeWorldFor(state.scene, "field_magic");
  state.opts.onClose?.();
}
