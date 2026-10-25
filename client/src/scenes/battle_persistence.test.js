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
  combatantConditionLabel: vi.fn(() => ""),
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
  it("advances once when rapid party choices finish before delayed callbacks", () => {
    const scene = new BattleScene();
    scene.gameState = {
      party: ["Hero", "Sparks", "Mercy", "Shade"].map((name) => ({ name })),
    };
    scene.closePicker = vi.fn();
    scene.promptText = {
      setText() {
        return this;
      },
      setColor() {
        return this;
      },
    };
    scene.memberActions = [];
    scene.currentMemberIdx = 0;
    scene.animating = false;
    const callbacks = [];
    scene.scaledDelay = (_, callback) => callbacks.push(callback);
    scene.showCurrentMemberTurn = vi.fn();
    for (let slot = 0; slot < 4; slot++)
      scene.recordAction(slot, { slot, type: "defend" });
    callbacks.forEach((callback) => callback());
    expect(scene.memberActions).toHaveLength(4);
    expect(scene.showCurrentMemberTurn).toHaveBeenCalledTimes(1);
  });

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

  it("continues Auto after restart before any manual buttons exist", () => {
    const scene = new BattleScene();
    scene.gameState = makeCombatState();
    scene.livingMembers = [0];
    scene.lastRoundActions = [{ slot: 0, type: "attack", target_id: 7 }];
    scene.autoMode = true;
    scene.actionBtns = null;
    scene.promptText = {
      setText() {
        return this;
      },
      setColor() {
        return this;
      },
    };
    const stopControl = { destroy: vi.fn() };
    scene.showAutoStopControl = () => scene.actionBtns.push(stopControl);
    scene.submitAllActions = vi.fn();

    scene.executeRepeat();

    expect(scene.autoMode).toBe(true);
    expect(scene.actionBtns).toEqual([stopControl]);
    expect(scene.memberActions).toEqual([
      { slot: 0, type: "attack", target_id: 7 },
    ]);
    expect(scene.submitAllActions).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "preserves the completed round and carries auto stop=%s through restart",
    async (stop) => {
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
      scene.autoMode = true;
      scene.animateCombatLog = vi.fn(async () => {
        if (stop) scene.stopAutoAfterRound();
      });
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
        autoMode: !stop,
        seenMajorCinematics: [],
      });
    },
  );
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

describe("rounded battle meter updates", () => {
  it("rebuilds fill and ghost geometry when HP changes", () => {
    const scene = new BattleScene();
    const makeBar = () => ({
      width: 100,
      height: 6,
      pathWidth: 100,
      setSize(width, height) {
        this.width = width;
        this.height = height;
        this.pathWidth = width;
      },
      setFillStyle: vi.fn(),
    });
    const fill = makeBar();
    const ghost = makeBar();
    const tweens = [];
    scene.tweens = { add: (config) => tweens.push(config) };
    scene.animateHPBar({ fill, ghost, width: 100, currentHP: 100 }, 10, 100);
    expect(fill.pathWidth).toBe(10);
    ghost.width = 55;
    tweens[0].onUpdate();
    expect(ghost.pathWidth).toBe(55);
    ghost.width = tweens[0].width;
    tweens[0].onUpdate();
    expect(ghost.pathWidth).toBe(10);
  });
});

describe("defeated victory XP presentation", () => {
  it.each([false, true])(
    "retains a static half-full XP meter (mobile: %s)",
    (mobile) => {
      const scene = new BattleScene();
      const shapes = [];
      const object = (fields = {}) => {
        const node = new Proxy(fields, {
          get(target, key) {
            if (key in target) return target[key];
            return () => node;
          },
        });
        return node;
      };
      scene.add = {
        graphics: () => object(),
        rectangle: (x, y, width, height, fill) => {
          const shape = object({ x, y, width, height, fill });
          shapes.push(shape);
          return shape;
        },
        text: () => object(),
      };
      scene.hudLayout = { mode: mobile ? "mobile" : "desktop" };
      scene.scale = { gameSize: { height: mobile ? 1600 : 600 } };
      scene.children = { removeAll: vi.fn() };
      scene.textures = { exists: () => false };
      scene.input = { keyboard: { on: vi.fn() } };
      scene.time = { delayedCall: vi.fn() };
      scene.tweens = { add: vi.fn() };
      scene.returnFromDungeonDefeat = () => false;
      scene.showVictoryResults({
        phase: "exploration",
        party: [{ name: "Hero", hp: 0, max_hp: 100, xp: 150, xp_next: 300 }],
        xp_before: [150],
        died_this_fight: [true],
      });
      const fill = shapes.find((shape) => shape.fill === 0x65717d);
      expect(fill).toBeDefined();
      expect(fill.width).toBe(mobile ? 110 : 90);
      expect(fill.x).toBe(mobile ? 430 : 395);
      expect(scene.tweens.add).not.toHaveBeenCalled();
    },
  );
});
