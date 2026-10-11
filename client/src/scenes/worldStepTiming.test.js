import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ transitionLocation: vi.fn() }));
vi.mock("../api.js", async (original) => ({ ...(await original()), ...api }));
let WorldScene;
beforeAll(async () => {
  vi.stubGlobal("Phaser", { Scene: class {}, Math: { Between: () => 100 } });
  ({ WorldScene } = await import("./world.js"));
});
beforeEach(() => vi.clearAllMocks());
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
    player: { x: 48, y: 64, setTexture: vi.fn() },
    scene: { isActive: () => true },
    time: { delayedCall: () => ({ remove() {} }) },
    tweens: { add: vi.fn() },
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
    api.transitionLocation.mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    expect(WorldScene.prototype.tryMove.call(scene, 1, 0)).toBe(true);
    const done = scene.worldStepDone;
    await vi.waitFor(() =>
      expect(api.transitionLocation).toHaveBeenCalledOnce(),
    );
    expect(WorldScene.prototype.tryMove.call(scene, 1, 0)).toBe(false);
    scene.tweens.add.mock.calls[0][0].onComplete();
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
      api.transitionLocation.mockResolvedValue(result);
      WorldScene.prototype.tryMove.call(scene, 1, 0);
      const done = scene.worldStepDone;
      await vi.waitFor(() => expect(api.transitionLocation).toHaveBeenCalled());
      await scene.worldArrivalPromise;
      expect(scene.animating).toBe(true);
      expect(scene.restoreRejectedWorldStep).not.toHaveBeenCalled();
      expect(scene.triggerRandomEncounter).not.toHaveBeenCalled();
      scene.tweens.add.mock.calls[0][0].onComplete();
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
