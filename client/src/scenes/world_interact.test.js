import { describe, expect, it, vi } from "vitest";
import { interactWithDoor, showInteractPrompt } from "./world_interact.js";

describe("quest door transitions", () => {
  it.each(["combat", "promotion", "victory", "defeat"])(
    "routes %s through World instead of entering an interior",
    async (phase) => {
      const result = { phase, current_quest: 1, quests: [{}, {}] };
      const scene = {
        currentDoorSpawn: { node_id: "quest-target", name: "Trial" },
        gameState: { phase: "world", current_quest: 0, quests: [{}, {}] },
        scene: { start: vi.fn() },
        cameras: { main: { fadeOut: vi.fn(), once: vi.fn() } },
        async triggerQuestAdvance() {
          this.gameState = result;
        },
      };
      await interactWithDoor(scene);
      expect(scene.scene.start).toHaveBeenCalledWith("World", {
        gameState: result,
      });
      expect(scene.cameras.main.fadeOut).not.toHaveBeenCalled();
    },
  );
});

function makeScene() {
  return {
    player: { x: 10, y: 20 },
    add: {
      text(x, y, text) {
        return {
          x,
          y,
          text,
          destroyed: false,
          setOrigin() {
            return this;
          },
          setDepth() {
            return this;
          },
          destroy() {
            this.destroyed = true;
          },
        };
      },
    },
    interactPrompt: null,
  };
}

describe("showInteractPrompt", () => {
  it("shows Rest for house tags", () => {
    const scene = makeScene();
    showInteractPrompt(scene, { name: "Home", tags: ["house"] });
    expect(scene.interactPrompt.text).toContain("Rest");
    expect(scene.interactPrompt.text).not.toContain("Home");
  });

  it("shows Rest for safehouse tags", () => {
    const scene = makeScene();
    showInteractPrompt(scene, { name: "Hideout", tags: ["safehouse"] });
    expect(scene.interactPrompt.text).toContain("Rest");
    expect(scene.interactPrompt.text).not.toContain("Hideout");
  });

  it("prefers Rest over Shop for inn-style commerce tags", () => {
    const scene = makeScene();
    showInteractPrompt(scene, {
      name: "The Wayward Inn",
      tags: ["commerce", "rest"],
    });
    expect(scene.interactPrompt.text).toContain("Rest");
    expect(scene.interactPrompt.text).not.toContain("The Wayward Inn");
  });
});
