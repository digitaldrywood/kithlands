import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  interactWithDoor,
  interactWithNaturalNode,
  naturalDiscoveryDisplay,
  nearbyWorldArrival,
  nearbyWorldInteraction,
  pendingNaturalDiscovery,
  showInteractPrompt,
  syncWorldArrival,
  updateWorldInteractionTarget,
} from "./world_interact.js";
import { activeWorldLocks } from "../systems/modalLock.js";

const apiMocks = vi.hoisted(() => ({
  gameAction: vi.fn(),
  transitionLocation: vi.fn(),
}));
const dialogueMocks = vi.hoisted(() => ({ openDialogue: vi.fn() }));
const inputMocks = vi.hoisted(() => ({ isTouchDevice: vi.fn(() => false) }));

vi.mock("../api.js", () => apiMocks);
vi.mock("./town_dialogue.js", () => dialogueMocks);
vi.mock("../systems/input.js", () => inputMocks);

beforeEach(() => {
  vi.clearAllMocks();
  inputMocks.isTouchDevice.mockReturnValue(false);
});

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
    playerX: 2,
    playerY: 3,
    spawns: [],
    gameState: {
      id: "game-1",
      current_location: { kind: "world", world_node_id: "grove" },
      natural_discoveries: [],
    },
    add: {
      text(x, y, text, style) {
        return {
          x,
          y,
          text,
          style,
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

  it("uses the server-authored natural prompt and Enter only", () => {
    const scene = makeScene();
    scene.gameState.natural_discoveries = [
      { node_id: "grove", prompt: "Examine the old stones" },
    ];
    showInteractPrompt(scene, { kind: "natural", node_id: "grove" });
    expect(scene.interactPrompt.text).toBe("[ ENTER ] Examine the old stones");
    expect(scene.interactPrompt.text).not.toContain("SPACE");
  });

  it("uses the touch action label after touch controls activate", () => {
    inputMocks.isTouchDevice.mockReturnValue(true);
    const scene = makeScene();
    scene.gameplayLayout = { portrait: true };
    showInteractPrompt(scene, { kind: "natural", node_id: "grove" });
    expect(scene.interactPrompt.text).toBe("[ TAP A ] Explore");
    expect(scene.interactPrompt.style.fontSize).toBe("24px");
    expect(scene.interactPrompt.y).toBe(scene.player.y - 72);
  });
});

describe("natural discovery selection", () => {
  it("keeps the server's first-unclaimed order when an entry is revealed", () => {
    const gameState = {
      natural_discoveries: [
        { discovery_id: "passage", node_id: "grove", revealed: true },
        { discovery_id: "cache", node_id: "grove", revealed: false },
      ],
    };
    expect(pendingNaturalDiscovery(gameState, "grove")?.discovery_id).toBe(
      "passage",
    );
    gameState.natural_discoveries[0].claimed = true;
    expect(pendingNaturalDiscovery(gameState, "grove")?.discovery_id).toBe(
      "cache",
    );
  });

  it("keeps the last server assignment as exhausted-state display context", () => {
    const gameState = {
      natural_discoveries: [
        { discovery_id: "clue", node_id: "grove", claimed: true },
        {
          discovery_id: "passage",
          node_id: "grove",
          title: "Sealed Stone Passage",
          claimed: true,
        },
      ],
    };
    expect(pendingNaturalDiscovery(gameState, "grove")).toBeUndefined();
    expect(naturalDiscoveryDisplay(gameState, "grove")?.title).toBe(
      "Sealed Stone Passage",
    );
  });

  it("chooses the nearest interaction and favors a door on an exact tie", () => {
    const natural = { kind: "natural", x: 2, y: 2 };
    const door = { kind: "business", x: 4, y: 2 };
    expect(nearbyWorldInteraction([door, natural], 2, 3)).toBe(natural);
    expect(nearbyWorldInteraction([natural, door], 3, 2)).toBe(door);
  });

  it("sets exactly one natural or door target and clears stale prompts", () => {
    const scene = makeScene();
    const natural = { kind: "natural", node_id: "grove", x: 2, y: 3 };
    scene.spawns = [natural];
    scene.gameState.natural_discoveries = [
      { node_id: "grove", discovery_id: "clue", prompt: "Inspect" },
    ];
    expect(updateWorldInteractionTarget(scene, 2, 3)).toBe(natural);
    expect(scene.currentNaturalSpawn).toBe(natural);
    expect(scene.currentDoorSpawn).toBeNull();
    updateWorldInteractionTarget(scene, 20, 20);
    expect(scene.currentNaturalSpawn).toBeNull();
    expect(scene.interactPrompt).toBeNull();
  });

  it("leaves extra natural scenery without an authored discovery inactive", () => {
    const scene = makeScene();
    scene.spawns = [{ kind: "natural", node_id: "scenery", x: 2, y: 3 }];
    expect(updateWorldInteractionTarget(scene, 2, 3)).toBeNull();
    expect(scene.currentNaturalSpawn).toBeNull();
    expect(scene.interactPrompt).toBeNull();
  });

  it("keeps a natural discovery inactive until the server authorizes its arrival", () => {
    const scene = makeScene();
    scene.gameState.current_location.world_node_id = "home";
    scene.gameState.natural_discoveries = [
      { node_id: "grove", discovery_id: "clue", prompt: "Inspect" },
    ];
    scene.spawns = [{ kind: "natural", node_id: "grove", x: 2, y: 3 }];

    expect(updateWorldInteractionTarget(scene, 2, 3)).toBeNull();
    expect(scene.currentNaturalSpawn).toBeNull();
  });
});

describe("natural discovery interaction", () => {
  function discoveryScene() {
    const scene = makeScene();
    scene.currentNaturalSpawn = {
      kind: "natural",
      node_id: "grove",
      name: "Willow Grove",
    };
    scene.gameState.natural_discoveries = [
      {
        node_id: "grove",
        discovery_id: "old-clue",
        title: "Weathered Stones",
        prompt: "Inspect the stones",
      },
    ];
    scene.updateHUD = vi.fn();
    scene.updateQuestDisplay = vi.fn();
    scene.updateVehicleIndicator = vi.fn();
    scene.updateInteractionTarget = vi.fn();
    scene.triggerAutosave = vi.fn();
    scene.showMessage = vi.fn();
    scene.hideMessage = vi.fn();
    scene.time = { delayedCall: vi.fn((_delay, callback) => callback()) };
    return scene;
  }

  it("sends the server action, applies state, autosaves, and shows exact response copy", async () => {
    const scene = discoveryScene();
    const result = {
      id: "game-1",
      message: "A trail mark points north.",
      natural_discoveries: [],
    };
    apiMocks.gameAction.mockResolvedValue(result);
    dialogueMocks.openDialogue.mockResolvedValue();

    await interactWithNaturalNode(scene);

    expect(apiMocks.gameAction).toHaveBeenCalledWith("game-1", {
      type: "natural_discovery",
      node_id: "grove",
    });
    expect(scene.gameState).toBe(result);
    expect(scene.triggerAutosave).toHaveBeenCalledWith("natural_discovery");
    expect(dialogueMocks.openDialogue).toHaveBeenCalledWith(
      scene,
      scene.currentNaturalSpawn,
      {
        npc_name: "Weathered Stones",
        lines: ["A trail mark points north."],
      },
    );
    expect(scene.animating).toBe(false);
    expect(activeWorldLocks(scene)).toEqual([]);
    expect(scene.updateInteractionTarget).toHaveBeenCalled();
  });

  it("restores movement and the nearby prompt after a request failure", async () => {
    const scene = discoveryScene();
    apiMocks.gameAction.mockRejectedValue(new Error("offline"));

    await interactWithNaturalNode(scene);

    expect(scene.showMessage).toHaveBeenCalledWith(
      "Could not explore this landmark. Please try again.",
    );
    expect(dialogueMocks.openDialogue).not.toHaveBeenCalled();
    expect(scene.time.delayedCall).toHaveBeenCalledWith(
      3000,
      expect.any(Function),
    );
    expect(scene.hideMessage).toHaveBeenCalled();
    expect(scene.animating).toBe(false);
    expect(activeWorldLocks(scene)).toEqual([]);
    expect(scene.updateInteractionTarget).toHaveBeenCalled();
  });

  it("ignores a second action while the discovery dialogue is closing", async () => {
    const scene = discoveryScene();
    apiMocks.gameAction.mockResolvedValue({
      id: "game-1",
      message: "The stones remember.",
      natural_discoveries: [],
    });
    let closeDialogue;
    dialogueMocks.openDialogue.mockImplementation(
      () => new Promise((resolve) => (closeDialogue = resolve)),
    );

    const interaction = interactWithNaturalNode(scene);
    await vi.waitFor(() => expect(scene.naturalInteractionActive).toBe(true));
    await interactWithNaturalNode(scene);
    expect(apiMocks.gameAction).toHaveBeenCalledTimes(1);

    closeDialogue();
    await interaction;
    expect(scene.naturalInteractionActive).toBe(false);
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
    apiMocks.transitionLocation
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
    expect(apiMocks.transitionLocation).toHaveBeenCalledTimes(2);
    expect(apiMocks.transitionLocation.mock.calls[0]).toEqual(
      apiMocks.transitionLocation.mock.calls[1],
    );
    expect(scene.gameState).toBe(accepted);
  });

  it("returns a clear failure after both exact-hop attempts fail", async () => {
    apiMocks.transitionLocation.mockRejectedValue(new Error("network offline"));
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
    expect(apiMocks.transitionLocation).toHaveBeenCalledTimes(2);
    expect(scene.gameState.current_location.world_node_id).toBe("home");
  });
});
