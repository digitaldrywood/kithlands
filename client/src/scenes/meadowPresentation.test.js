import { afterEach, expect, it, vi } from "vitest";
import { meadowGroundPlan } from "./meadowPresentation.js";

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
