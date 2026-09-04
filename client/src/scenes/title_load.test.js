import { beforeAll, expect, it, vi } from "vitest";

vi.mock("../api.js", () => ({
  debugCreateShowcase: vi.fn(),
  login: vi.fn(),
  setToken: vi.fn(),
  newGame: vi.fn(),
  listSaves: vi.fn(async () => ({ saves: [] })),
  loadSave: vi.fn(),
}));
vi.mock("../systems/audio.js", () => ({
  initAudio: vi.fn(),
  playMusic: vi.fn(),
  playSFX: vi.fn(),
}));

let TitleScene;
beforeAll(async () => {
  globalThis.Phaser = { Scene: class {} };
  ({ TitleScene } = await import("./title.js"));
});

it("destroys native inputs and loading objects when changing title menus", async () => {
  const scene = new TitleScene();
  // DisplayList.removeAll(true) removes membership; it does not destroy objects.
  scene.children = {
    list: [],
    removeAll() {
      this.list = [];
    },
  };
  const makeObject = (type) => {
    const object = { type, setOrigin: vi.fn().mockReturnThis() };
    object.destroy = vi.fn(() => {
      scene.children.list = scene.children.list.filter(
        (entry) => entry !== object,
      );
    });
    scene.children.list.push(object);
    return object;
  };
  const input = makeObject("DOMElement");
  const title = makeObject("Text");
  const loadingObjects = [];
  scene.add = {
    text() {
      const object = makeObject("Text");
      loadingObjects.push(object);
      return object;
    },
  };
  scene.makeButton = vi.fn();

  await scene.showLoadScreen();

  expect(input.destroy).toHaveBeenCalledOnce();
  expect(title.destroy).toHaveBeenCalledOnce();
  expect(loadingObjects[0].destroy).toHaveBeenCalledOnce();
  expect(loadingObjects[1].destroy).toHaveBeenCalledOnce();
});
