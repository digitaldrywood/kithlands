import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ transitionLocation: vi.fn() }));

vi.mock("../api.js", async (importOriginal) => ({
  ...(await importOriginal()),
  transitionLocation: apiMocks.transitionLocation,
}));

let WorldScene;
let syncWorldArrival;
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
  ({ syncWorldArrival, updateWorldInteractionTarget } =
    await import("./world_interact.js"));
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

    WorldScene.prototype.restoreRejectedWorldStep.call(
      scene,
      origin,
      rejected.error,
    );

    expect([scene.playerX, scene.playerY]).toEqual([2, 3]);
    expect(scene.currentNaturalSpawn).toBe(natural);
    expect(scene.currentDoorSpawn).toBeNull();
    expect(scene.interactPrompt.text).toBe("[ ENTER ] Inspect");
  });
});
