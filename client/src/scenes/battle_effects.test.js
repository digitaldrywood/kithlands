import { describe, expect, it } from "vitest";

import {
  battleEffectMotion,
  battleEffectPresentation,
  playBattleEffectToTarget,
} from "./battle_effects.js";

describe("battle effect presentation", () => {
  it.each(["fire", "restorative_light"])(
    "%s applies the result on arrival while the impact fades",
    async (effect_family) => {
      const tweens = [];
      const shape = () =>
        new Proxy(
          {},
          {
            get: (target, key) => (key in target ? target[key] : () => object),
            set: (target, key, value) => {
              target[key] = value;
              return true;
            },
          },
        );
      let object;
      const make = () => {
        object = shape();
        return object;
      };
      const scene = {
        reducedBattleMotion: () => false,
        scaledMs: (ms) => ms,
        add: { graphics: make, container: make },
        tweens: { add: (config) => tweens.push(config) },
      };
      const presentation = battleEffectPresentation({
        presentation: { effect_family, intensity_tier: 1 },
      });
      let arrived = false;
      const effect = playBattleEffectToTarget(
        scene,
        { x: 500, y: 200, width: 60, height: 80 },
        { x: 150, y: 230, feetY: 280, width: 60, height: 80 },
        presentation,
      ).then(() => {
        arrived = true;
      });
      expect(arrived).toBe(false);
      tweens[0].onComplete();
      await effect;
      expect(arrived).toBe(true);
      expect(tweens.length).toBe(effect_family === "fire" ? 10 : 2);
      // The fading impact's completion has not run yet.
    },
  );
  it("selects visual language from shared metadata, never the spell name", () => {
    const presentation = battleEffectPresentation({
      spell_name: "Fireball",
      presentation: {
        effect_family: "restorative_light",
        intensity_tier: 2,
      },
    });

    expect(presentation).toMatchObject({
      effectFamily: "restorative_light",
      intensityTier: 2,
      motion: "field",
    });
    expect(battleEffectPresentation({ spell_name: "Cure" })).toBeNull();
  });

  it("keeps reduced motion legible with fewer particles and no travel", () => {
    const presentation = battleEffectPresentation({
      presentation: { effect_family: "fire", intensity_tier: 3 },
    });

    expect(battleEffectMotion(presentation, true)).toMatchObject({
      particleCount: 2,
      travelScale: 0,
      pulseScale: 1,
    });
  });
});
