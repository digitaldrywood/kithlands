import { drawPanel, drawButton } from "../ui/panel.js";
import {
  getBattleSpeed,
  setBattleSpeed,
  getMessageSpeed,
  setMessageSpeed,
  getWalkSpeed,
  setWalkSpeed,
} from "../systems/prefs.js";
import { toggleMenu } from "./world_menu.js";

// FF-style options overlay (issue #129). Modal over the party menu: a
// panel with three stepper rows (Battle / Message / Walk speed) and a
// close button. Follows the showQuestLog overlay pattern — no new Phaser
// scene, just an object array that is destroyed on close.

const PANEL_CX = 400;
const PANEL_CY = 300;
const PANEL_W = 560;
const PANEL_H = 360;
const PANEL_LEFT = PANEL_CX - PANEL_W / 2;
const PANEL_TOP = PANEL_CY - PANEL_H / 2;
const DEPTH_BG = 50;
const DEPTH_CONTENT = 51;

const ROWS = [
  {
    key: "battle",
    label: "BATTLE SPEED",
    min: 1,
    max: 6,
    get: getBattleSpeed,
    set: setBattleSpeed,
  },
  {
    key: "message",
    label: "MESSAGE SPEED",
    min: 1,
    max: 6,
    get: getMessageSpeed,
    set: setMessageSpeed,
  },
  {
    key: "walk",
    label: "WALK SPEED",
    min: 1,
    max: 3,
    get: getWalkSpeed,
    set: setWalkSpeed,
  },
];

export function showOptions(scene) {
  const overlay = [];

  const panel = drawPanel(scene, PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, {
    depth: DEPTH_BG,
  });
  overlay.push(panel.bg);

  const title = scene.add
    .text(PANEL_CX, PANEL_TOP + 32, "OPTIONS", {
      fontSize: "20px",
      color: "#ffff44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  overlay.push(title);

  const hint = scene.add
    .text(PANEL_CX, PANEL_TOP + 56, "1 = fastest    higher = slower", {
      fontSize: "10px",
      color: "#888888",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  overlay.push(hint);

  // Three stepper rows, evenly spaced below the title.
  const rowY0 = PANEL_TOP + 110;
  const rowGap = 52;
  for (let i = 0; i < ROWS.length; i++) {
    const row = ROWS[i];
    const y = rowY0 + i * rowGap;

    const labelText = scene.add
      .text(PANEL_LEFT + 30, y, row.label, {
        fontSize: "13px",
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT);
    overlay.push(labelText);

    // Current value sits between the < and > buttons. Captured in
    // closure so the stepper callbacks can rewrite it in-place.
    const valueText = scene.add
      .text(PANEL_CX + 110, y, String(row.get()), {
        fontSize: "16px",
        color: "#ffcc44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT);
    overlay.push(valueText);

    const decBtn = drawButton(scene, PANEL_CX + 70, y, 30, 28, "<", () => {
      const cur = row.get();
      if (cur <= row.min) return;
      row.set(cur - 1);
      valueText.setText(String(row.get()));
    });
    overlay.push(decBtn);

    const incBtn = drawButton(scene, PANEL_CX + 150, y, 30, 28, ">", () => {
      const cur = row.get();
      if (cur >= row.max) return;
      row.set(cur + 1);
      valueText.setText(String(row.get()));
    });
    overlay.push(incBtn);
  }

  const close = () => {
    overlay.forEach((c) => c.destroy());
    if (scene.optionsEscHandler) {
      scene.input.keyboard.off("keydown-ESC", scene.optionsEscHandler);
      scene.optionsEscHandler = null;
    }
    // Reopen the party menu so the player lands back where they came from.
    toggleMenu(scene);
  };

  const closeBtn = drawButton(
    scene,
    PANEL_CX,
    PANEL_TOP + PANEL_H - 40,
    160,
    34,
    "CLOSE (ESC)",
    close,
  );
  overlay.push(closeBtn);

  scene.optionsEscHandler = close;
  scene.input.keyboard.once("keydown-ESC", close);
}
