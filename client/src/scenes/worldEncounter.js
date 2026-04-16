const TILE_ENCOUNTER_MULTIPLIERS = Object.freeze({
  0: 0.5, // grass
  1: 0.1, // path
  2: 0, // water
  3: 0, // tree
  4: 0, // building
  5: 0, // door
  6: 0, // floor
  7: 0, // rock
  8: 0, // bush
  9: 1.0, // dark grass
  10: 1.5, // forest
  11: 1.2, // hill
  12: 0.7, // sand
});

export function encounterRateMultiplierForTile(tile) {
  return TILE_ENCOUNTER_MULTIPLIERS[tile] ?? 0;
}

export function encounterChanceForStep({ tile, stepCount, transportMult = 1 }) {
  if (stepCount <= 6 || transportMult <= 0) return 0;

  const terrainMult = encounterRateMultiplierForTile(tile);
  if (terrainMult <= 0) return 0;

  const baseChance = Math.min(10 + stepCount * 3, 50);
  return baseChance * terrainMult * transportMult;
}
