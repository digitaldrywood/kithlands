import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./viewport_dialog.js", () => ({
  element: () => ({
    style: {},
    dataset: {},
    hidden: false,
    classList: { add: vi.fn(), toggle: vi.fn() },
    setAttribute: vi.fn(),
    append: vi.fn(),
    replaceChildren: vi.fn(),
    addEventListener: vi.fn(),
    remove: vi.fn(),
    getContext: () => ({ fillRect: vi.fn() }),
  }),
}));
vi.mock("../systems/input.js", () => ({ isTouchDevice: () => false }));
import { explorationHUD } from "./exploration_hud.js";

let scene;
let hud;
let disconnect;
beforeEach(() => {
  disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", { body: { append: vi.fn() } });
  scene = {
    events: new EventEmitter(),
    game: {
      canvas: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 800,
          height: 600,
        }),
      },
    },
    mapW: 1,
    mapH: 1,
    tileData: [[0]],
    spawns: [],
    playerX: 0,
    playerY: 0,
    gameState: { party: [] },
  };
  hud = explorationHUD(scene, {
    menu: vi.fn(),
    help: vi.fn(),
    mute: vi.fn(),
    isMuted: () => false,
    colors: {},
  });
  scene.explorationHUD = hud;
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["pause", "resume"],
  ["sleep", "wake"],
])(
  "hides immediately on %s and restores on %s without an update tick",
  (suspend, resume) => {
    expect(hud.root.hidden).toBe(false);
    scene.events.emit(suspend);
    expect(hud.root.hidden).toBe(true);
    scene.events.emit("update");
    expect(hud.root.hidden).toBe(true);
    scene.events.emit(resume);
    expect(hud.root.hidden).toBe(false);
  },
);
it("keeps resumed controls hidden behind a modal or game-over screen", () => {
  scene.events.emit("pause");
  scene._modalLocks = new Set(["party_menu"]);
  scene.events.emit("resume");
  expect(hud.root.hidden).toBe(true);
  scene._modalLocks.clear();
  scene.events.emit("update");
  expect(hud.root.hidden).toBe(false);
  scene.events.emit("sleep");
  scene.gameOver = true;
  scene.events.emit("wake");
  expect(hud.root.hidden).toBe(true);
});
it.each(["shutdown", "destroy"])(
  "removes the DOM and listeners on %s",
  (event) => {
    scene.events.emit(event);
    expect(hud.root.remove).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(scene.explorationHUD).toBeNull();
    for (const name of [
      "update",
      "pause",
      "sleep",
      "resume",
      "wake",
      "shutdown",
      "destroy",
    ])
      expect(scene.events.listenerCount(name)).toBe(0);
    expect(window.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
  },
);
