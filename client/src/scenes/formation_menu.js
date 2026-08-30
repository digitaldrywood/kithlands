import { updatePartyFormation } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { drawButton, drawPanel } from "../ui/panel.js";
import { buildPartyBattleLayout, inferPartyRow } from "./battle_layout.js";
import { formationMenuLayout } from "./formation_menu_layout.js";
import {
  applyMenuOverlayGameSize,
  restoreMenuOverlayGameSize,
} from "./menu_overlay_layout.js";
import { toggleMenu } from "./world_menu.js";

const DEPTH_BG = 50;
const DEPTH_CONTENT = 51;
const FF6_BLUE = 0x4d78bf;
const FF6_GOLD = 0xf4d881;
const FF6_GOLD_DARK = 0xa66b1d;
const FF6_GLOW = 0x9bc7ff;
const ROW_FILL = 0x16274a;
const ROW_FILL_HOVER = 0x21406e;
const ROW_FILL_SELECTED = 0x2d5a93;
const PICK_FILL = 0x4b3e24;
const PREVIEW_FRONT = 0x53411f;
const PREVIEW_BACK = 0x1f3358;

function normalizeRow(row) {
  return row === "front" || row === "back" ? row : "";
}

function resolveMemberRow(member) {
  return normalizeRow(member?.row) || inferPartyRow(member);
}

function rowBadgeLabel(row) {
  return row === "back" ? "BACK" : "FRONT";
}

function rowBadgeColor(row) {
  return row === "back"
    ? { fill: 0x2a446f, stroke: 0xb9c8ff }
    : { fill: 0x5d4920, stroke: FF6_GOLD };
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

function applyTextGlow(text, color, blur = 2) {
  if (typeof text?.setShadow !== "function") return;
  text.setShadow(0, 0, color, blur, false, true);
}

export function buildFormationDraft(party = []) {
  return party.map((member, originalSlot) => ({
    ...member,
    row: resolveMemberRow(member),
    originalSlot,
  }));
}

export function swapDraftSlots(draftParty, left, right) {
  if (
    left === right ||
    left < 0 ||
    right < 0 ||
    left >= draftParty.length ||
    right >= draftParty.length
  ) {
    return draftParty.slice();
  }
  const next = draftParty.slice();
  [next[left], next[right]] = [next[right], next[left]];
  return next;
}

export function buildPreviewDraft(draftParty, pickedIdx, focusedIdx) {
  if (
    pickedIdx == null ||
    focusedIdx == null ||
    pickedIdx === focusedIdx ||
    pickedIdx < 0 ||
    focusedIdx < 0
  ) {
    return draftParty.slice();
  }
  return swapDraftSlots(draftParty, pickedIdx, focusedIdx);
}

export function buildFormationPayload(draftParty) {
  return {
    reorder: draftParty.map((member) => member.originalSlot),
    updates: draftParty.map((member, slot) => ({
      slot,
      row: normalizeRow(member.row) || "front",
    })),
  };
}

export function showFormationMenu(scene) {
  pauseWorldFor(scene, "formation_menu");
  const layout = formationMenuLayout({
    viewportWidth: globalThis.window?.innerWidth ?? 800,
    viewportHeight: globalThis.window?.innerHeight ?? 600,
  });
  const previousGameSize = applyMenuOverlayGameSize(scene, layout);

  const staticObjects = [];
  const state = {
    layout,
    previousGameSize,
    dynamicObjects: [],
    rowObjects: [],
    previewEntries: [],
    draftParty: buildFormationDraft(scene?.gameState?.party || []),
    draftRows: [],
    focusedIdx: 0,
    pickedIdx: null,
    closing: false,
    hoveredIdx: null,
    focusSlot(slot) {
      if (slot < 0 || slot >= state.draftParty.length) return;
      state.focusedIdx = slot;
      renderDynamic();
    },
    setRow(slot, row) {
      if (slot < 0 || slot >= state.draftParty.length) return;
      const normalized = normalizeRow(row);
      if (!normalized) return;
      state.draftParty[slot] = { ...state.draftParty[slot], row: normalized };
      renderDynamic();
    },
    activateFocused() {
      if (state.draftParty.length === 0) return;
      if (state.pickedIdx == null) {
        state.pickedIdx = state.focusedIdx;
        renderDynamic();
        return;
      }
      if (state.pickedIdx === state.focusedIdx) {
        state.pickedIdx = null;
        renderDynamic();
        return;
      }
      state.draftParty = swapDraftSlots(
        state.draftParty,
        state.pickedIdx,
        state.focusedIdx,
      );
      state.pickedIdx = null;
      renderDynamic();
      playSFX("sfx_cursor");
    },
    cancelPick() {
      if (state.pickedIdx == null) return false;
      state.pickedIdx = null;
      renderDynamic();
      return true;
    },
    saveBtn: null,
    closeAndSave: null,
    hintText: null,
    previewPanel: null,
    listPanel: null,
  };

  if (layout.mode === "mobile") {
    staticObjects.push(
      scene.add
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
        .setInteractive(),
    );
  }

  const title = scene.add
    .text(layout.title.x, layout.title.y, "FORMATION", {
      fontSize: `${layout.title.fontSize}px`,
      fontStyle: "bold",
      color: "#fff5c2",
      fontFamily: "Georgia",
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  applyTextGlow(title, "#2c5f9d", 2);

  const hintText = scene.add
    .text(layout.hint.x, layout.hint.y, "", {
      fontSize: `${layout.hint.fontSize}px`,
      color: "#dbe9ff",
      fontFamily: "monospace",
      align: "center",
      wordWrap: { width: layout.hint.width },
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  state.hintText = hintText;

  const shell = drawPanel(
    scene,
    layout.shell.x,
    layout.shell.y,
    layout.shell.width,
    layout.shell.height,
    {
      depth: DEPTH_BG,
      interactive: false,
      variant: "ff6",
    },
  );
  shell.bg.__kithlandsFormation = { role: "shell" };
  const previewPanel = drawPanel(
    scene,
    layout.preview.panel.x,
    layout.preview.panel.y,
    layout.preview.panel.width,
    layout.preview.panel.height,
    {
      depth: DEPTH_BG + 0.5,
      interactive: false,
      variant: "ff6",
      outerFill: 0x3b66a4,
      innerTop: 0x214875,
      innerBottom: 0x112341,
      radius: 16,
    },
  );
  const listPanel = drawPanel(
    scene,
    layout.list.panel.x,
    layout.list.panel.y,
    layout.list.panel.width,
    layout.list.panel.height,
    {
      depth: DEPTH_BG + 0.5,
      interactive: false,
      variant: "ff6",
      outerFill: 0x3b66a4,
      innerTop: 0x214875,
      innerBottom: 0x112341,
      radius: 16,
    },
  );
  state.previewPanel = previewPanel.bg;
  state.listPanel = listPanel.bg;

  const previewTitle = scene.add
    .text(layout.preview.title.x, layout.preview.title.y, "BATTLE PREVIEW", {
      fontSize: `${layout.preview.title.fontSize}px`,
      fontStyle: "bold",
      color: "#fff1c2",
      fontFamily: "Georgia",
    })
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const previewHelp = scene.add
    .text(layout.preview.frontHelp.x, layout.preview.frontHelp.y, "FRONT", {
      fontSize: `${layout.preview.frontHelp.fontSize}px`,
      color: "#f4d881",
      fontFamily: "monospace",
    })
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const previewHelpRight = scene.add
    .text(layout.preview.backHelp.x, layout.preview.backHelp.y, "BACK", {
      fontSize: `${layout.preview.backHelp.fontSize}px`,
      color: "#b9c8ff",
      fontFamily: "monospace",
    })
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  const listTitle = scene.add
    .text(layout.list.title.x, layout.list.title.y, "ORDER", {
      fontSize: `${layout.list.title.fontSize}px`,
      fontStyle: "bold",
      color: "#fff1c2",
      fontFamily: "Georgia",
    })
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);

  staticObjects.push(
    shell.bg,
    previewPanel.bg,
    listPanel.bg,
    title,
    hintText,
    previewTitle,
    previewHelp,
    previewHelpRight,
    listTitle,
  );

  function destroyObjects(objects) {
    for (const entry of objects) entry?.destroy?.();
  }

  function clearDynamic() {
    destroyObjects(state.dynamicObjects);
    state.dynamicObjects = [];
    state.rowObjects = [];
    state.previewEntries = [];
  }

  function renderPreview() {
    const preview = layout.preview;
    const previewParty = buildPreviewDraft(
      state.draftParty,
      state.pickedIdx,
      state.focusedIdx,
    );
    const currentSlots = new Map(
      state.draftParty.map((member, slot) => [member.originalSlot, slot]),
    );
    const previewLayout = buildPartyBattleLayout(previewParty);
    const minX = Math.min(...previewLayout.map((entry) => entry.x));
    const maxX = Math.max(...previewLayout.map((entry) => entry.x));
    const minY = Math.min(...previewLayout.map((entry) => entry.y));
    const maxY = Math.max(...previewLayout.map((entry) => entry.y));
    const paneLeft = preview.pane.left;
    const paneTop = preview.pane.top;
    const paneWidth = preview.pane.width;
    const paneHeight = preview.pane.height;
    const cardW = preview.card.width;
    const cardH = preview.card.height;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    for (let slot = 0; slot < previewParty.length; slot += 1) {
      const member = previewParty[slot];
      const placement = previewLayout[slot];
      const x =
        paneLeft +
        8 +
        ((placement.x - minX) / spanX) * (paneWidth - cardW - 20);
      const y =
        paneTop +
        18 +
        ((placement.y - minY) / spanY) * (paneHeight - cardH - 28);
      const rowColors = rowBadgeColor(member.row);
      const fill = member.row === "back" ? PREVIEW_BACK : PREVIEW_FRONT;
      const moved =
        currentSlots.get(member.originalSlot) != null &&
        currentSlots.get(member.originalSlot) !== slot;
      const card = scene.add
        .rectangle(x + cardW / 2, y + cardH / 2, cardW, cardH, fill, 0.96)
        .setStrokeStyle(
          2,
          slot === state.focusedIdx
            ? FF6_GOLD
            : moved
              ? FF6_GLOW
              : rowColors.stroke,
        )
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT);
      const slotBadge = scene.add
        .rectangle(
          x + preview.slotBadge.x,
          y + preview.slotBadge.y,
          preview.slotBadge.width,
          preview.slotBadge.height,
          0x132947,
          1,
        )
        .setStrokeStyle(1, 0xe7f2ff, 0.8)
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 1);
      const slotLabel = scene.add
        .text(x + preview.slotBadge.x, y + preview.slotBadge.y, `${slot + 1}`, {
          fontSize: `${preview.slotBadge.fontSize}px`,
          fontStyle: "bold",
          color: "#fff7d6",
          fontFamily: "Courier New",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 2);
      const portraitKey = resolvePortraitTextureKey(scene, member);
      let portrait = null;
      if (portraitKey) {
        portrait = scene.add
          .image(x + preview.portrait.x, y + cardH / 2, portraitKey)
          .setScrollFactor(0)
          .setDepth(DEPTH_CONTENT + 2);
        const srcSize = Math.max(portrait.width || 64, portrait.height || 64);
        portrait.setScale(preview.portrait.size / srcSize);
      } else {
        portrait = scene.add
          .text(
            x + preview.portrait.x,
            y + cardH / 2,
            (member.class_name || "?")[0] || "?",
            {
              fontSize: `${Math.round(preview.portrait.size * 0.6)}px`,
              fontStyle: "bold",
              color: "#eef7ff",
              fontFamily: "Georgia",
            },
          )
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(DEPTH_CONTENT + 2);
      }
      const name = scene.add
        .text(x + preview.name.x, y + preview.name.y, member.name, {
          fontSize: `${preview.name.fontSize}px`,
          fontStyle: "bold",
          color: "#f7fbff",
          fontFamily: "Trebuchet MS",
        })
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 2);
      const badge = scene.add
        .text(
          x + preview.rowLabel.x,
          y + preview.rowLabel.y,
          rowBadgeLabel(member.row),
          {
            fontSize: `${preview.rowLabel.fontSize}px`,
            color: member.row === "back" ? "#d5e2ff" : "#fff0b4",
            fontFamily: "monospace",
          },
        )
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 2);
      const movedTag = moved
        ? scene.add
            .text(x + preview.moved.x, y + preview.moved.y, "SWAP PREVIEW", {
              fontSize: `${preview.moved.fontSize}px`,
              color: "#8fd7ff",
              fontFamily: "monospace",
            })
            .setScrollFactor(0)
            .setDepth(DEPTH_CONTENT + 2)
        : null;

      state.dynamicObjects.push(
        card,
        slotBadge,
        slotLabel,
        portrait,
        name,
        badge,
      );
      if (movedTag) state.dynamicObjects.push(movedTag);
      state.previewEntries.push({
        slot,
        originalSlot: member.originalSlot,
        name: member.name,
        row: member.row,
        moved,
        card,
        bounds: typeof card.getBounds === "function" ? card.getBounds() : null,
      });
    }
  }

  function renderRows() {
    const list = layout.list;
    const rightLeft = list.left;
    const rowTop = list.rowTop;
    const rowHeight = list.rowHeight;

    for (let slot = 0; slot < state.draftParty.length; slot += 1) {
      const member = state.draftParty[slot];
      const y = rowTop + slot * rowHeight;
      const selected = slot === state.focusedIdx;
      const picked = slot === state.pickedIdx;
      const hovered = slot === state.hoveredIdx;
      const rowColors = rowBadgeColor(member.row);
      const rowFill = picked
        ? PICK_FILL
        : selected
          ? ROW_FILL_SELECTED
          : hovered
            ? ROW_FILL_HOVER
            : ROW_FILL;

      const rowBg = scene.add
        .rectangle(
          rightLeft + list.rowWidth / 2,
          y + rowHeight / 2 - 2,
          list.rowWidth,
          list.rowBodyHeight,
          rowFill,
          0.98,
        )
        .setStrokeStyle(2, picked ? FF6_GOLD : selected ? FF6_GLOW : FF6_BLUE)
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT);
      rowBg.setInteractive({ useHandCursor: true });
      rowBg.on("pointerdown", () => {
        state.focusedIdx = slot;
        state.activateFocused();
      });
      rowBg.on("pointerover", () => {
        state.hoveredIdx = slot;
        if (state.pickedIdx !== slot && state.focusedIdx !== slot) {
          rowBg.setFillStyle(ROW_FILL_HOVER, 0.98);
        }
      });
      rowBg.on("pointerout", () => {
        if (state.hoveredIdx === slot) {
          state.hoveredIdx = null;
          rowBg.setFillStyle(
            state.pickedIdx === slot
              ? PICK_FILL
              : state.focusedIdx === slot
                ? ROW_FILL_SELECTED
                : ROW_FILL,
            0.98,
          );
        }
      });

      const portraitKey = resolvePortraitTextureKey(scene, member);
      const portraitFrame = scene.add
        .rectangle(
          rightLeft + list.portrait.x,
          y + list.portrait.y,
          list.portrait.size,
          list.portrait.size,
          0x10233f,
          1,
        )
        .setStrokeStyle(2, rowColors.stroke)
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 1);
      let portrait = null;
      if (portraitKey) {
        portrait = scene.add
          .image(rightLeft + list.portrait.x, y + list.portrait.y, portraitKey)
          .setScrollFactor(0)
          .setDepth(DEPTH_CONTENT + 2);
        const srcSize = Math.max(portrait.width || 64, portrait.height || 64);
        portrait.setScale(list.portrait.imageSize / srcSize);
      } else {
        portrait = scene.add
          .text(
            rightLeft + list.portrait.x,
            y + list.portrait.y,
            (member.class_name || "?")[0] || "?",
            {
              fontSize: `${Math.round(list.portrait.imageSize * 0.6)}px`,
              fontStyle: "bold",
              color: "#eef7ff",
              fontFamily: "Georgia",
            },
          )
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(DEPTH_CONTENT + 2);
      }

      const slotText = scene.add
        .text(
          rightLeft + list.name.x,
          y + list.name.y,
          `${slot + 1}. ${member.name}`,
          {
            fontSize: `${list.name.fontSize}px`,
            fontStyle: "bold",
            color: "#f7fbff",
            fontFamily: "Trebuchet MS",
          },
        )
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 2);
      const classText = scene.add
        .text(
          rightLeft + list.className.x,
          y + list.className.y,
          member.class_name || "Adventurer",
          {
            fontSize: `${list.className.fontSize}px`,
            color: "#d2bdd7",
            fontFamily: "Georgia",
          },
        )
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 2);
      const statsText = scene.add
        .text(
          rightLeft + list.stats.x,
          y + list.stats.y,
          `Lv ${member.level}   HP ${member.hp}/${member.max_hp}   MP ${member.mp || 0}/${member.max_mp || 0}`,
          {
            fontSize: `${list.stats.fontSize}px`,
            color: "#dbe9ff",
            fontFamily: "Courier New",
          },
        )
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 2);
      const rowBadgeBg = scene.add
        .rectangle(
          rightLeft + list.badge.x,
          y + list.badge.y,
          list.badge.width,
          list.badge.height,
          rowColors.fill,
          1,
        )
        .setStrokeStyle(2, rowColors.stroke)
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 1);
      rowBadgeBg.setInteractive({ useHandCursor: true });
      rowBadgeBg.on("pointerdown", () => {
        state.focusedIdx = slot;
        state.setRow(slot, member.row === "front" ? "back" : "front");
      });
      const rowBadgeText = scene.add
        .text(
          rightLeft + list.badge.x,
          y + list.badge.y,
          rowBadgeLabel(member.row),
          {
            fontSize: `${list.badge.fontSize}px`,
            fontStyle: "bold",
            color: member.row === "back" ? "#e6f0ff" : "#fff5d1",
            fontFamily: "monospace",
          },
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH_CONTENT + 2);
      const pickedText = picked
        ? scene.add
            .text(rightLeft + list.picked.x, y + list.picked.y, "PICKED", {
              fontSize: `${list.picked.fontSize}px`,
              fontStyle: "bold",
              color: "#ffef9f",
              fontFamily: "monospace",
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH_CONTENT + 2)
        : null;

      state.dynamicObjects.push(
        rowBg,
        portraitFrame,
        portrait,
        slotText,
        classText,
        statsText,
        rowBadgeBg,
        rowBadgeText,
      );
      if (pickedText) state.dynamicObjects.push(pickedText);

      state.rowObjects.push({
        slot,
        rowBg,
        name: slotText,
        rowBadge: { bg: rowBadgeBg, label: rowBadgeText },
        row: member.row,
      });
    }
  }

  const syncBridgeState = () => {
    if (!scene.formationMenuState) return;
    scene.formationMenuState.rowObjects = state.rowObjects;
    scene.formationMenuState.draftParty = state.draftParty;
    scene.formationMenuState.draftRows = state.draftRows;
    scene.formationMenuState.focusedIdx = state.focusedIdx;
    scene.formationMenuState.pickedIdx = state.pickedIdx;
    scene.formationMenuState.previewEntries = state.previewEntries;
  };

  function renderDynamic() {
    clearDynamic();
    state.draftRows = state.draftParty.map((member) => member.row);
    renderPreview();
    renderRows();
    if (state.hintText) {
      state.hintText.setText(
        layout.mode === "mobile"
          ? state.pickedIdx == null
            ? "TAP a hero to pick • tap another to swap • tap FRONT/BACK to change row"
            : "TAP a target to swap • tap FRONT/BACK to change row • BACK cancels"
          : state.pickedIdx == null
            ? "UP/DOWN move  ENTER pick  LEFT/RIGHT row  ESC save"
            : "UP/DOWN target  ENTER swap  LEFT/RIGHT row  ESC cancel pick",
      );
    }
    syncBridgeState();
  }

  const teardown = () => {
    clearDynamic();
    destroyObjects(staticObjects);
    if (scene.formationMenuState?.keyHandlers) {
      const { up, down, left, right, enter, esc } =
        scene.formationMenuState.keyHandlers;
      scene.input.keyboard.off("keydown-UP", up);
      scene.input.keyboard.off("keydown-DOWN", down);
      scene.input.keyboard.off("keydown-LEFT", left);
      scene.input.keyboard.off("keydown-RIGHT", right);
      scene.input.keyboard.off("keydown-ENTER", enter);
      scene.input.keyboard.off("keydown-ESC", esc);
    }
    scene.formationMenuState = null;
    restoreMenuOverlayGameSize(scene, state.previousGameSize);
    state.previousGameSize = null;
    resumeWorldFor(scene, "formation_menu");
  };

  const closeAndSave = async () => {
    if (state.closing) return;
    state.closing = true;
    state.saveBtn.setLabel("SAVING...");
    state.saveBtn.setEnabled(false);
    try {
      const payload = buildFormationPayload(state.draftParty);
      const result = await updatePartyFormation(
        scene.gameState.id,
        payload.updates,
        payload.reorder,
      );
      if (result?.error) {
        throw new Error(result.error);
      }
      scene.gameState = result;
      if (typeof scene.updateHUD === "function") scene.updateHUD();
      teardown();
      playSFX("sfx_save");
      toggleMenu(scene);
    } catch (error) {
      state.closing = false;
      state.saveBtn.setLabel("SAVE & CLOSE");
      state.saveBtn.setEnabled(true);
      const reason =
        typeof error?.message === "string" && error.message
          ? error.message
          : "unknown error";
      scene.showMessage(`Formation failed: ${reason}`);
      scene.time.delayedCall(1800, () => scene.hideMessage());
    }
  };

  state.closeAndSave = closeAndSave;
  state.saveBtn = drawButton(
    scene,
    layout.save.x,
    layout.save.y,
    layout.save.width,
    layout.save.height,
    "SAVE & CLOSE",
    closeAndSave,
    {
      depth: DEPTH_CONTENT,
      fill: 0x294a7a,
      fillHover: 0x335c95,
      fillPress: 0x3a6ca8,
      fillActive: 0x335c95,
      stroke: FF6_GOLD_DARK,
      strokeActive: FF6_GOLD,
      fontSize: `${layout.save.fontSize}px`,
    },
  );
  state.saveBtn.bg.__kithlandsFormation = { role: "save" };
  staticObjects.push(state.saveBtn);

  const onUp = () => {
    if (state.draftParty.length === 0) return;
    state.focusSlot(
      Phaser.Math.Wrap(state.focusedIdx - 1, 0, state.draftParty.length),
    );
  };
  const onDown = () => {
    if (state.draftParty.length === 0) return;
    state.focusSlot(
      Phaser.Math.Wrap(state.focusedIdx + 1, 0, state.draftParty.length),
    );
  };
  const onLeft = () => state.setRow(state.focusedIdx, "front");
  const onRight = () => state.setRow(state.focusedIdx, "back");
  const onEnter = () => state.activateFocused();
  const onEsc = () => {
    if (!state.cancelPick()) {
      void closeAndSave();
    }
  };
  scene.input.keyboard.on("keydown-UP", onUp);
  scene.input.keyboard.on("keydown-DOWN", onDown);
  scene.input.keyboard.on("keydown-LEFT", onLeft);
  scene.input.keyboard.on("keydown-RIGHT", onRight);
  scene.input.keyboard.on("keydown-ENTER", onEnter);
  scene.input.keyboard.on("keydown-ESC", onEsc);

  scene.formationMenuState = {
    layout,
    shell: shell.bg,
    rowObjects: state.rowObjects,
    draftParty: state.draftParty,
    draftRows: state.draftRows,
    focusedIdx: state.focusedIdx,
    pickedIdx: state.pickedIdx,
    saveBtn: state.saveBtn,
    closeAndSave,
    previewEntries: state.previewEntries,
    previewPanel: state.previewPanel,
    listPanel: state.listPanel,
    focusSlot(slot) {
      state.focusSlot(slot);
    },
    setRow(slot, row) {
      state.setRow(slot, row);
    },
    activateSlot(slot) {
      state.focusSlot(slot);
      state.activateFocused();
    },
    activateFocused() {
      state.activateFocused();
    },
    keyHandlers: {
      up: onUp,
      down: onDown,
      left: onLeft,
      right: onRight,
      enter: onEnter,
      esc: onEsc,
    },
  };

  renderDynamic();
}
