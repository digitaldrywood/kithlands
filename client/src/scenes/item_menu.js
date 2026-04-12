// FF6-style Item menu (issue #144). Same module powers the world-menu Item
// screen and the in-combat item picker; a `mode` parameter decides whether
// tent/rest-only items are filtered out and whether confirming commits via a
// direct gameAction() POST or a callback into battle.js.
//
// The exports split into two groups:
//
//   - Pure helpers (buildItemList, canUseOnTarget) — reused by vitest.
//   - Phaser overlay (showItemMenu) — renders the scrollable list, filter
//     tabs, description line, and target picker.

import { drawPanel, drawButton } from "../ui/panel.js";
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
      return target.hp > 0 && (target.max_mp || 0) > 0 && (target.mp || 0) < target.max_mp;
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

function hasValidTarget(item, party) {
  if (item.effect === "rest") {
    // Tent should be usable if any member is not at full HP/MP.
    for (const p of party) {
      if (p.hp > 0 && p.hp < p.max_hp) return true;
      if ((p.max_mp || 0) > 0 && (p.mp || 0) < p.max_mp) return true;
      if (p.hp <= 0) return true;
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
const ROW_H = 20;
const MAX_VISIBLE = 10;

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
    cursor: 0,
    scrollTop: 0,
    descText: null,
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
    .text(PANEL_CX, PANEL_TOP + 22, "ITEM", {
      fontSize: "18px",
      color: "#ffff44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(title);

  // Filter-tab row. USE is active; KEY / EQUIP are stubbed (empty lists) to
  // match FF6's three-tab layout from the issue without scope-creeping into
  // the key-item or equipment screens.
  const tabY = PANEL_TOP + 56;
  const tabs = ["USE", "KEY", "EQUIP"];
  for (let i = 0; i < tabs.length; i++) {
    const tw = 80;
    const tx = PANEL_CX + (i - 1) * (tw + 6);
    const handle = drawButton(scene, tx, tabY, tw, 24, tabs[i], {
      depth: DEPTH_CONTENT,
      onClick: () => {
        // KEY / EQUIP are intentionally empty for #144. Clicking them just
        // redraws the list with zero rows; pressing USE restores the full
        // list. This keeps the tabs visible without needing real data.
        state.activeTab = tabs[i];
        rebuildRows(state);
      },
    });
    if (handle) {
      handle.setActive(i === 0);
      state.overlay.push(handle);
    }
  }
  state.activeTab = "USE";

  // Description line updates as the cursor moves across rows.
  state.descText = scene.add
    .text(PANEL_LEFT + 20, PANEL_TOP + 90, "", {
      fontSize: "11px",
      color: "#aaccff",
      fontFamily: "monospace",
      wordWrap: { width: PANEL_W - 40 },
    })
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(state.descText);

  // Divider below the description.
  const divider = scene.add
    .rectangle(PANEL_CX, PANEL_TOP + 114, PANEL_W - 40, 1, 0x4488ff, 0.6)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  state.overlay.push(divider);

  // Footer hint + close button.
  const hint = scene.add
    .text(
      PANEL_CX,
      PANEL_BOTTOM - 30,
      "↑↓ move    Enter/click use    Esc close",
      { fontSize: "10px", color: "#888888", fontFamily: "monospace" },
    )
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_TEXT);
  state.overlay.push(hint);

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

  const list =
    state.activeTab === "USE"
      ? buildItemList(state.scene.gameState, state.mode)
      : []; // KEY / EQUIP stubs
  state.items = list;
  if (state.cursor >= list.length) state.cursor = Math.max(0, list.length - 1);

  const startY = PANEL_TOP + 130;
  const visible = Math.min(MAX_VISIBLE, list.length);
  for (let i = 0; i < visible; i++) {
    const idx = state.scrollTop + i;
    if (idx >= list.length) break;
    const item = list[idx];
    const y = startY + i * ROW_H + ROW_H / 2;

    const rowBg = state.scene.add
      .rectangle(PANEL_CX, y, PANEL_W - 40, ROW_H, 0x222244, 0.0)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT)
      .setInteractive({ useHandCursor: !item.greyed });
    const color = item.greyed ? "#666666" : "#ffffff";
    const label = state.scene.add
      .text(PANEL_LEFT + 30, y, item.name, {
        fontSize: "12px",
        color,
        fontFamily: "monospace",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    const qty = state.scene.add
      .text(PANEL_RIGHT - 30, y, `x${item.count}`, {
        fontSize: "12px",
        color,
        fontFamily: "monospace",
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
      .text(PANEL_CX, startY + 40, "(no items)", {
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

function refreshCursor(state) {
  for (const r of state.rowObjects) {
    const isCursor = r.idx === state.cursor;
    if (isCursor && !r.item.greyed) {
      r.row.setFillStyle(0x2a4a7a, 0.8);
      r.label.setColor("#ffffff");
      r.qty.setColor("#ffffff");
    } else if (isCursor) {
      r.row.setFillStyle(0x333344, 0.6);
    } else {
      r.row.setFillStyle(0x222244, 0.0);
      r.label.setColor(r.item.greyed ? "#666666" : "#ffffff");
      r.qty.setColor(r.item.greyed ? "#666666" : "#ffffff");
    }
  }
  const active = state.items[state.cursor];
  if (state.descText) {
    state.descText.setText(active ? active.description : "");
  }
}

function onKey(state, ev) {
  if (state.closed) return;
  switch (ev.key) {
    case "ArrowDown":
    case "ArrowRight":
      if (state.items.length === 0) return;
      state.cursor = (state.cursor + 1) % state.items.length;
      refreshCursor(state);
      break;
    case "ArrowUp":
    case "ArrowLeft":
      if (state.items.length === 0) return;
      state.cursor = (state.cursor - 1 + state.items.length) % state.items.length;
      refreshCursor(state);
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
    if (canUseOnTarget(item, p)) targets.push({ slot: i, ...p });
  }

  state.descText.setText(`Use ${item.name} on:`);

  if (targets.length === 0) {
    const empty = state.scene.add
      .text(PANEL_CX, PANEL_TOP + 180, "(no valid targets)", {
        fontSize: "11px",
        color: "#ff6666",
        fontFamily: "monospace",
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

  const startY = PANEL_TOP + 140;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const y = startY + i * 26 + 13;
    const row = state.scene.add
      .rectangle(PANEL_CX, y, PANEL_W - 80, 24, 0x1a2a4a, 0.8)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT)
      .setInteractive({ useHandCursor: true });
    const label = state.scene.add
      .text(
        PANEL_LEFT + 50,
        y,
        `${t.name}  HP:${t.hp}/${t.max_hp}` +
          (t.max_mp > 0 ? `  MP:${t.mp}/${t.max_mp}` : ""),
        { fontSize: "12px", color: "#ffffff", fontFamily: "monospace" },
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_TEXT);
    state.overlay.push(row, label);

    row.on("pointerover", () => row.setFillStyle(0x2a4a7a, 0.9));
    row.on("pointerout", () => row.setFillStyle(0x1a2a4a, 0.8));
    row.on("pointerdown", () => useItem(state, item, t.slot));

    state.rowObjects.push({ row, label, qty: null, item, idx: i });
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
