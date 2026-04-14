import { describe, expect, it } from "vitest";
import { showInteractPrompt } from "./world_interact.js";

function makeScene() {
  const created = [];
  return {
    player: { x: 10, y: 20 },
    add: {
      text(x, y, text) {
        const obj = {
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
        created.push(obj);
        return obj;
      },
    },
    created,
    interactPrompt: null,
  };
}

describe("showInteractPrompt", () => {
  it("shows Rest for house tags", () => {
    const scene = makeScene();
    showInteractPrompt(scene, { name: "Home", tags: ["house"] });
    expect(scene.interactPrompt.text).toContain("Rest at Home");
  });

  it("shows Rest for safehouse tags", () => {
    const scene = makeScene();
    showInteractPrompt(scene, { name: "Hideout", tags: ["safehouse"] });
    expect(scene.interactPrompt.text).toContain("Rest at Hideout");
  });
});
