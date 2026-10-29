import { EventEmitter } from "node:events";
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

describe("overland landmark ground", () => {
  it("allows crossing old building footprints while visible terrain stays blocked", () => {
    const scene = { gameState: { transport: { current_tier: "T1" } } };
    expect(WorldScene.prototype.canWalkTile.call(scene, 4)).toBe(true);
    for (const tile of [2, 3, 7, 8, 10, 14, 15, 17]) {
      expect(
        WorldScene.prototype.canWalkTile.call(scene, tile),
        `tile ${tile}`,
      ).toBe(false);
    }
  });
});

describe("tracked adventure campaign lifetime", () => {
  it("keeps a destination across scene returns but clears it for another game", () => {
    const scene = {
      gameState: { id: "campaign-a" },
      trackedDungeonID: "forgotten-shrine",
    };
    WorldScene.prototype.init.call(scene, { gameState: { id: "campaign-a" } });
    expect(scene.trackedDungeonID).toBe("forgotten-shrine");
    WorldScene.prototype.init.call(scene, { gameState: { id: "campaign-b" } });
    expect(scene.trackedDungeonID).toBeNull();
  });
});

function fixture() {
  return {
    playerX: 1,
    playerY: 1,
    playerDir: "right",
    mapW: 4,
    mapH: 4,
    tileData: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
    spawns: [],
    gameState: {
      id: "timing-game",
      phase: "world",
      current_location: { kind: "world", world_node_id: "grove" },
    },
    player: {
      x: 48,
      y: 64,
      setTexture: vi.fn(),
      setPosition(x, y) {
        this.x = x;
        this.y = y;
      },
    },
    scene: { isActive: () => true },
    time: { delayedCall: () => ({ remove() {} }) },
    tweens: { add: vi.fn(), timeScale: 1 },
    events: new EventEmitter(),
    canWalkTile: () => true,
    updateHUD: vi.fn(),
    updateMinimap: vi.fn(),
    updateInteractionTarget: vi.fn(),
    restoreRejectedWorldStep: vi.fn(),
    triggerRandomEncounter: vi.fn(),
  };
}
describe("world step animation and authority", () => {
  it("starts the request during movement but keeps the next step locked until both finish", async () => {
    const scene = fixture();
    let acknowledge;
    apiMocks.transitionLocation.mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    expect(WorldScene.prototype.tryMove.call(scene, 1, 0)).toBe(true);
    const done = scene.worldStepDone;
    await vi.waitFor(() =>
      expect(apiMocks.transitionLocation).toHaveBeenCalledOnce(),
    );
    expect(WorldScene.prototype.tryMove.call(scene, 1, 0)).toBe(false);
    vi.spyOn(performance, "now").mockReturnValue(performance.now() + 1000);
    scene.events.emit("update");
    vi.restoreAllMocks();
    expect(scene.animating).toBe(true);
    acknowledge({ ...scene.gameState });
    await expect(done).resolves.toBe(true);
    expect(scene.animating).toBe(false);
  });
  it.each(["encounter", "rejection"])(
    "defers early %s handling until the character arrives",
    async (mode) => {
      const scene = fixture();
      const result =
        mode === "encounter"
          ? { ...scene.gameState, phase: "combat", enemies: [{ id: 100 }] }
          : { error: "blocked" };
      apiMocks.transitionLocation.mockResolvedValue(result);
      WorldScene.prototype.tryMove.call(scene, 1, 0);
      const done = scene.worldStepDone;
      await vi.waitFor(() =>
        expect(apiMocks.transitionLocation).toHaveBeenCalled(),
      );
      await scene.worldArrivalPromise;
      expect(scene.animating).toBe(true);
      expect(scene.restoreRejectedWorldStep).not.toHaveBeenCalled();
      expect(scene.triggerRandomEncounter).not.toHaveBeenCalled();
      vi.spyOn(performance, "now").mockReturnValue(performance.now() + 1000);
      scene.events.emit("update");
      vi.restoreAllMocks();
      await expect(done).resolves.toBe(mode === "encounter");
      if (mode === "encounter")
        expect(scene.triggerRandomEncounter).toHaveBeenCalledWith(0, result);
      else
        expect(scene.restoreRejectedWorldStep).toHaveBeenCalledWith(
          { x: 1, y: 1 },
          "blocked",
        );
    },
  );
});
