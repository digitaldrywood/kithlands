import { afterEach, expect, it, vi } from "vitest";
import { meadowGroundPlan, updateMeadowDepth } from "./meadowPresentation.js";

afterEach(() => vi.unstubAllGlobals());

it("renders a cached ground variant identically regardless of map traversal order", () => {
  vi.stubGlobal("document", {
    createElement() {
      const marks = [];
      const ctx = {
        fillStyle: "",
        fillRect(...rect) {
          marks.push([this.fillStyle, ...rect]);
        },
      };
      return { marks, getContext: () => ctx };
    },
  });
  const makeScene = () => {
    const textures = new Map();
    return {
      canvases: textures,
      textures: {
        exists: (key) => textures.has(key),
        addCanvas: (key, canvas) => textures.set(key, canvas),
      },
    };
  };
  const forward = makeScene(),
    reverse = makeScene();
  const plan = { baseKey: "tile_grass", overlay: null };
  const a = meadowGroundPlan(forward, plan, 0, 0);
  const b = meadowGroundPlan(reverse, plan, 8, 0);
  expect(a.baseKey).toBe(b.baseKey);
  expect(forward.canvases.get(a.baseKey).marks).toEqual(
    reverse.canvases.get(b.baseKey).marks,
  );
});

it("reveals nearby gatherables through foreground foliage without fading distant trees or changing resources", () => {
  const node = { id: "wood", x: 5, y: 5, gathered: false };
  const tree = (x, y) => ({ x, y, meadowCanopy: true, setAlpha: vi.fn() });
  const covering = tree(180, 210),
    distant = tree(400, 210);
  const scene = {
    player: { x: 160, y: 175, setDepth: vi.fn() },
    cameras: {
      main: { worldView: { x: 0, y: 0, right: 800, bottom: 600 } },
    },
    gameState: { resources: [node] },
    meadowDetails: [covering, distant],
  };
  const before = JSON.stringify(node);
  updateMeadowDepth(scene);
  expect(covering.setAlpha).toHaveBeenLastCalledWith(0.3);
  expect(distant.setAlpha).toHaveBeenLastCalledWith(1);
  expect(JSON.stringify(node)).toBe(before);
  node.gathered = true;
  scene.player.x = 80;
  updateMeadowDepth(scene);
  expect(covering.setAlpha).toHaveBeenLastCalledWith(1);
});
