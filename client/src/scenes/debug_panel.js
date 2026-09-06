// Dev-only feature-trigger overlay (#145). Exposes buttons for every
// player-visible state transition the harness needs to reach
// deterministically: force encounter opening, force encounter, heal
// party, give item, warp quest, and a menu smoke cycle.
//
// Follows the same overlay pattern as world_menu.js — draws into a
// scene.debugPanelGroup array that closeDebugPanel destroys in lock-step.
// It is *not* a separate Phaser scene; main.js only exports the toggle
// so the ~-keybind that launches it can be wrapped in import.meta.env.DEV
// and Vite will tree-shake the import out of production builds.

import { drawPanel, drawButton } from "../ui/panel.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import {
  debugForceEncounterStart,
  debugForceEncounter,
  debugGiveItem,
  debugHealParty,
  debugWarpQuest,
  getGame,
} from "../api.js";

const PANEL_CX = 400;
const PANEL_CY = 300;
const PANEL_W = 520;
const PANEL_H = 480;
const PANEL_LEFT = PANEL_CX - PANEL_W / 2;
const PANEL_TOP = PANEL_CY - PANEL_H / 2;
const DEPTH_BG = 60;
const DEPTH_CONTENT = 61;

const BUTTON_W = 220;
const BUTTON_H = 32;
const ROW_GAP = 10;

// Build the ordered list of trigger buttons. Exported so the Vitest
// suite can assert the catalog without constructing a real scene.
export function debugPanelButtons(gameId) {
  return [
    {
      label: "Force ambush (next combat)",
      run: () => debugForceEncounterStart(gameId, "ambush"),
    },
    {
      label: "Force preemptive",
      run: () => debugForceEncounterStart(gameId, "preemptive"),
    },
    {
      label: "Force normal opening",
      run: () => debugForceEncounterStart(gameId, "normal"),
    },
    {
      label: "Force encounter: slime L1",
      run: () => debugForceEncounter(gameId, ["slime"], 1),
    },
    {
      label: "Force encounter: iron golem x2 L5",
      run: () => debugForceEncounter(gameId, ["iron_golem", "iron_golem"], 5),
    },
    { label: "Heal party", run: () => debugHealParty(gameId) },
    {
      label: "Give 5x Potion",
      run: () => debugGiveItem(gameId, "potion", 5),
    },
    {
      label: "Give Phoenix Down",
      run: () => debugGiveItem(gameId, "phoenix_down", 1),
    },
    {
      label: "Give 3x Ether",
      run: () => debugGiveItem(gameId, "ether", 3),
    },
    { label: "Warp to next quest", run: () => debugWarpQuest(gameId, 0) },
  ];
}

export function toggleDebugPanel(scene) {
  if (scene.debugPanelOpen) {
    closeDebugPanel(scene);
    return;
  }
  scene.debugPanelOpen = true;
  pauseWorldFor(scene, "debug_panel");
  scene.debugPanelGroup = [];

  const panel = drawPanel(scene, PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, {
    depth: DEPTH_BG,
  });
  scene.debugPanelGroup.push(panel.bg);

  const title = scene.add
    .text(PANEL_CX, PANEL_TOP + 28, "DEBUG PANEL (dev build)", {
      fontSize: "18px",
      color: "#c9b589",
      fontFamily: "Arial, sans-serif",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  scene.debugPanelGroup.push(title);

  const subtitle = scene.add
    .text(
      PANEL_CX,
      PANEL_TOP + 50,
      "Press ~ or ESC to close — not exposed in production",
      {
        fontSize: "11px",
        color: "#94a8bd",
        fontFamily: "Arial, sans-serif",
      },
    )
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH_CONTENT);
  scene.debugPanelGroup.push(subtitle);

  const gameId = scene.gameState && scene.gameState.id;
  if (!gameId) {
    const err = scene.add
      .text(PANEL_CX, PANEL_CY, "no game loaded", {
        fontSize: "14px",
        color: "#ff6666",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_CONTENT);
    scene.debugPanelGroup.push(err);
    return;
  }

  const buttons = debugPanelButtons(gameId);
  const buttonsTop = PANEL_TOP + 80;
  buttons.forEach((spec, i) => {
    const row = buttonsTop + i * (BUTTON_H + ROW_GAP);
    const btn = drawButton(
      scene,
      PANEL_LEFT + PANEL_W / 2,
      row + BUTTON_H / 2,
      BUTTON_W,
      BUTTON_H,
      spec.label,
      async () => {
        btn.setEnabled(false);
        btn.setLabel(`${spec.label} ...`);
        try {
          await spec.run();
          // Refetch game state so the parent scene sees the mutation on
          // its next render. world.js and battle.js look at scene.gameState
          // directly, so we reassign it here.
          const refreshed = await getGame(gameId);
          if (refreshed && !refreshed.error) {
            scene.gameState = refreshed;
          }
        } catch (e) {
          console.error("[debug_panel]", spec.label, e);
        } finally {
          btn.setEnabled(true);
          btn.setLabel(spec.label);
        }
      },
      { depth: DEPTH_CONTENT },
    );
    scene.debugPanelGroup.push(btn.bg, btn.label);
  });

  // Close button
  const closeBtn = drawButton(
    scene,
    PANEL_LEFT + PANEL_W - 40,
    PANEL_TOP + 28,
    48,
    24,
    "X",
    () => closeDebugPanel(scene),
    { depth: DEPTH_CONTENT },
  );
  scene.debugPanelGroup.push(closeBtn.bg, closeBtn.label);
}

export function closeDebugPanel(scene) {
  if (!scene.debugPanelOpen) return;
  for (const obj of scene.debugPanelGroup || []) {
    try {
      obj.destroy();
    } catch {
      /* ignore destroy on already-dead scene */
    }
  }
  scene.debugPanelGroup = null;
  scene.debugPanelOpen = false;
  resumeWorldFor(scene, "debug_panel");
}
