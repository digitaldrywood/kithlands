import { describe, expect, it } from "vitest";

import {
  battleEffectMotion,
  battleEffectPresentation,
} from "./battle_effects.js";

describe("battle effect presentation", () => {
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
