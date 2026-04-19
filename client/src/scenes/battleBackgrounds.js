// Manifest + lookup helpers for pre-rendered battle backgrounds generated
// by scripts/generate_battle_backgrounds.py. Shared between boot.js (preload)
// and battle.js (pickBackgroundKey) and the sprite debugger.

export const BG_VARIANTS = Object.freeze({
  plains: 3,
  forest: 4,
  dunes: 3,
  mountains: 3,
  snow: 3,
  marsh: 3,
  shore: 3,
  interior: 4,
});

// Town battles want a specific interior variant per building_type. Variant
// numbering matches the MOTIF_PROMPTS order in
// scripts/generate_battle_backgrounds.py (1=temple, 2=inn, 3=shop, 4=house).
export const INTERIOR_VARIANT_BY_BUILDING = Object.freeze({
  temple: 1,
  inn: 2,
  shop: 3,
  house: 4,
});

export function backgroundKey(motif, variant) {
  return `bg_${motif}_${variant}`;
}

export function backgroundPath(motif, variant) {
  return `backgrounds/${motif}/${motif}_${variant}.png`;
}

// Stable integer hash from a string — small FNV-1a. Only used for picking a
// variant deterministically; collisions are fine.
function hashSeed(input) {
  const s = String(input ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// pickBackgroundKey returns a Phaser texture key like "bg_forest_2" for the
// given motif. For interior battles the building_type determines the variant
// so temple/inn/shop/house each get their dedicated painting. For every other
// motif the variant is picked deterministically from the seed so replaying
// the same encounter yields the same art.
export function pickBackgroundKey(motif, seed, buildingType) {
  if (motif === "interior") {
    const idx = INTERIOR_VARIANT_BY_BUILDING[buildingType] ?? 1;
    return backgroundKey("interior", idx);
  }
  const count = BG_VARIANTS[motif];
  if (!count) return null;
  const n = Number.isFinite(seed) ? seed >>> 0 : hashSeed(seed);
  const idx = (n % count) + 1;
  return backgroundKey(motif, idx);
}

export function enumerateBackgrounds() {
  const out = [];
  for (const [motif, count] of Object.entries(BG_VARIANTS)) {
    for (let i = 1; i <= count; i += 1) {
      out.push({
        motif,
        variant: i,
        key: backgroundKey(motif, i),
        path: backgroundPath(motif, i),
      });
    }
  }
  return out;
}
