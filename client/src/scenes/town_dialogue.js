import "../styles/merchant-dialogue.css";
import { portraitFontSize } from "../systems/gameplayViewport.js";
import { oncePerKeyEvent } from "../systems/keyboard_events.js";
import { roundedRectangle } from "../ui/theme.js";
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

function isConfirmKey(event) {
  return (
    event?.key === "Enter" ||
    event?.code === "Enter" ||
    event?.key === " " ||
    event?.key === "Space" ||
    event?.key === "Spacebar" ||
    event?.code === "Space"
  );
}

export async function openDialogue(
  scene,
  spawn,
  providedDialogue = null,
  { browseShop = false } = {},
) {
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

  // Dialogue box background (bottom of screen, RPG style). Keep this above
  // the room and interaction prompts, but above the footer instead of behind
  // it.
  const depth = 1700;
  const portrait = scene.gameplayLayout?.portrait === true;
  const boxY = portrait ? scene.gameplayLayout.playfieldBottom - 320 : 430;
  const boxH = portrait ? 280 : 118;
  const bg = roundedRectangle(
    scene,
    400,
    boxY + boxH / 2,
    760,
    boxH,
    0x151e2b,
    1,
  )
    .setStrokeStyle(2, 0x7fb7ff)
    .setScrollFactor(0)
    .setDepth(depth)
    .setInteractive();
  overlay.push(bg);

  // NPC name label
  const nameText = scene.add
    .text(40, boxY + (portrait ? 18 : 10), dialogue.npc_name, {
      fontSize: portrait ? "30px" : "14px",
      color: "#ffff44",
      fontFamily: portrait ? "Arial, sans-serif" : "Arial, sans-serif",
    })
    .setScrollFactor(0)
    .setDepth(depth + 1);
  overlay.push(nameText);

  // Dialogue text
  const dialogueText = scene.add
    .text(40, boxY + (portrait ? 64 : 35), lines[lineIndex], {
      fontSize: portrait ? portraitFontSize(scene) : "12px",
      color: "#ffffff",
      fontFamily: portrait ? "Arial, sans-serif" : "Arial, sans-serif",
      wordWrap: { width: 700 },
      lineSpacing: 4,
    })
    .setScrollFactor(0)
    .setDepth(depth + 1);
  overlay.push(dialogueText);

  // Advance prompt
  const promptText = scene.add
    .text(704, boxY + boxH - (portrait ? 28 : 18), portrait ? "Tap" : "Enter", {
      fontSize: portrait ? "24px" : "10px",
      color: "#b9c7dd",
      fontFamily: portrait ? "Arial, sans-serif" : "Arial, sans-serif",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(depth + 1);
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
    let closed = false;
    let browseButton = null;
    let observer = null;
    const positionBrowse = () => {
      const rect = scene.game.canvas.getBoundingClientRect();
      const scale = rect.height / scene.scale.gameSize.height;
      browseButton.style.left = `${rect.left + 40 * scale}px`;
      browseButton.style.top = `${rect.top + (boxY + boxH - (portrait ? 108 : 54)) * scale}px`;
    };
    const removeBrowse = () => {
      if (!browseButton) return;
      observer?.disconnect();
      window.removeEventListener("resize", positionBrowse);
      browseButton.remove();
    };
    const closeDialogue = () => {
      if (closed) return;
      closed = true;
      removeBrowse();
      scene.events?.off("shutdown", closeDialogue);
      overlay.forEach((o) => o.destroy());
      scene.animating = false;
      resumeWorldFor(scene, "dialogue");
      scene.input.keyboard.off("keydown", keyHandler);
      scene.input.keyboard.off("keydown-ESC", escHandler);
      resolve();
    };

    const advanceHandler = () => {
      if (closed) return;
      lineIndex++;
      if (lineIndex >= lines.length) {
        closeDialogue();
      } else {
        dialogueText.setText(lines[lineIndex]);
        if (lineIndex === lines.length - 1) {
          promptText.setText("Close");
        }
      }
    };

    const escHandler = () => {
      closeDialogue();
    };
    const keyHandler = oncePerKeyEvent((event) => {
      if (browseShop && event?.key?.toLowerCase() === "b" && !event.repeat) {
        event.preventDefault?.();
        closeDialogue();
        return;
      }
      if (!isConfirmKey(event)) return;
      event?.preventDefault?.();
      if (event?.repeat) return;
      advanceHandler();
    });

    if (browseShop) {
      browseButton = document.createElement("button");
      browseButton.type = "button";
      browseButton.className = "merchant-browse";
      browseButton.setAttribute("aria-keyshortcuts", "B");
      browseButton.textContent = "Browse wares · B";
      for (const type of ["pointerdown", "pointerup", "click"])
        browseButton.addEventListener(type, (event) => event.stopPropagation());
      for (const type of ["keydown", "keyup"])
        browseButton.addEventListener(type, (event) => {
          if (["Enter", " "].includes(event.key)) event.stopPropagation();
        });
      browseButton.addEventListener("click", closeDialogue);
      document.body.append(browseButton);
      observer = new ResizeObserver(positionBrowse);
      observer.observe(scene.game.canvas);
      window.addEventListener("resize", positionBrowse);
      positionBrowse();
      scene.events?.once("shutdown", closeDialogue);
    }
    scene.input.keyboard.on("keydown", keyHandler);
    scene.input.keyboard.on("keydown-ESC", escHandler);

    // Also allow clicking the box to advance. Consume the game-object event so
    // this same touch cannot reach the world's tap-to-walk listener after the
    // dialogue releases its modal lock.
    bg.on("pointerdown", (_pointer, _localX, _localY, event) => {
      event?.stopPropagation?.();
      advanceHandler();
    });
  });
}
