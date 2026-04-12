import { drawPanel, drawButton, drawProgressBar } from "../ui/panel.js";
import {
  getBattleSpeed,
  setBattleSpeed,
  getMessageSpeed,
  setMessageSpeed,
  getWalkSpeed,
  setWalkSpeed,
} from "../systems/prefs.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { toggleMenu } from "./world_menu.js";

// FF-style options overlay. Modal over the party menu: a panel with three
// speed rows (Battle / Message / Walk) rendered as visual progress bars
// with large +/- buttons. Follows the showQuestLog overlay pattern — no
// new Phaser scene, just a handle array destroyed on close.
//
// Issue #142: earlier revision used tiny `< N >` steppers (PR #137). Users
// couldn't tell at a glance which end of the range a setting was at;
// replaced with drawProgressBar (ui/panel.js) + larger +/- drawButtons.

const PANEL_CX = 400;
const PANEL_CY = 300;
const PANEL_W = 560;
const PANEL_H = 360;
const PANEL_LEFT = PANEL_CX - PANEL_W / 2;
const PANEL_TOP = PANEL_CY - PANEL_H / 2;
const DEPTH_BG = 50;
const DEPTH_CONTENT = 51;

// Row geometry — the bar track drives the x-layout of the +/- buttons and
// the "cur/max" label, so the whole row feels balanced at 560px panel width.
const BAR_W = 200;
const BAR_H = 14;
const LABEL_X = PANEL_LEFT + 24;
const DEC_BTN_X = PANEL_LEFT + 216;
const BAR_X = PANEL_LEFT + 242;
const INC_BTN_X = BAR_X + BAR_W + 26;
const VALUE_LABEL_X = INC_BTN_X + 28;
const BTN_W = 36;
const BTN_H = 32;

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
  pauseWorldFor(scene, "options");
  const overlay = [];
  const rowHandles = [];
  let focusedIdx = 0;

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
    .text(
      PANEL_CX,
      PANEL_TOP + 56,
      "1 = fastest    higher = slower    \u2190/\u2192 adjust    \u2191/\u2193 select",
      {
        fontSize: "10px",
        color: "#888888",
        fontFamily: "monospace",
      },
    )
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  overlay.push(hint);

  const rowY0 = PANEL_TOP + 110;
  const rowGap = 52;

  for (let i = 0; i < ROWS.length; i++) {
    const row = ROWS[i];
    const y = rowY0 + i * rowGap;

    const labelText = scene.add
      .text(LABEL_X, y, row.label, {
        fontSize: "13px",
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT);
    overlay.push(labelText);

    // Forward declared so the button callbacks can call refresh() — which in
    // turn needs to read bar/decBtn/incBtn out of the closure after they're
    // constructed. Holder object gives us a stable reference site.
    const handle = { row, i };

    const decBtn = drawButton(
      scene,
      DEC_BTN_X,
      y,
      BTN_W,
      BTN_H,
      "\u2212",
      () => {
        focusedIdx = i;
        nudge(i, -1);
      },
      { fontSize: "18px", depth: DEPTH_CONTENT },
    );
    overlay.push(decBtn);
    handle.decBtn = decBtn;

    const bar = drawProgressBar(
      scene,
      BAR_X,
      y,
      BAR_W,
      BAR_H,
      row.get(),
      row.max,
      {
        depth: DEPTH_CONTENT,
        labelOffset: VALUE_LABEL_X - (BAR_X + BAR_W),
      },
    );
    overlay.push(bar);
    handle.bar = bar;

    // Hover anywhere on the bar track focuses this row — cheap keyboard /
    // mouse parity so the highlight follows the pointer.
    bar.track.setInteractive({ useHandCursor: false });
    bar.track.on("pointerover", () => setFocus(i));

    const incBtn = drawButton(
      scene,
      INC_BTN_X,
      y,
      BTN_W,
      BTN_H,
      "+",
      () => {
        focusedIdx = i;
        nudge(i, +1);
      },
      { fontSize: "18px", depth: DEPTH_CONTENT },
    );
    overlay.push(incBtn);
    handle.incBtn = incBtn;

    handle.refresh = () => {
      const cur = row.get();
      bar.setValue(cur);
      decBtn.setEnabled(cur > row.min);
      incBtn.setEnabled(cur < row.max);
    };

    rowHandles.push(handle);
    handle.refresh();
  }

  function setFocus(idx) {
    if (idx < 0 || idx >= rowHandles.length) return;
    if (idx === focusedIdx) {
      rowHandles[idx].bar.setFocused(true);
      return;
    }
    rowHandles[focusedIdx].bar.setFocused(false);
    focusedIdx = idx;
    rowHandles[focusedIdx].bar.setFocused(true);
  }

  function nudge(idx, delta) {
    const handle = rowHandles[idx];
    if (!handle) return;
    const { row } = handle;
    const cur = row.get();
    const next = cur + delta;
    if (next < row.min || next > row.max) return;
    row.set(next);
    handle.refresh();
  }

  setFocus(0);

  const close = () => {
    // Destroy progress bars via their handle so track+fill+label are all
    // torn down together; plain Phaser objects use their own .destroy().
    overlay.forEach((c) => {
      if (c && typeof c.destroy === "function") c.destroy();
    });

    if (scene.optionsEscHandler) {
      scene.input.keyboard.off("keydown-ESC", scene.optionsEscHandler);
      scene.optionsEscHandler = null;
    }
    if (scene.optionsKeyHandlers) {
      const { up, down, left, right } = scene.optionsKeyHandlers;
      scene.input.keyboard.off("keydown-UP", up);
      scene.input.keyboard.off("keydown-DOWN", down);
      scene.input.keyboard.off("keydown-LEFT", left);
      scene.input.keyboard.off("keydown-RIGHT", right);
      scene.optionsKeyHandlers = null;
    }
    resumeWorldFor(scene, "options");
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

  const onUp = () =>
    setFocus((focusedIdx - 1 + rowHandles.length) % rowHandles.length);
  const onDown = () => setFocus((focusedIdx + 1) % rowHandles.length);
  const onLeft = () => nudge(focusedIdx, -1);
  const onRight = () => nudge(focusedIdx, +1);
  scene.optionsKeyHandlers = {
    up: onUp,
    down: onDown,
    left: onLeft,
    right: onRight,
  };
  scene.input.keyboard.on("keydown-UP", onUp);
  scene.input.keyboard.on("keydown-DOWN", onDown);
  scene.input.keyboard.on("keydown-LEFT", onLeft);
  scene.input.keyboard.on("keydown-RIGHT", onRight);

  // Expose the internal API for integration tests — intentionally kept on
  // the returned value rather than the scene so production callers aren't
  // tempted to reach in.
  return { overlay, rowHandles, close, nudge, setFocus };
}
