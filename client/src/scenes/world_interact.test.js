import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ transitionLocation: vi.fn() }));
vi.mock("../api.js", () => api);

import {
  interactWithDoor,
  nearbyWorldArrival,
  showInteractPrompt,
  syncWorldArrival,
} from "./world_interact.js";

beforeEach(() => vi.clearAllMocks());

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

describe("nearbyWorldArrival", () => {
  it("selects a reached node only after leaving the current arrival", () => {
    const scene = {
      gameState: {
        current_location: { kind: "world", world_node_id: "home" },
      },
      playerX: 20,
      playerY: 19,
      spawns: [
        { node_id: "home", x: 8, y: 8 },
        { node_id: "ridge", x: 20, y: 20 },
      ],
    };
    expect(nearbyWorldArrival(scene)?.node_id).toBe("ridge");
    scene.gameState.current_location.world_node_id = "ridge";
    expect(nearbyWorldArrival(scene)).toBeNull();
  });

  it("retries the same ordered hop after a rejected arrival", async () => {
    const accepted = {
      id: "game",
      current_location: { kind: "world", world_node_id: "ridge" },
    };
    api.transitionLocation
      .mockResolvedValueOnce({ error: "temporary route failure" })
      .mockResolvedValueOnce(accepted);
    const scene = {
      gameState: {
        id: "game",
        current_location: { kind: "world", world_node_id: "home" },
      },
      playerX: 20,
      playerY: 19,
      spawns: [
        { node_id: "home", x: 8, y: 8 },
        { node_id: "ridge", x: 20, y: 20 },
      ],
      scene: { isActive: () => true },
      updateHUD: vi.fn(),
    };

    await expect(syncWorldArrival(scene)).resolves.toBe(accepted);
    expect(api.transitionLocation).toHaveBeenCalledTimes(2);
    expect(api.transitionLocation.mock.calls[0]).toEqual(
      api.transitionLocation.mock.calls[1],
    );
    expect(scene.gameState).toBe(accepted);
  });

  it("returns a clear failure after both exact-hop attempts fail", async () => {
    api.transitionLocation.mockRejectedValue(new Error("network offline"));
    const scene = {
      gameState: {
        id: "game",
        current_location: { kind: "world", world_node_id: "home" },
      },
      playerX: 20,
      playerY: 19,
      spawns: [
        { node_id: "home", x: 8, y: 8 },
        { node_id: "ridge", x: 20, y: 20 },
      ],
      scene: { isActive: () => true },
    };

    await expect(syncWorldArrival(scene)).resolves.toEqual({
      error: "network offline",
    });
    expect(api.transitionLocation).toHaveBeenCalledTimes(2);
    expect(scene.gameState.current_location.world_node_id).toBe("home");
  });
});
