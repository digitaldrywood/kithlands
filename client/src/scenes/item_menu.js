// Item menu shared by the world and battle flows. Same module powers the
// screen and the in-combat item picker; a `mode` parameter decides whether
// tent/rest-only items are filtered out and whether confirming commits via a
// direct gameAction() POST or a callback into battle.js.
//
// The exports split into two groups:
//
//   - Pure helpers (buildItemList, canUseOnTarget) — reused by vitest.
//   - Phaser overlay (showItemMenu) — renders the scrollable list, persistent
//     use context, and explicit target picker.

import { drawPanel } from "../ui/panel.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { gameAction } from "../api.js";

// ---------- pure helpers ----------

// buildItemList returns the consumable rows to render in the Item menu.
// Every row carries the metadata the overlay needs to show a description,
// decide grey-out state, and route a target picker. gs.items[] is the single
// source of truth — potions/ethers/phoenix_down/antidote/etc. all arrive in
// that slice thanks to fillInventoryState in server/api/game.go.
export function buildItemList(gs, mode) {
  if (!gs || !Array.isArray(gs.items)) return [];
  const party = Array.isArray(gs.party) ? gs.party : [];
  const out = [];
  for (const raw of gs.items) {
    if (!raw || raw.count <= 0) continue;
    // Non-consumables (weapons/armor) have no `effect` field and belong on
    // the EQUIP tab, which this module doesn't render.
    if (!raw.effect) continue;
    if (mode === "combat" && !raw.combat_usable) continue;
    if (mode === "world" && !raw.world_usable) continue;
    const greyed = !hasValidTarget(raw, party);
    out.push({
      id: raw.id,
      name: raw.name || raw.id,
      count: raw.count,
      description: raw.description || "",
      effect: raw.effect,
      combat_usable: !!raw.combat_usable,
      world_usable: !!raw.world_usable,
      greyed,
    });
  }
  return out;
}

// canUseOnTarget decides whether a given party member is a valid target for
// an item's effect. Used by the target picker to disable rows and by
// buildItemList (via hasValidTarget) to compute the overall grey-out.
export function canUseOnTarget(item, target) {
  if (!item || !target) return false;
  switch (item.effect) {
    case "heal":
      return target.hp > 0 && target.hp < target.max_hp;
    case "restore_mp":
      return (
        target.hp > 0 &&
        (target.max_mp || 0) > 0 &&
        (target.mp || 0) < target.max_mp
      );
    case "revive":
      return target.hp <= 0;
    case "cure_poison":
      return target.hp > 0 && target.status === "poison";
    case "cure_silence":
      return target.hp > 0 && target.status === "silence";
    case "cure_stone":
      return target.status === "stone";
    case "rest":
      // Tent is a party-level effect, never routed through a target picker.
      return false;
    default:
      return false;
  }
}

// itemUseContext keeps the selected item's use contract visible while the
// player browses. The wording intentionally describes mechanics already
// authored by the server instead of introducing new item behavior here.
export function itemUseContext(item, mode = "world") {
  const availability = mode === "combat" ? "Battle" : "Field";
  const targets = {
    heal: "One injured ally",
    restore_mp: "One ally missing MP",
    revive: "One fallen ally",
    cure_poison: "One poisoned ally",
    cure_silence: "One silenced ally",
    cure_stone: "One petrified ally",
    rest: "Whole party",
  };
  return `${availability} · ${targets[item?.effect] || "No valid target"}`;
}

function hasValidTarget(item, party) {
  if (item.effect === "rest") {
    // Tent should be usable if any living member is not at full HP/MP.
    for (const p of party) {
      if (p.hp > 0 && p.hp < p.max_hp) return true;
      if (p.hp > 0 && (p.max_mp || 0) > 0 && (p.mp || 0) < p.max_mp)
        return true;
    }
    return false;
  }
  for (const p of party) {
    if (canUseOnTarget(item, p)) return true;
  }
  return false;
}

// ---------- Phaser overlay ----------

// Layout constants. Mirrors the world_menu.js panel geometry so the two
// screens feel visually consistent.
const PANEL_CX = 400;
const PANEL_CY = 300;
const PANEL_W = 560;
const PANEL_H = 420;
const PANEL_LEFT = PANEL_CX - PANEL_W / 2;
const PANEL_RIGHT = PANEL_CX + PANEL_W / 2;
const PANEL_TOP = PANEL_CY - PANEL_H / 2;
const PANEL_BOTTOM = PANEL_CY + PANEL_H / 2;
const DEPTH_BG = 50;
const DEPTH_CONTENT = 51;
const DEPTH_TEXT = 52;
const ROW_H = 25;
const MAX_VISIBLE = 9;

// showItemMenu renders the overlay. opts:
//   - mode: "world" | "combat"
//   - onConfirm(item, targetSlot): called when the player picks an item+target
//     (combat mode only). In world mode the menu POSTs directly via api.js.
//   - onClose(): called after teardown (e.g. to reopen the party menu).
export function showItemMenu(scene, opts = {}) {
  const mode = opts.mode === "combat" ? "combat" : "world";
  const state = {
    scene,
    mode,
    opts,
    overlay: [],
    items: [],
    targets: [],
    selectedItem: null,
    view: "items",
    cursor: 0,
    scrollTop: 0,
    stageText: null,
    countText: null,
    detailNameText: null,
    detailMetaText: null,
    descText: null,
    hintText: null,
    rowObjects: [], // [{row, label, qty, item}]
    keyHandler: null,
    closed: false,
  };

  if (mode === "world") {
    pauseWorldFor(scene, "item_menu");
  }

  const panel = drawPanel(scene, PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, {
    depth: DEPTH_BG,
  });
  state.overlay.push(panel.bg);

  const title = scene.add
    .text(
      PANEL_LEFT + 22,
      PANEL_TOP + 22,
      mode === "combat" ? "BATTLE ITEMS" : "FIELD ITEMS",
      {
        fontSize: "18px",
        color: "#f3d878",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      },
    )
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(title);

  state.countText = scene.add
    .text(PANEL_RIGHT - 22, PANEL_TOP + 22, "", {
      fontSize: "11px",
      color: "#9fc4e8",
      fontFamily: "Arial, sans-serif",
    })
    .setOrigin(1, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.countText);

  const headerDivider = scene.add
    .rectangle(PANEL_CX, PANEL_TOP + 45, PANEL_W - 40, 1, 0x6d93b7, 0.65)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  state.overlay.push(headerDivider);

  state.stageText = scene.add
    .text(PANEL_LEFT + 22, PANEL_TOP + 57, "CHOOSE AN ITEM", {
      fontSize: "9px",
      color: "#77d4ec",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.stageText);

  // FF1 keeps the selected item's explanation in a persistent detail band.
  const detailDivider = scene.add
    .rectangle(PANEL_CX, PANEL_BOTTOM - 116, PANEL_W - 40, 1, 0x6d93b7, 0.65)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  state.overlay.push(detailDivider);
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
    .text(PANEL_RIGHT - 22, PANEL_BOTTOM - 99, "", {
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

  // Footer hint + close button.
  state.hintText = scene.add
    .text(
      PANEL_CX,
      PANEL_BOTTOM - 22,
      "↑↓ move    Enter/click use    Esc close",
      { fontSize: "9px", color: "#8ea4b8", fontFamily: "Arial, sans-serif" },
    )
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.hintText);

  rebuildRows(state);

  // Keyboard nav. Phaser delivers arrow keys via scene.input.keyboard events.
  state.keyHandler = (ev) => onKey(state, ev);
  scene.input.keyboard.on("keydown", state.keyHandler);

  // Return a handle so callers can force-close (e.g. on scene shutdown).
  return {
    close: () => closeItemMenu(state),
  };
}

function rebuildRows(state) {
  // Tear down any existing row objects so we can redraw cleanly.
  for (const r of state.rowObjects) {
    if (r.row) r.row.destroy();
    if (r.label) r.label.destroy();
    if (r.qty) r.qty.destroy();
  }
  state.rowObjects = [];

  state.view = "items";
  state.selectedItem = null;
  state.targets = [];
  state.stageText?.setText("CHOOSE AN ITEM");
  state.hintText?.setText("↑↓ move    Enter/click use    Esc close");
  const list = buildItemList(state.scene.gameState, state.mode);
  state.items = list;
  state.countText?.setText(
    `${list.length} usable ${list.length === 1 ? "item" : "items"}`,
  );
  if (state.cursor >= list.length) state.cursor = Math.max(0, list.length - 1);
  state.scrollTop = Math.min(
    Math.max(0, state.scrollTop),
    Math.max(0, list.length - MAX_VISIBLE),
  );

  const startY = PANEL_TOP + 71;
  const visible = Math.min(MAX_VISIBLE, list.length);
  for (let i = 0; i < visible; i++) {
    const idx = state.scrollTop + i;
    if (idx >= list.length) break;
    const item = list[idx];
    const y = startY + i * ROW_H + ROW_H / 2;

    const rowBg = state.scene.add
      .rectangle(PANEL_CX, y, PANEL_W - 40, ROW_H - 2, 0x1a2f4b, 0.15)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT)
      .setStrokeStyle(1, 0x5f7f9f, 0)
      .setInteractive({ useHandCursor: !item.greyed });
    const color = item.greyed ? "#666666" : "#ffffff";
    const label = state.scene.add
      .text(PANEL_LEFT + 34, y, item.name, {
        fontSize: "12px",
        color,
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    const qty = state.scene.add
      .text(PANEL_RIGHT - 30, y, `x${item.count}`, {
        fontSize: "12px",
        color,
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    state.overlay.push(rowBg, label, qty);

    rowBg.on("pointerover", () => {
      state.cursor = idx;
      refreshCursor(state);
    });
    rowBg.on("pointerdown", () => {
      if (item.greyed) return;
      state.cursor = idx;
      confirmSelection(state);
    });

    state.rowObjects.push({ row: rowBg, label, qty, item, idx });
  }
  if (list.length === 0) {
    const empty = state.scene.add
      .text(PANEL_CX, startY + 40, "No usable items in this context.", {
        fontSize: "11px",
        color: "#8ea4b8",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    state.overlay.push(empty);
  }
  refreshCursor(state);
}

function refreshCursor(state) {
  for (const r of state.rowObjects) {
    const isCursor = r.idx === state.cursor;
    if (isCursor && !r.item.greyed) {
      r.row.setFillStyle(0x315884, 0.88);
      r.row.setStrokeStyle(1, 0xf1d66e, 1);
      r.label.setColor("#ffffff");
      r.qty?.setColor("#f3d878");
    } else if (isCursor) {
      r.row.setFillStyle(0x333344, 0.6);
      r.row.setStrokeStyle(1, 0xf1d66e, 0.55);
    } else {
      r.row.setFillStyle(0x1a2f4b, 0.15);
      r.row.setStrokeStyle(1, 0x5f7f9f, 0);
      r.label.setColor(r.item.greyed ? "#666666" : "#ffffff");
      r.qty?.setColor(r.item.greyed ? "#666666" : "#c7d8e9");
    }
  }
  const active = state.items[state.cursor];
  state.detailNameText?.setText(active?.name || "Nothing selected");
  state.detailMetaText?.setText(
    active
      ? `${active.count} carried · ${itemUseContext(active, state.mode)}`
      : "",
  );
  state.descText?.setText(
    active
      ? `${active.description}${active.greyed ? "  No valid target right now." : ""}`
      : "Select an item to review its use and target.",
  );
}

function onKey(state, ev) {
  if (state.closed) return;
  if (state.view === "targets") {
    onTargetKey(state, ev);
    return;
  }
  switch (ev.key) {
    case "ArrowDown":
    case "ArrowRight":
      if (state.items.length === 0) return;
      moveItemCursor(state, 1);
      break;
    case "ArrowUp":
    case "ArrowLeft":
      if (state.items.length === 0) return;
      moveItemCursor(state, -1);
      break;
    case "Enter":
    case " ":
      confirmSelection(state);
      break;
    case "Escape":
      closeItemMenu(state);
      break;
  }
}

function moveItemCursor(state, delta) {
  state.cursor =
    (state.cursor + delta + state.items.length) % state.items.length;
  const previousScroll = state.scrollTop;
  if (state.cursor < state.scrollTop) state.scrollTop = state.cursor;
  if (state.cursor >= state.scrollTop + MAX_VISIBLE)
    state.scrollTop = state.cursor - MAX_VISIBLE + 1;
  if (state.cursor === 0) state.scrollTop = 0;
  if (state.cursor === state.items.length - 1)
    state.scrollTop = Math.max(0, state.items.length - MAX_VISIBLE);
  if (state.scrollTop !== previousScroll) rebuildRows(state);
  else refreshCursor(state);
}

function confirmSelection(state) {
  const item = state.items[state.cursor];
  if (!item || item.greyed) return;
  if (item.effect === "rest") {
    // Party-level: no target picker. Fire immediately.
    useItem(state, item, -1);
    return;
  }
  showTargetPicker(state, item);
}

function showTargetPicker(state, item) {
  // Destroy the existing list rows; rebuild them as target rows. This keeps
  // the picker inside the same panel so we don't stack overlays.
  for (const r of state.rowObjects) {
    if (r.row) r.row.destroy();
    if (r.label) r.label.destroy();
    if (r.qty) r.qty.destroy();
  }
  state.rowObjects = [];

  const party = Array.isArray(state.scene.gameState.party)
    ? state.scene.gameState.party
    : [];
  const targets = [];
  for (let i = 0; i < party.length; i++) {
    const p = party[i];
    targets.push({ slot: i, valid: canUseOnTarget(item, p), ...p });
  }

  state.view = "targets";
  state.selectedItem = item;
  state.targets = targets;
  state.cursor = Math.max(
    0,
    targets.findIndex((target) => target.valid),
  );
  state.stageText?.setText("SELECT TARGET");
  state.countText?.setText(`${item.count} ${item.name} carried`);
  state.hintText?.setText("←→↑↓ move    Enter/click confirm    Esc items");
  state.detailNameText?.setText(item.name);
  state.detailMetaText?.setText(itemUseContext(item, state.mode));
  state.descText?.setText(item.description);

  if (!targets.some((target) => target.valid)) {
    const empty = state.scene.add
      .text(PANEL_CX, PANEL_TOP + 180, "(no valid targets)", {
        fontSize: "11px",
        color: "#ff6666",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    state.overlay.push(empty);
    state.scene.time.delayedCall(900, () => {
      if (state.closed) return;
      empty.destroy();
      rebuildRows(state);
    });
    return;
  }

  const cardW = (PANEL_W - 54) / 2;
  const startY = PANEL_TOP + 103;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const column = i % 2;
    const rowIndex = Math.floor(i / 2);
    const x = PANEL_LEFT + 21 + cardW / 2 + column * (cardW + 12);
    const y = startY + rowIndex * 72;
    const row = state.scene.add
      .rectangle(x, y, cardW, 62, 0x1a2f4b, t.valid ? 0.58 : 0.24)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT)
      .setStrokeStyle(1, 0x5f7f9f, 0.55)
      .setInteractive({ useHandCursor: t.valid });
    const label = state.scene.add
      .text(x - cardW / 2 + 12, y - 17, t.name, {
        fontSize: "12px",
        color: t.valid ? "#ffffff" : "#667788",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    const vitals = state.scene.add
      .text(
        x - cardW / 2 + 12,
        y + 8,
        `HP ${t.hp}/${t.max_hp}` +
          (t.max_mp > 0 ? `    MP ${t.mp}/${t.max_mp}` : ""),
        {
          fontSize: "10px",
          color: t.valid ? "#9fc4e8" : "#566575",
          fontFamily: "Arial, sans-serif",
        },
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    state.overlay.push(row, label, vitals);

    row.on("pointerover", () => {
      state.cursor = i;
      refreshTargetCursor(state);
    });
    row.on("pointerdown", () => {
      if (t.valid) useItem(state, item, t.slot);
    });

    state.rowObjects.push({ row, label, qty: vitals, target: t, idx: i });
  }
  refreshTargetCursor(state);
}

function refreshTargetCursor(state) {
  for (const entry of state.rowObjects) {
    const selected = entry.idx === state.cursor;
    entry.row.setFillStyle(
      selected ? 0x315884 : 0x1a2f4b,
      entry.target.valid ? (selected ? 0.88 : 0.58) : 0.24,
    );
    entry.row.setStrokeStyle(
      1,
      selected ? 0xf1d66e : 0x5f7f9f,
      selected ? 1 : 0.55,
    );
  }
}

function onTargetKey(state, ev) {
  switch (ev.key) {
    case "ArrowRight":
    case "ArrowDown":
      if (state.targets.length > 0)
        state.cursor = (state.cursor + 1) % state.targets.length;
      refreshTargetCursor(state);
      break;
    case "ArrowLeft":
    case "ArrowUp":
      if (state.targets.length > 0)
        state.cursor =
          (state.cursor - 1 + state.targets.length) % state.targets.length;
      refreshTargetCursor(state);
      break;
    case "Enter":
    case " ": {
      const target = state.targets[state.cursor];
      if (target?.valid) useItem(state, state.selectedItem, target.slot);
      break;
    }
    case "Escape":
      rebuildRows(state);
      break;
  }
}

async function useItem(state, item, targetSlot) {
  if (state.mode === "combat") {
    // Hand off to battle.js. Its onConfirm callback records the action and
    // the menu tears down immediately so the combat HUD stays visible.
    if (state.opts.onConfirm) {
      try {
        state.opts.onConfirm(item, targetSlot);
      } catch (err) {
        console.error("item_menu onConfirm:", err);
      }
    }
    closeItemMenu(state);
    return;
  }

  // World mode: POST directly. The server handles validation, inventory
  // decrement, and HP/MP/status mutation; we refresh our local gameState
  // from the response and reopen the party menu so the player sees the
  // updated HUD without toggling twice.
  try {
    const gs = state.scene.gameState;
    const req = { type: "item", item_id: item.id };
    if (targetSlot >= 0) req.target_id = targetSlot;
    const result = await gameAction(gs.id, req);
    if (result && !result.error) {
      Object.assign(state.scene.gameState, result);
      if (state.scene.updateHUD) state.scene.updateHUD();
    } else if (result && result.error) {
      if (state.scene.showMessage) {
        state.scene.showMessage(result.error);
        state.scene.time.delayedCall(1200, () => state.scene.hideMessage?.());
      }
    }
  } catch (err) {
    console.error("item_menu use:", err);
  }
  closeItemMenu(state);
}

function closeItemMenu(state) {
  if (state.closed) return;
  state.closed = true;
  if (state.keyHandler && state.scene.input && state.scene.input.keyboard) {
    state.scene.input.keyboard.off("keydown", state.keyHandler);
  }
  for (const obj of state.overlay) {
    if (obj && obj.destroy) obj.destroy();
  }
  state.overlay = [];
  state.rowObjects = [];
  if (state.mode === "world") {
    resumeWorldFor(state.scene, "item_menu");
  }
  if (state.opts.onClose) {
    try {
      state.opts.onClose();
    } catch (err) {
      console.error("item_menu onClose:", err);
    }
  }
}
