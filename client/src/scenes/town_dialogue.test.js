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
    await interaction;

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(scene.animating).toBe(false);
    expect([...scene._modalLocks]).toEqual([]);
  });
});
