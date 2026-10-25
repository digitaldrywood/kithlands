import { expect, it, vi } from "vitest";
import {
  fireContactDetails,
  meleeContactDetails,
} from "./battle_contact_fx.js";
function fixture(reduced) {
  const created = [],
    tweens = [];
  const scene = {
    reducedBattleMotion: () => reduced,
    scaledMs: (ms) => ms,
    add: {
      graphics: () => {
        const object = { destroy: vi.fn() };
        for (const key of [
          "setDepth",
          "setPosition",
          "fillStyle",
          "fillPoints",
          "lineStyle",
          "lineBetween",
        ])
          object[key] = () => object;
        created.push(object);
        return object;
      },
    },
    tweens: { add: (config) => tweens.push(config) },
  };
  return { scene, created, tweens };
}
it("limits the fire burst and destroys every transient object", () => {
  const { scene, created, tweens } = fixture(false);
  fireContactDetails(scene, { x: 100, y: 200 }, { core: 1, accent: 2 });
  expect(created).toHaveLength(8);
  for (const tween of tweens) tween.onComplete();
  for (const object of created) expect(object.destroy).toHaveBeenCalledOnce();
});
it("reduced motion has no radial melee particles and only two stationary fire cinders", () => {
  const { scene, created, tweens } = fixture(true);
  meleeContactDetails(scene, 100, 200, { crit: true });
  expect(created).toHaveLength(1);
  fireContactDetails(scene, { x: 100, y: 200 }, { core: 1, accent: 2 });
  expect(created).toHaveLength(3);
  for (const tween of tweens.slice(1)) {
    expect(tween.x).toBe(100);
    expect(tween.y).toBe(200);
  }
});
