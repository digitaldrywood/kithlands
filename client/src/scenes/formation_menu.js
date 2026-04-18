import { updatePartyFormation } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { drawButton, drawPanel } from "../ui/panel.js";
import { inferPartyRow } from "./battle_layout.js";
import { toggleMenu } from "./world_menu.js";

const PANEL_CX = 400;
const PANEL_CY = 300;
const PANEL_W = 620;
const PANEL_H = 420;
const PANEL_LEFT = PANEL_CX - PANEL_W / 2;
const PANEL_TOP = PANEL_CY - PANEL_H / 2;
const DEPTH_BG = 50;
const DEPTH_CONTENT = 51;

function normalizeRow(row) {
  return row === "front" || row === "back" ? row : "";
}

function resolveMemberRow(member) {
  return normalizeRow(member?.row) || inferPartyRow(member);
}

export function showFormationMenu(scene) {
  pauseWorldFor(scene, "formation_menu");

  const overlay = [];
  const party = Array.isArray(scene?.gameState?.party)
    ? scene.gameState.party
    : [];
  const draftRows = party.map((member) => resolveMemberRow(member));
  const rowObjects = [];
  let focusedIdx = 0;
  let closing = false;

  const panel = drawPanel(scene, PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, {
    depth: DEPTH_BG,
  });
  overlay.push(panel.bg);

  const title = scene.add
    .text(PANEL_CX, PANEL_TOP + 34, "FORMATION", {
      fontSize: "20px",
      color: "#ffff44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  overlay.push(title);

  const hint = scene.add
    .text(
      PANEL_CX,
      PANEL_TOP + 58,
      "UP/DOWN select    LEFT/RIGHT toggle row    ENTER flip row    ESC save",
      {
        fontSize: "10px",
        color: "#8899bb",
        fontFamily: "monospace",
      },
    )
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  overlay.push(hint);

  function setDraftRow(slot, row) {
    draftRows[slot] = row;
    syncRow(slot);
  }

  function setFocus(nextIdx) {
    if (rowObjects.length === 0) return;
    const clamped = Phaser.Math.Wrap(nextIdx, 0, rowObjects.length);
    if (rowObjects[focusedIdx]) {
      rowObjects[focusedIdx].rowBg.setStrokeStyle(1, 0x4488ff);
    }
    focusedIdx = clamped;
    rowObjects[focusedIdx].rowBg.setStrokeStyle(2, 0xffcc44);
  }

  function syncRow(slot) {
    const entry = rowObjects[slot];
    if (!entry) return;
    const isFront = draftRows[slot] === "front";
    entry.frontBtn.setActive(isFront);
    entry.backBtn.setActive(!isFront);
    entry.rowLabel.setText(isFront ? "Front line" : "Back line");
  }

  const rowTop = PANEL_TOP + 108;
  const rowHeight = 64;
  for (let i = 0; i < party.length; i++) {
    const member = party[i];
    const y = rowTop + i * rowHeight;
    const rowBg = scene.add
      .rectangle(PANEL_CX, y + 20, PANEL_W - 40, 50, 0x10192d, 0.96)
      .setStrokeStyle(1, 0x4488ff)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT);
    rowBg.setInteractive({ useHandCursor: true });
    rowBg.on("pointerdown", () => setFocus(i));
    overlay.push(rowBg);

    const name = scene.add
      .text(PANEL_LEFT + 34, y + 8, member.name, {
        fontSize: "13px",
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 1);
    const subtitle = scene.add
      .text(
        PANEL_LEFT + 34,
        y + 24,
        `${member.class_name || "Adventurer"}  HP ${member.hp}/${member.max_hp}`,
        {
          fontSize: "10px",
          color: "#aab4cc",
          fontFamily: "monospace",
        },
      )
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 1);
    const rowLabel = scene.add
      .text(PANEL_LEFT + 240, y + 16, "", {
        fontSize: "11px",
        color: "#ffcc44",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT + 1);
    overlay.push(name, subtitle, rowLabel);

    const frontBtn = drawButton(
      scene,
      PANEL_LEFT + 420,
      y + 20,
      92,
      30,
      "FRONT",
      () => {
        setFocus(i);
        setDraftRow(i, "front");
      },
      { depth: DEPTH_CONTENT },
    );
    const backBtn = drawButton(
      scene,
      PANEL_LEFT + 528,
      y + 20,
      92,
      30,
      "BACK",
      () => {
        setFocus(i);
        setDraftRow(i, "back");
      },
      { depth: DEPTH_CONTENT },
    );
    overlay.push(frontBtn, backBtn);

    rowObjects.push({
      slot: i,
      rowBg,
      rowLabel,
      frontBtn,
      backBtn,
      name,
    });
    syncRow(i);
  }

  const teardown = () => {
    overlay.forEach((entry) => entry?.destroy?.());
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
    resumeWorldFor(scene, "formation_menu");
  };

  const closeAndSave = async () => {
    if (closing) return;
    closing = true;
    saveBtn.setLabel("SAVING...");
    saveBtn.setEnabled(false);
    try {
      const result = await updatePartyFormation(
        scene.gameState.id,
        draftRows.map((row, slot) => ({ slot, row })),
      );
      if (result?.error) {
        throw new Error(result.error);
      }
      teardown();
      scene.gameState = result;
      if (typeof scene.updateHUD === "function") scene.updateHUD();
      playSFX("sfx_save");
      toggleMenu(scene);
    } catch (error) {
      closing = false;
      saveBtn.setLabel("SAVE & CLOSE");
      saveBtn.setEnabled(true);
      const reason =
        typeof error?.message === "string" && error.message
          ? error.message
          : "unknown error";
      scene.showMessage(`Formation failed: ${reason}`);
      scene.time.delayedCall(1800, () => scene.hideMessage());
    }
  };

  const saveBtn = drawButton(
    scene,
    PANEL_CX,
    PANEL_TOP + PANEL_H - 38,
    190,
    34,
    "SAVE & CLOSE",
    closeAndSave,
    { depth: DEPTH_CONTENT },
  );
  overlay.push(saveBtn);

  const onUp = () => setFocus(focusedIdx - 1);
  const onDown = () => setFocus(focusedIdx + 1);
  const onLeft = () => setDraftRow(focusedIdx, "front");
  const onRight = () => setDraftRow(focusedIdx, "back");
  const onEnter = () =>
    setDraftRow(
      focusedIdx,
      draftRows[focusedIdx] === "front" ? "back" : "front",
    );
  const onEsc = () => {
    void closeAndSave();
  };
  scene.input.keyboard.on("keydown-UP", onUp);
  scene.input.keyboard.on("keydown-DOWN", onDown);
  scene.input.keyboard.on("keydown-LEFT", onLeft);
  scene.input.keyboard.on("keydown-RIGHT", onRight);
  scene.input.keyboard.on("keydown-ENTER", onEnter);
  scene.input.keyboard.on("keydown-ESC", onEsc);

  scene.formationMenuState = {
    overlay,
    rowObjects,
    draftRows,
    saveBtn,
    closeAndSave,
    keyHandlers: {
      up: onUp,
      down: onDown,
      left: onLeft,
      right: onRight,
      enter: onEnter,
      esc: onEsc,
    },
  };
  setFocus(0);
}
