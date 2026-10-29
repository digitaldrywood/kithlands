import { describe, expect, it, vi } from "vitest";
import { openDialogue } from "./town_dialogue.js";

function displayObject() {
  const handlers = new Map();
  return {
    handlers,
    destroy: vi.fn(),
    on: vi.fn(function (event, handler) {
      handlers.set(event, handler);
      return this;
    }),
    setDepth() {
      return this;
    },
    setInteractive() {
      return this;
    },
    setOrigin() {
      return this;
    },
    setScrollFactor() {
      return this;
    },
    setStrokeStyle() {
      return this;
    },
    setText() {
      return this;
    },
  };
}

describe("town dialogue touch input", () => {
  it("consumes a dialogue-body tap before the world can treat it as movement", async () => {
    const background = displayObject();
    const scene = {
      add: {
        rectangle: vi.fn(() => background),
        text: vi.fn(() => displayObject()),
      },
      animating: false,
      gameplayLayout: { portrait: true, playfieldBottom: 540 },
      input: { keyboard: { on: vi.fn(), off: vi.fn() } },
      tweens: { add: vi.fn() },
    };
    const interaction = openDialogue(
      scene,
      { node_id: "grove" },
      { npc_name: "Willow Grove", lines: ["The leaves whisper."] },
    );
    const stopPropagation = vi.fn();

    background.handlers.get("pointerdown")({}, 0, 0, { stopPropagation });
    // A queued stale tap after closing must not destroy/unlock twice.
    background.handlers.get("pointerdown")({}, 0, 0, { stopPropagation });
    await interaction;

    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(background.destroy).toHaveBeenCalledOnce();
    expect(scene.animating).toBe(false);
    expect([...scene._modalLocks]).toEqual([]);
  });
  it("a replayed confirm advances only one dialogue page", async () => {
    const keyboard = new Map();
    const scene = {
      add: {
        rectangle: vi.fn(() => displayObject()),
        text: vi.fn(() => displayObject()),
      },
      animating: false,
      input: {
        keyboard: {
          on: (key, handler) => keyboard.set(key, handler),
          off: vi.fn(),
        },
      },
      tweens: { add: vi.fn() },
    };
    const interaction = openDialogue(
      scene,
      { node_id: "shop" },
      { npc_name: "Merchant", lines: ["First page", "Last page"] },
    );
    const key = { key: "Enter", repeat: false, preventDefault: vi.fn() };
    const confirm = keyboard.get("keydown");
    confirm(key);
    confirm(key);
    expect(scene.animating).toBe(true);
    confirm({ key: "Enter", repeat: false, preventDefault: vi.fn() });
    await interaction;
    expect(scene.animating).toBe(false);
    expect([...scene._modalLocks]).toEqual([]);
  });
});
