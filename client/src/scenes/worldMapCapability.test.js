import { describe, expect, it, vi } from "vitest";
import { showWorldMap } from "./world_interact.js";
import { toggleMenu } from "./world_menu.js";
import {
  activeWorldLocks,
  isWorldInputLocked,
  pauseWorldFor,
} from "../systems/modalLock.js";

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

  it("opens a supported World map from the party menu and closes with Escape", () => {
    const scene = makeScene();
    toggleMenu(scene);
    const button = worldMapButton(scene);
    const menuObjects = [...scene.objects];

    expect(button.enabled).toBe(true);
    button.onClick();

    expect(scene.menuOpen).toBe(false);
    expect(activeWorldLocks(scene)).toEqual(["world_map"]);
    expect(isWorldInputLocked(scene)).toBe(true);
    expect(menuObjects.every((object) => object.destroyed)).toBe(true);
    const mapObjects = scene.objects.slice(menuObjects.length);
    expect(mapObjects.some((object) => object.text === "Home")).toBe(true);
    expect(mapObjects.some((object) => object.text === "Willow Grove")).toBe(
      true,
    );
    expect(mapObjects.some((object) => object.text === "★")).toBe(true);
    const mapGraphics = mapObjects.find((object) => object.kind === "graphics");
    expect(mapGraphics.fillRect).toHaveBeenCalledTimes(6);
    expect(mapGraphics.fillStyle).toHaveBeenCalledWith(0x9fd27d, 1);

    scene.keyboardHandlers["keydown-ESC"]();

    expect(mapObjects.every((object) => object.destroyed)).toBe(true);
    expect(activeWorldLocks(scene)).toEqual([]);
    expect(isWorldInputLocked(scene)).toBe(false);
  });

  it("does not reveal a hidden quest target on the World map", () => {
    const scene = makeScene({
      gameState: {
        party: [],
        current_quest: 0,
        quests: [{ hidden: true, target_node_id: "home" }],
      },
    });

    showWorldMap(scene);

    expect(scene.objects.some((object) => object.text === "★")).toBe(false);
    expect(
      scene.objects.some((object) => object.text === "[ CLOSE (ESC) ]"),
    ).toBe(true);
  });

  it("closes a supported map by pointer without releasing another modal lock", () => {
    const scene = makeScene({ spawns: [] });
    pauseWorldFor(scene, "another_overlay");
    showWorldMap(scene);

    const close = scene.objects.find(
      (object) => object.text === "[ CLOSE (ESC) ]",
    );
    close.handlers.pointerdown();

    expect(scene.objects.every((object) => object.destroyed)).toBe(true);
    expect(activeWorldLocks(scene)).toEqual(["another_overlay"]);
  });
});
