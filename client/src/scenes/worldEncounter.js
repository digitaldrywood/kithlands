import { TILE_ENCOUNTER_MULTIPLIERS } from "./tileConstants.js";

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
