import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ dungeonAction: vi.fn(), saveGame: vi.fn() }));
vi.mock("../api.js", () => api);
vi.mock("./world.js", () => ({ getLeaderIndex: () => 0 }));
vi.mock("./world_menu.js", () => ({ toggleMenu: vi.fn() }));
vi.mock("../systems/audio.js", () => ({
  initAudio: vi.fn(),
  playMusic: vi.fn(),
  playSFX: vi.fn(),
}));

let DungeonScene;
beforeAll(async () => {
  vi.stubGlobal("Phaser", { Scene: class {} });
  ({ DungeonScene } = await import("./dungeon.js"));
});
beforeEach(() => vi.clearAllMocks());

function state() {
  return {
    id: "game",
    phase: "exploration",
    current_location: { kind: "dungeon" },
    dungeon: {
      room_id: "entry",
      position: { x: 0, y: 0 },
      actions: [{ id: "door", x: 1, y: 0, available: true }],
    },
  };
}

function scene() {
  const scene = new DungeonScene();
  scene.init({ gameState: state() });
  scene.scene = { isActive: () => true, restart: vi.fn(), start: vi.fn() };
  scene.hideMessage = vi.fn();
  scene.showMessage = vi.fn();
  scene.updateHUD = vi.fn();
  scene.player = { setFrame: vi.fn() };
  scene.shadow = { setPosition: vi.fn() };
  scene.tweens = { add: vi.fn() };
  scene.time = { delayedCall: vi.fn(() => ({ remove: vi.fn() })) };
  scene.tileData = [[0, 0, 1]];
  scene.layout = { tile: 32 };
  scene.playerX = 0;
  scene.playerY = 0;
  return scene;
}

describe("DungeonScene authoritative responses", () => {
  it("waits for Go before changing position and serializes movement", async () => {
    const current = scene();
    let resolve;
    api.dungeonAction.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = current.tryMove(1, 0);
    expect(current.playerX).toBe(0);
    current.tryMove(1, 0);
    expect(api.dungeonAction).toHaveBeenCalledTimes(1);
    const result = state();
    result.dungeon.position.x = 1;
    resolve(result);
    await pending;
    expect(current.gameState).toBe(result);
    expect(current.playerX).toBe(1);
    expect(current.animating).toBe(true);
    current.tweens.add.mock.calls[0][0].onComplete();
    expect(current.animating).toBe(false);
  });

  it("clears auto-travel and preserves position when Go rejects a step", async () => {
    const current = scene();
    current.path = [{ x: 1, y: 0 }];
    current.pendingAction = { id: "door" };
    api.dungeonAction.mockResolvedValue({ error: "The bridge is closed." });
    await current.tryMove(1, 0);
    expect(current.playerX).toBe(0);
    expect(current.path).toEqual([]);
    expect(current.pendingAction).toBeNull();
    expect(current.showMessage).toHaveBeenCalledWith("The bridge is closed.");
    expect(current.animating).toBe(false);
  });

  it("cannot send diagonal movement or move into visible collision", () => {
    const current = scene();
    current.tryMove(1, 1);
    current.playerX = 1;
    current.tryMove(1, 0);
    expect(api.dungeonAction).not.toHaveBeenCalled();
  });

  it("uses fresh action availability after walking to a landmark", async () => {
    const current = scene();
    api.dungeonAction.mockResolvedValue({ error: "test" });
    await current.selectAction({ id: "door", available: false, x: 1, y: 0 });
    expect(api.dungeonAction).toHaveBeenCalledWith("game", {
      type: "interact",
      action_id: "door",
    });
  });

  it("renders server rejection feedback without sending unavailable interactions", () => {
    const current = scene();
    current.gameState.dungeon.actions[0].available = false;
    current.gameState.dungeon.actions[0].reason =
      "Restore the waterwheel first.";
    current.selectAction({ id: "door" });
    expect(api.dungeonAction).not.toHaveBeenCalled();
    expect(current.showMessage).toHaveBeenCalledWith(
      "Restore the waterwheel first.",
    );
  });

  it("does not repeat a prerequisite warning for an already completed landmark", () => {
    const current = scene();
    Object.assign(current.gameState.dungeon.actions[0], {
      available: false,
      completed: true,
      reason: "The bramblehog is still guarding the supply box.",
    });
    current.selectAction({ id: "door" });
    expect(api.dungeonAction).not.toHaveBeenCalled();
    expect(current.showMessage).toHaveBeenCalledWith("Already explored.");
  });

  it("rebuilds a new room from Go and returns combat to the dungeon", async () => {
    const current = scene();
    const next = state();
    next.dungeon.room_id = "wheel";
    api.dungeonAction.mockResolvedValue(next);
    await current.sendAction({ type: "interact", action_id: "door" });
    expect(current.scene.restart).toHaveBeenCalledWith(
      expect.objectContaining({ gameState: next }),
    );
    current.animating = false;
    const combat = { ...next, phase: "combat" };
    api.dungeonAction.mockResolvedValue(combat);
    await current.sendAction({ type: "interact", action_id: "guardian" });
    expect(current.scene.start).toHaveBeenCalledWith("Battle", {
      gameState: combat,
      returnScene: { sceneKey: "Dungeon" },
    });
  });

  it("uses the server's retreat destination", async () => {
    const current = scene();
    const result = {
      ...state(),
      current_location: { kind: "settlement" },
      dungeon: null,
    };
    api.dungeonAction.mockResolvedValue(result);
    await current.sendAction({ type: "retreat" });
    expect(current.scene.start).toHaveBeenCalledWith("Settlement", {
      gameState: result,
    });
  });
});
