import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  gameAction: vi.fn(),
  transitionLocation: vi.fn(),
}));

vi.mock("../api.js", async (importOriginal) => ({
  ...(await importOriginal()),
  gameAction: apiMocks.gameAction,
  transitionLocation: apiMocks.transitionLocation,
}));

let WorldScene;
let checkpointWorldPosition;
let syncWorldArrival;
let toggleMenu;
let updateWorldInteractionTarget;

beforeAll(async () => {
  vi.stubGlobal("Phaser", {
    Scene: class {},
    Input: { Keyboard: { KeyCodes: { SPACE: 32 } } },
    Math: {
      Between: () => 100,
      Clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
      Distance: { Between: () => 0 },
    },
  });
  ({ WorldScene } = await import("./world.js"));
  ({ checkpointWorldPosition, syncWorldArrival, updateWorldInteractionTarget } =
    await import("./world_interact.js"));
  ({ toggleMenu } = await import("./world_menu.js"));
});

describe("pending random encounter input lock", () => {
  it("blocks held movement, interaction, and menu input through a delayed pre-combat save", async () => {
    let finishAutosave;
    const scene = {
      animating: false,
      encounterPending: false,
      menuOpen: false,
      gameOver: false,
      currentNaturalSpawn: { node_id: "grove" },
      playerX: 2,
      playerY: 3,
      playerDir: "down",
      spawns: [{ node_id: "grove", x: 2, y: 3 }],
      gameState: {
        id: "game-1",
        phase: "world",
        current_location: { kind: "world", world_node_id: "grove" },
      },
      scene: { isActive: () => true },
      updateHUD: vi.fn(),
      updateInteractionTarget: vi.fn(),
      triggerAutosave: vi.fn(
        () =>
          new Promise((resolve) => {
            finishAutosave = resolve;
          }),
      ),
    };
    apiMocks.transitionLocation.mockResolvedValue({
      ...scene.gameState,
      world_checkpoint: { x: 2, y: 3, world_node_id: "grove" },
    });
    apiMocks.gameAction.mockResolvedValue({ ...scene.gameState });

    const encounter = WorldScene.prototype.triggerRandomEncounter.call(
      scene,
      "grass",
    );
    await vi.waitFor(() => expect(scene.triggerAutosave).toHaveBeenCalled());

    // Reproduce the arrival callback clearing the older animation-only lock.
    scene.animating = false;
    expect(WorldScene.prototype.tryMove.call(scene, 1, 0)).toBe(false);
    expect(WorldScene.prototype.handleAction.call(scene)).toBeUndefined();
    toggleMenu(scene);
    expect(scene.menuOpen).toBe(false);
    expect(apiMocks.gameAction).not.toHaveBeenCalled();

    finishAutosave();
    await encounter;
    expect(apiMocks.gameAction).toHaveBeenCalledTimes(1);
    expect(scene.encounterPending).toBe(false);
    expect(scene.animating).toBe(false);
  });
});

beforeEach(() => vi.clearAllMocks());

describe("rejected world step rollback", () => {
  it("restores an authorized natural prompt after both arrival attempts fail", async () => {
    apiMocks.transitionLocation.mockRejectedValue(new Error("route offline"));
    const natural = {
      kind: "natural",
      node_id: "grove",
      name: "Willow Grove",
      x: 2,
      y: 3,
    };
    const scene = {
      playerX: 2,
      playerY: 3,
      playerDir: "down",
      playerFallbackTexture: "player_down",
      player: { setPosition: vi.fn(), setTexture: vi.fn(), x: 0, y: 0 },
      spawns: [natural, { kind: "building", node_id: "ridge", x: 20, y: 20 }],
      gameState: {
        id: "game-1",
        current_location: { kind: "world", world_node_id: "grove" },
        natural_discoveries: [
          { node_id: "grove", discovery_id: "clue", prompt: "Inspect" },
        ],
      },
      scene: { isActive: () => true },
      add: {
        text(x, y, text, style) {
          return {
            x,
            y,
            text,
            style,
            setOrigin() {
              return this;
            },
            setDepth() {
              return this;
            },
            destroy() {},
          };
        },
      },
      updateHUD: vi.fn(),
      updateMinimap: vi.fn(),
      showMessage: vi.fn(),
      updateInteractionTarget() {
        return updateWorldInteractionTarget(this, this.playerX, this.playerY);
      },
    };

    scene.updateInteractionTarget();
    expect(scene.currentNaturalSpawn).toBe(natural);
    const origin = { x: scene.playerX, y: scene.playerY };

    scene.playerX = 20;
    scene.playerY = 19;
    scene.updateInteractionTarget();
    expect(scene.currentNaturalSpawn).toBeNull();

    const rejected = await syncWorldArrival(scene);
    expect(rejected).toEqual({ error: "route offline" });
    expect(apiMocks.transitionLocation).toHaveBeenCalledTimes(2);

    scene.worldStepDone = Promise.resolve(false);
    WorldScene.prototype.restoreRejectedWorldStep.call(
      scene,
      origin,
      rejected.error,
    );

    expect([scene.playerX, scene.playerY]).toEqual([2, 3]);
    expect(scene.currentNaturalSpawn).toBe(natural);
    expect(scene.currentDoorSpawn).toBeNull();
    expect(scene.interactPrompt.text).toBe("[ ENTER ] Inspect — Willow Grove");

    apiMocks.transitionLocation.mockResolvedValue({
      ...scene.gameState,
      world_checkpoint: { x: 2, y: 3, world_node_id: "grove" },
    });
    await expect(checkpointWorldPosition(scene)).resolves.toEqual({
      x: 2,
      y: 3,
    });
    expect(scene.currentNaturalSpawn).toBe(natural);
  });
});
