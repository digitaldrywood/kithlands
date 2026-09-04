import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ gameAction: vi.fn() }));
vi.mock("../api.js", async (importOriginal) => ({
  ...(await importOriginal()),
  gameAction: api.gameAction,
}));
vi.mock("./debug_panel.js", () => ({
  toggleDebugPanel: vi.fn(),
  closeDebugPanel: vi.fn(),
}));
vi.mock("../sprites/battleCharacterSprite.js", () => ({
  createBattleCharacterSprite: vi.fn(),
}));
vi.mock("./item_menu.js", () => ({ showItemMenu: vi.fn() }));
vi.mock("./equipment_screen.js", () => ({
  closeEquipmentScreen: vi.fn(),
  showEquipmentScreen: vi.fn(),
}));
vi.mock("../ui/floating_text.js", () => ({
  FloatingTextPool: class {},
}));

let BattleScene;
beforeAll(async () => {
  vi.stubGlobal("Phaser", { Scene: class {} });
  ({ BattleScene } = await import("./battle.js"));
});
beforeEach(() => vi.clearAllMocks());

function combatState() {
  return {
    id: "mill-game",
    phase: "combat",
    current_location: { kind: "dungeon" },
    dungeon: { room_id: "mill-heart" },
    party: [{ name: "Hero", class_id: "warrior", hp: 1, max_hp: 30 }],
    enemies: [{ id: 100, name: "Warden", hp: 20, max_hp: 20 }],
  };
}

function recoveredState() {
  return {
    ...combatState(),
    phase: "world",
    dungeon: { room_id: "approach", recovered_from_defeat: true },
    party: [{ name: "Hero", class_id: "warrior", hp: 30, max_hp: 30 }],
    enemies: [],
    combat_log: ["Warden attacks Hero for 8 - DEFEATED!"],
    combat_actions: [
      {
        kind: "attack",
        actor_name: "Warden",
        actor_id: 100,
        target_name: "Hero",
        target_id: 0,
        damage: 8,
        killed: true,
      },
    ],
    message: "The keeper brings your party back to the trail.",
  };
}

function makeScene() {
  const scene = new BattleScene();
  scene.gameState = combatState();
  scene.returnScene = { sceneKey: "Dungeon" };
  scene.memberActions = [{ slot: 0, type: "defend" }];
  scene.autoMode = true;
  scene.animating = false;
  scene.scene = { start: vi.fn(), restart: vi.fn() };
  scene.promptText = {
    setText: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
  };
  scene.hideAllCursors = vi.fn();
  scene.animateCombatLog = vi.fn().mockResolvedValue(undefined);
  scene.reconcileEnemySprites = vi.fn().mockResolvedValue(undefined);
  scene.playPartyVictoryBeat = vi.fn().mockResolvedValue(undefined);
  scene.recoverFromCombatError = vi.fn().mockResolvedValue(undefined);
  scene.scaledDelay = vi.fn();
  scene.time = { delayedCall: vi.fn() };
  return scene;
}

describe("dungeon defeat presentation", () => {
  for (const method of ["submitAllActions", "submitWaitAction"]) {
    it(`${method} finishes the knockout animation and returns without presenting a victory`, async () => {
      const scene = makeScene();
      const recovered = recoveredState();
      api.gameAction.mockResolvedValue(recovered);
      scene.showVictoryResults = vi.fn();
      let finishAnimation;
      scene.animateCombatLog.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishAnimation = resolve;
          }),
      );

      const pending = scene[method]();
      await vi.waitFor(() =>
        expect(scene.animateCombatLog).toHaveBeenCalledWith(
          recovered.combat_log,
          recovered.combat_actions,
        ),
      );
      expect(scene.scene.start).not.toHaveBeenCalled();
      expect(scene.animating).toBe(true);
      finishAnimation();
      await pending;

      expect(scene.gameState).toBe(recovered);
      expect(scene.autoMode).toBe(false);
      expect(scene.animating).toBe(false);
      expect(scene.scene.start).toHaveBeenCalledExactlyOnceWith("Dungeon", {
        gameState: recovered,
      });
      // An empty enemy array on recovery means the party left the encounter;
      // it must not trigger the enemy death effects used for a victory.
      expect(scene.reconcileEnemySprites).not.toHaveBeenCalled();
      expect(scene.playPartyVictoryBeat).not.toHaveBeenCalled();
      expect(scene.showVictoryResults).not.toHaveBeenCalled();
      expect(scene.scaledDelay).not.toHaveBeenCalled();
      expect(scene.time.delayedCall).not.toHaveBeenCalled();
      expect(scene.recoverFromCombatError).not.toHaveBeenCalled();
    });
  }

  it("redirects a recovered state passed directly to results before touching the result UI", () => {
    const scene = makeScene();
    const recovered = recoveredState();
    // This also covers create() forwarding a noncombat state with a combat
    // log. No canvas/result objects exist yet in that entry path.
    scene.showVictoryResults(recovered);
    expect(scene.scene.start).toHaveBeenCalledExactlyOnceWith("Dungeon", {
      gameState: recovered,
    });
    expect(scene.gameState).toBe(recovered);
    expect(scene.autoMode).toBe(false);
  });

  it("still reconciles enemies and presents results for an ordinary dungeon victory", async () => {
    const scene = makeScene();
    const victory = {
      ...combatState(),
      phase: "quest_complete",
      enemies: [],
      combat_log: ["Victory! +8 XP, +4 gold"],
      combat_actions: [{ kind: "info" }],
    };
    api.gameAction.mockResolvedValue(victory);
    scene.showVictoryResults = vi.fn();

    await scene.submitAllActions();

    expect(scene.reconcileEnemySprites).toHaveBeenCalledExactlyOnceWith([]);
    expect(scene.playPartyVictoryBeat).toHaveBeenCalledOnce();
    expect(scene.scene.start).not.toHaveBeenCalled();
    expect(scene.showVictoryResults).not.toHaveBeenCalled();
    expect(scene.scaledDelay).toHaveBeenCalledOnce();
    scene.scaledDelay.mock.calls[0][1]();
    expect(scene.showVictoryResults).toHaveBeenCalledExactlyOnceWith(victory);
    expect(scene.recoverFromCombatError).not.toHaveBeenCalled();
  });
});

describe("final encounter defeat presentation", () => {
  it("returns to preparation after the knockout animation without a false victory", async () => {
    const scene = makeScene();
    scene.gameState = {
      ...combatState(),
      current_location: { kind: "world" },
      dungeon: null,
      final_encounter: { active: true },
    };
    scene.returnScene = null;
    const recovered = {
      ...recoveredState(),
      current_location: { kind: "world" },
      dungeon: null,
      final_encounter: { active: false, recovery: "defeat" },
    };
    api.gameAction.mockResolvedValue(recovered);
    scene.showVictoryResults = vi.fn();
    await scene.submitAllActions();
    expect(scene.scene.start).toHaveBeenCalledExactlyOnceWith("World", {
      gameState: recovered,
    });
    expect(scene.reconcileEnemySprites).not.toHaveBeenCalled();
    expect(scene.playPartyVictoryBeat).not.toHaveBeenCalled();
    expect(scene.showVictoryResults).not.toHaveBeenCalled();
  });
});
