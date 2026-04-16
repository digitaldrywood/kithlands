import { getNpcDialogue } from "../api.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { isRestBuilding } from "./building_type.js";

// Default dialogue lines used when the server call fails.
const FALLBACK_DIALOGUE = {
  shop: {
    npc_name: "Merchant",
    sprite: "npc_merchant",
    lines: [
      "Welcome! Browse our wares.",
      "We have weapons, armor, and supplies.",
    ],
  },
  rest: {
    npc_name: "Innkeeper",
    sprite: "npc_innkeeper",
    lines: ["Welcome, weary traveler.", "Rest here and recover your strength."],
  },
  temple: {
    npc_name: "Priestess",
    sprite: "npc_priestess",
    lines: [
      "Blessings upon you, child of light.",
      "May your wounds be healed.",
    ],
  },
  default: {
    npc_name: "Guard",
    sprite: "npc_guard",
    lines: ["Welcome, adventurer.", "Safe travels."],
  },
};

function fallbackForTags(tags) {
  const tagSet = new Set(tags || []);
  if (isRestBuilding(tags)) return FALLBACK_DIALOGUE.rest;
  if (tagSet.has("shop") || tagSet.has("commerce"))
    return FALLBACK_DIALOGUE.shop;
  if (tagSet.has("temple") || tagSet.has("revive"))
    return FALLBACK_DIALOGUE.temple;
  return FALLBACK_DIALOGUE.default;
}

export async function openDialogue(scene, spawn, providedDialogue = null) {
  pauseWorldFor(scene, "dialogue");
  scene.animating = true;

  let dialogue = providedDialogue;
  if (!dialogue) {
    try {
      const resp = await getNpcDialogue(scene.gameState.id, spawn.node_id);
      if (resp && resp.lines && resp.lines.length > 0) {
        dialogue = resp;
      } else {
        dialogue = fallbackForTags(spawn.tags);
      }
    } catch {
      dialogue = fallbackForTags(spawn.tags);
    }
  }

  const lines = dialogue.lines;
  let lineIndex = 0;

  const overlay = [];

  // Dialogue box background (bottom of screen, RPG style)
  const boxY = 460;
  const boxH = 130;
  const bg = scene.add
    .rectangle(400, boxY + boxH / 2, 760, boxH, 0x0a0a22, 0.95)
    .setStrokeStyle(2, 0x4488ff)
    .setScrollFactor(0)
    .setDepth(60)
    .setInteractive();
  overlay.push(bg);

  // NPC name label
  const nameText = scene.add
    .text(40, boxY + 10, dialogue.npc_name, {
      fontSize: "14px",
      color: "#ffff44",
      fontFamily: "monospace",
    })
    .setScrollFactor(0)
    .setDepth(61);
  overlay.push(nameText);

  // Dialogue text
  const dialogueText = scene.add
    .text(40, boxY + 35, lines[lineIndex], {
      fontSize: "12px",
      color: "#ffffff",
      fontFamily: "monospace",
      wordWrap: { width: 700 },
      lineSpacing: 4,
    })
    .setScrollFactor(0)
    .setDepth(61);
  overlay.push(dialogueText);

  // Advance prompt
  const promptText = scene.add
    .text(720, boxY + boxH - 20, "[ENTER]", {
      fontSize: "10px",
      color: "#888888",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(61);
  overlay.push(promptText);

  // Blink the prompt
  scene.tweens.add({
    targets: promptText,
    alpha: 0.3,
    duration: 600,
    yoyo: true,
    repeat: -1,
  });

  return new Promise((resolve) => {
    const closeDialogue = () => {
      overlay.forEach((o) => o.destroy());
      scene.animating = false;
      resumeWorldFor(scene, "dialogue");
      scene.input.keyboard.off("keydown-ENTER", advanceHandler);
      scene.input.keyboard.off("keydown-SPACE", advanceHandler);
      scene.input.keyboard.off("keydown-ESC", escHandler);
      resolve();
    };

    const advanceHandler = () => {
      lineIndex++;
      if (lineIndex >= lines.length) {
        closeDialogue();
      } else {
        dialogueText.setText(lines[lineIndex]);
        if (lineIndex === lines.length - 1) {
          promptText.setText("[CLOSE]");
        }
      }
    };

    const escHandler = () => {
      closeDialogue();
    };

    scene.input.keyboard.on("keydown-ENTER", advanceHandler);
    scene.input.keyboard.on("keydown-SPACE", advanceHandler);
    scene.input.keyboard.on("keydown-ESC", escHandler);

    // Also allow clicking the box to advance
    bg.on("pointerdown", advanceHandler);
  });
}
