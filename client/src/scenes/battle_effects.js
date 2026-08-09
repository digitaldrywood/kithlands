const INTENSITY_TIERS = Object.freeze({
  1: Object.freeze({ scale: 0.82, particleCount: 4, strokeWidth: 2 }),
  2: Object.freeze({ scale: 1, particleCount: 6, strokeWidth: 3 }),
  3: Object.freeze({ scale: 1.18, particleCount: 8, strokeWidth: 4 }),
});

const EFFECT_FAMILIES = Object.freeze({
  restorative_light: Object.freeze({
    motion: "field",
    core: 0xb9ffe8,
    glow: 0xe8c86d,
    accent: 0xffffff,
    soundHook: "sfx_heal",
  }),
  fire: Object.freeze({
    motion: "projectile",
    core: 0xff7438,
    glow: 0xa51f12,
    accent: 0xffdc78,
    soundHook: "sfx_fire",
  }),
});

export function battleEffectPresentation(action = {}) {
  const metadata = action.presentation;
  const effectFamily = String(metadata?.effect_family || "");
  const family = EFFECT_FAMILIES[effectFamily];
  if (!family) return null;
  const intensityTier = Number(metadata?.intensity_tier) || 1;
  const tier = INTENSITY_TIERS[intensityTier] || INTENSITY_TIERS[1];
  return { effectFamily, intensityTier, ...family, ...tier };
}

export function battleEffectMotion(presentation, reducedMotion = false) {
  if (!presentation) return null;
  return {
    particleCount: reducedMotion
      ? Math.min(2, presentation.particleCount)
      : presentation.particleCount,
    travelScale: reducedMotion ? 0 : presentation.scale,
    pulseScale: reducedMotion ? 1 : presentation.scale,
  };
}
