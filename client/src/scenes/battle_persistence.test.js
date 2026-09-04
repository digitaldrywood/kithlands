import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPrefs } from "../systems/prefs.js";

const apiMocks = vi.hoisted(() => ({
  claimChest: vi.fn(),
  gameAction: vi.fn(),
  getGame: vi.fn(),
  loadSave: vi.fn(),
  listSaves: vi.fn(),
  login: vi.fn(),
  newGame: vi.fn(),
  saveGame: vi.fn(),
  autosaveGame: vi.fn(),
  debugCreateShowcase: vi.fn(),
  equipItem: vi.fn(),
  promoteParty: vi.fn(),
  setToken: vi.fn(),
}));

vi.mock("../api.js", () => ({
  claimChest: apiMocks.claimChest,
  gameAction: apiMocks.gameAction,
  getGame: apiMocks.getGame,
  loadSave: apiMocks.loadSave,
  listSaves: apiMocks.listSaves,
  login: apiMocks.login,
  newGame: apiMocks.newGame,
  saveGame: apiMocks.saveGame,
  autosaveGame: apiMocks.autosaveGame,
  debugCreateShowcase: apiMocks.debugCreateShowcase,
  equipItem: apiMocks.equipItem,
  promoteParty: apiMocks.promoteParty,
  setToken: apiMocks.setToken,
}));

vi.mock("../systems/audio.js", () => ({
  initAudio: vi.fn(),
  playMusic: vi.fn(),
  playSFX: vi.fn(),
  stopMusic: vi.fn(),
}));

vi.mock("../sprites/composedSprite.js", () => ({
  createComposedSprite: vi.fn(() => ({
    setInteractive() {
      return this;
    },
    on() {
      return this;
    },
  })),
}));

vi.mock("../systems/battleTargeting.js", () => ({
  shouldAcceptEnemySpriteClick: vi.fn(() => true),
}));

vi.mock("./item_menu.js", () => ({
  showItemMenu: vi.fn(),
}));

vi.mock("../systems/hpBar.js", () => ({
  applyDamage: vi.fn(),
  applyHeal: vi.fn(),
  formatHPLabel: vi.fn(() => ""),
  hpBarColorPct: vi.fn(() => 1),
  hpBarFillWidth: vi.fn(() => 10),
}));

vi.mock("../ui/floating_text.js", () => ({
  FloatingTextPool: class {
    destroy() {}
  },
}));

vi.mock("../data/monsterSprites.js", () => ({
  monsterSpriteKey: () => undefined,
}));

vi.mock("./debug_panel.js", () => ({
  toggleDebugPanel: vi.fn(),
  closeDebugPanel: vi.fn(),
}));

function stubLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

function makeParty() {
  return [
    {
      name: "Bruno",
      class_id: "warrior",
      hp: 90,
      max_hp: 100,
      mp: 0,
      max_mp: 0,
    },
    { name: "Nia", class_id: "cinder", hp: 70, max_hp: 70, mp: 12, max_mp: 12 },
  ];
}

function makeCombatState(overrides = {}) {
  return {
    id: "game-1",
    phase: "combat",
    party: makeParty(),
    enemies: [{ id: 7, name: "Slime", hp: 12, max_hp: 12 }],
    combat_log: [],
    combat_actions: [],
    ...overrides,
  };
}

let BattleScene;
let TitleScene;

beforeAll(async () => {
  globalThis.Phaser = {
    Scene: class {
      constructor() {
        this.scene = {
          start: vi.fn(),
          restart: vi.fn(),
        };
        this.time = {
          delayedCall: (_ms, fn) => fn(),
        };
      }
    },
  };

  ({ BattleScene } = await import("./battle.js"));
  ({ TitleScene } = await import("./title.js"));
});

beforeEach(() => {
  stubLocalStorage();
  clearPrefs();
  vi.clearAllMocks();
});

describe("BattleScene repeat memory", () => {
  it("loads the saved round from authoritative game state", () => {
    const actions = [{ slot: 0, type: "attack", target_id: 7 }];
    const scene = new BattleScene();
    scene.init({
      gameState: makeCombatState({ last_round_actions: actions }),
    });

    expect(scene._lastRoundActions).toEqual(actions);
  });

  it("prefers server round memory over stale localStorage state", () => {
    const serverActions = [{ slot: 0, type: "attack", target_id: 7 }];
    globalThis.localStorage.setItem(
      "kithlands_prefs",
      JSON.stringify({
        battle_plan_memory: {
          "Bruno:warrior,Nia:cinder": [
            { slot: 0, type: "attack", target_id: 99 },
          ],
        },
      }),
    );

    const scene = new BattleScene();
    scene.init({
      gameState: makeCombatState({ last_round_actions: serverActions }),
    });

    expect(scene._lastRoundActions).toEqual(serverActions);
  });

  it("persists the authoritative round after combat submission and carries it into restart", async () => {
    const scene = new BattleScene();
    scene.gameState = makeCombatState();
    scene.memberActions = [{ slot: 0, type: "attack", target_id: 7 }];
    scene.promptText = {
      setText() {
        return this;
      },
      setColor() {
        return this;
      },
    };
    scene.animateCombatLog = vi.fn().mockResolvedValue(undefined);
    scene.reconcileEnemySprites = vi.fn().mockResolvedValue(undefined);
    scene.scaledDelay = (_ms, fn) => fn();
    scene.showVictoryResults = vi.fn();

    const result = makeCombatState({
      enemies: [{ id: 9, name: "Wolf", hp: 20, max_hp: 20 }],
      combat_log: ["Bruno attacks!"],
      combat_actions: [{ type: "attack", actor_slot: 0, target_id: 7 }],
      last_round_actions: [{ slot: 0, type: "attack", target_id: 9 }],
    });
    apiMocks.gameAction.mockResolvedValue(result);

    await scene.submitAllActions();

    expect(apiMocks.gameAction).toHaveBeenCalledWith("game-1", {
      type: "combat_round",
      actions: [{ slot: 0, type: "attack", target_id: 7 }],
    });
    expect(scene.scene.restart).toHaveBeenCalledWith({
      gameState: result,
      lastRoundActions: [{ slot: 0, type: "attack", target_id: 9 }],
      autoMode: undefined,
      seenMajorCinematics: [],
    });
  });
});

describe("BattleScene dead actor guard", () => {
  it("skips animating an action from an enemy already marked dead", async () => {
    const scene = new BattleScene();
    scene.gameState = makeCombatState({
      party: [
        {
          name: "Bruno",
          class_id: "warrior",
          hp: 30,
          max_hp: 30,
          mp: 0,
          max_mp: 0,
        },
      ],
    });
    scene.enemySprites = {
      7: {
        id: 7,
        name: "Slime",
        dead: true,
        dying: false,
        x: 120,
        y: 140,
        sprite: {
          setTint: vi.fn(),
          clearTint: vi.fn(),
        },
        hpBar: {
          currentHP: 0,
          maxHP: 12,
        },
      },
    };
    scene.partySprites = {
      Bruno: {
        name: "Bruno",
        x: 240,
        y: 280,
        arrow: {
          setVisible: vi.fn(),
        },
        hpBar: {
          currentHP: 30,
          maxHP: 30,
        },
      },
    };
    scene.enemyNumbers = [];
    scene.revealLine = vi.fn();
    scene.showActionTitle = vi.fn().mockResolvedValue(undefined);
    scene.lungePartySprite = vi.fn().mockResolvedValue(undefined);
    scene.wait = vi.fn().mockResolvedValue(undefined);
    scene.hitFx = vi.fn().mockResolvedValue(undefined);
    scene.resetPartySprite = vi.fn().mockResolvedValue(undefined);
    scene.animateHPBar = vi.fn();
    scene.playPartyHitReaction = vi.fn();
    scene.showActionFocus = vi.fn();

    await scene.animateCombatLog(
      ["Slime attacks Bruno[0] for 4 damage"],
      [
        {
          kind: "attack",
          actor_id: 7,
          actor_name: "Slime",
          target_id: 0,
          target_name: "Bruno",
          damage: 4,
          damage_type: "physical",
        },
      ],
    );

    expect(scene.revealLine).not.toHaveBeenCalled();
    expect(scene.hitFx).not.toHaveBeenCalled();
    expect(scene.animateHPBar).not.toHaveBeenCalled();
    expect(scene.playPartyHitReaction).not.toHaveBeenCalled();
  });
});

describe("save-load persistence", () => {
  it("keeps authoritative last_round_actions when loading a save", async () => {
    const loadedGame = {
      id: "loaded-1",
      phase: "world",
      party: makeParty(),
      last_round_actions: [{ slot: 0, type: "attack", target_id: 7 }],
    };
    apiMocks.loadSave.mockResolvedValue(loadedGame);

    const scene = new TitleScene();
    await scene.loadGameSave("save-42");

    expect(apiMocks.loadSave).toHaveBeenCalledWith("save-42");
    expect(scene.scene.start).toHaveBeenCalledWith("World", {
      gameState: loadedGame,
    });
  });

  it("starts the disposable authoritative systems showcase", async () => {
    const showcase = {
      id: "showcase-1",
      phase: "combat",
      showcase_mode: true,
      party: makeParty(),
      enemies: [{ id: 8, name: "Iron Golem", hp: 220, max_hp: 220 }],
    };
    apiMocks.login.mockResolvedValue({ token: "showcase-token" });
    apiMocks.debugCreateShowcase.mockResolvedValue(showcase);

    const scene = new TitleScene();
    scene.statusText = {
      setText: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
    };
    await scene.startShowcase();

    expect(apiMocks.setToken).toHaveBeenCalledWith("showcase-token");
    expect(apiMocks.debugCreateShowcase).toHaveBeenCalledOnce();
    expect(scene.scene.start).toHaveBeenCalledWith("World", {
      gameState: showcase,
    });
  });
});
