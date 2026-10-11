import { showWorldMapDialog, worldMapModel } from "../ui/world_map_menu.js";
import { describe, expect, it, vi } from "vitest";
import { showWorldMap } from "./world_interact.js";
import { toggleMenu } from "./world_menu.js";
import { activeWorldLocks, pauseWorldFor } from "../systems/modalLock.js";

vi.mock("../ui/world_map_menu.js", async (importOriginal) => ({
  ...(await importOriginal()),
  showWorldMapDialog: vi.fn(),
}));

vi.mock("../ui/party_menu.js", () => ({
  renderPartyMenu: (scene, { actions }) => {
    scene.menuActions = actions;
    return { dispose: vi.fn(), handles: new Map() };
  },
}));

function makeScene(overrides = {}) {
  const objects = [];
  const keyboardHandlers = {};
  function addObject(kind, text) {
    const object = {
      kind,
      text,
      handlers: {},
      interactive: false,
      destroyed: false,
      on(event, callback) {
        this.handlers[event] = callback;
        return this;
      },
      setInteractive() {
        this.interactive = true;
        return this;
      },
      disableInteractive() {
        this.interactive = false;
        return this;
      },
      destroy() {
        this.destroyed = true;
      },
    };
    for (const method of [
      "setOrigin",
      "setScrollFactor",
      "setDepth",
      "setStrokeStyle",
      "setFillStyle",
      "setColor",
      "setAlpha",
      "fillStyle",
      "fillRect",
      "lineStyle",
      "fillRoundedRect",
      "strokeRoundedRect",
    ]) {
      object[method] = vi.fn().mockReturnValue(object);
    }
    objects.push(object);
    return object;
  }
  return {
    mapW: 2,
    mapH: 2,
    tileData: [
      [0, 1],
      [1, 0],
    ],
    spawns: [
      { kind: "building", name: "Home", x: 1, y: 1, node_id: "home" },
      {
        kind: "natural",
        name: "Willow Grove",
        x: 0,
        y: 0,
        node_id: "grove",
      },
    ],
    playerX: 0,
    playerY: 1,
    gameState: {
      party: [],
      current_quest: 0,
      quests: [{ target_node_id: "home" }],
    },
    objects,
    keyboardHandlers,
    add: {
      rectangle: vi.fn(() => addObject("rectangle")),
      graphics: vi.fn(() => addObject("graphics")),
      circle: vi.fn(() => addObject("circle")),
      text: vi.fn((_x, _y, text) => addObject("text", text)),
    },
    input: {
      keyboard: {
        once: vi.fn((event, callback) => {
          keyboardHandlers[event] = callback;
        }),
      },
    },
    events: { once: vi.fn(), off: vi.fn() },
    textures: { exists: () => false },
    scale: { gameSize: { width: 800, height: 600 }, setGameSize: vi.fn() },
    ...overrides,
  };
}

function worldMapButton(scene) {
  return scene.menuActions.find((action) => action.hotkey === "W");
}

describe("world map scene capability", () => {
  it("exposes adventure titles and entrance hosts and tracks the selected destination", () => {
    const scene = makeScene();
    scene.gameState.dungeon_entries = [
      { id: "shrine", title: "Forgotten Shrine", node_id: "grove" },
    ];
    scene.trackedDungeonID = "shrine";
    const model = worldMapModel(scene);
    expect(model.adventures[0]).toMatchObject({
      title: "Forgotten Shrine",
      number: 1,
      entrance: { name: "Willow Grove" },
    });
    expect(
      model.locations
        .filter((place) => place.target)
        .map((place) => place.node_id),
    ).toEqual(["grove"]);
  });

  it("uses the journal selection made in another scene", () => {
    const scene = makeScene();
    scene.gameState.dungeon_entries = [{ id: "shrine", node_id: "grove" }];
    scene.registry = {
      get: () => ({ gameID: scene.gameState.id, id: "dungeon:shrine" }),
    };
    expect(
      worldMapModel(scene)
        .locations.filter((place) => place.target)
        .map((place) => place.node_id),
    ).toEqual(["grove"]);
  });

  it.each([
    ["dungeon without world spawns", { spawns: undefined }],
    ["missing terrain", { tileData: undefined }],
    ["missing terrain row", { tileData: [[0, 1]] }],
    ["incomplete terrain row", { tileData: [[0, 1], [0]] }],
    ["invalid width", { mapW: 0 }],
    ["invalid height", { mapH: NaN }],
    ["missing player position", { playerX: undefined }],
  ])("does not lock or draw for %s", (_name, overrides) => {
    const scene = makeScene(overrides);
    pauseWorldFor(scene, "party_menu");

    expect(() => showWorldMap(scene)).not.toThrow();

    expect(activeWorldLocks(scene)).toEqual(["party_menu"]);
    expect(scene.objects).toEqual([]);
    expect(scene.input.keyboard.once).not.toHaveBeenCalled();
  });

  it("disables the Dungeon party menu map action without disturbing the menu", () => {
    const scene = makeScene({ spawns: undefined });
    toggleMenu(scene);
    const button = worldMapButton(scene);
    const objectCount = scene.objects.length;

    expect(button.enabled).toBe(false);

    expect(scene.menuOpen).toBe(true);
    expect(activeWorldLocks(scene)).toEqual(["party_menu"]);
    expect(scene.objects).toHaveLength(objectCount);
    expect(scene.objects.every((object) => !object.destroyed)).toBe(true);
  });

  it("opens the responsive map from the party menu", () => {
    const scene = makeScene();
    toggleMenu(scene);
    worldMapButton(scene).onClick();
    expect(scene.menuOpen).toBe(false);
    expect(showWorldMapDialog).toHaveBeenCalledWith(scene);
    const model = worldMapModel(scene);
    expect(model.locations.map((place) => place.name)).toEqual([
      "Home",
      "Willow Grove",
    ]);
    expect(model.locations.some((place) => place.target)).toBe(true);
    expect(model.locations.some((place) => place.natural)).toBe(true);
    expect(model.tiles).toEqual(scene.tileData);
  });

  it("does not reveal a hidden quest destination", () => {
    const scene = makeScene();
    scene.gameState.quests[scene.gameState.current_quest].hidden = true;
    expect(worldMapModel(scene).locations.some((place) => place.target)).toBe(
      false,
    );
  });

  it("keeps unrelated locks when opening a map", () => {
    const scene = makeScene();
    pauseWorldFor(scene, "another_overlay");
    showWorldMap(scene);
    expect(activeWorldLocks(scene)).toEqual(["another_overlay"]);
    expect(showWorldMapDialog).toHaveBeenCalledWith(scene);
  });
});
