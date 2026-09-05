import catalog from "../../../shared/overworld_landmarks.json";

const token = (value) => String(value ?? "").toLowerCase();
const tokens = (values) => new Set((values || []).map(token));

function familyMatches(spawn, family) {
  const match = family.match || {};
  const spawnTags = tokens(spawn?.tags);
  return (
    (match.node_ids || []).some(
      (value) => token(value) === token(spawn?.node_id),
    ) ||
    (match.kinds || []).some((value) => token(value) === token(spawn?.kind)) ||
    (match.building_types || []).some(
      (value) => token(value) === token(spawn?.building_type),
    ) ||
    (match.tags || []).some((value) => spawnTags.has(token(value)))
  );
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dungeonEntries(gameState) {
  if (gameState?.dungeon_entries?.length) return gameState.dungeon_entries;
  return gameState?.dungeon_entry ? [gameState.dungeon_entry] : [];
}

export function landmarkFamilyForSpawn(spawn, source = catalog) {
  const override = source.node_overrides?.[token(spawn?.node_id)];
  if (override && source.families?.[override]) return override;
  return (
    source.classification_order.find((id) =>
      familyMatches(spawn, source.families[id]),
    ) || source.default_family
  );
}

export function adventureBadgesForSpawn(spawn, gameState, source = catalog) {
  const badgeByDungeon = new Map(
    source.adventure_badges.map((badge) => [badge.dungeon_id, badge]),
  );
  return dungeonEntries(gameState)
    .filter((entry) => entry.node_id === spawn?.node_id)
    .map((entry) => badgeByDungeon.get(entry.id))
    .filter(Boolean);
}

export function landmarkMarkerFor(spawn, gameState, source = catalog) {
  const family = landmarkFamilyForSpawn(spawn, source);
  const variants = source.families[family].variants;
  const stableSeed = `${token(spawn?.node_id)}:${spawn?.interior_seed ?? ""}`;
  return {
    family,
    variant: variants[stableHash(stableSeed) % variants.length],
    badges: adventureBadgesForSpawn(spawn, gameState, source),
  };
}

export function worldLandmarkAssets(source = catalog) {
  const markers = Object.values(source.families).flatMap(({ variants }) =>
    variants.map((asset) => ({ ...asset, ...source.marker, role: "marker" })),
  );
  const badges = source.adventure_badges.map((asset) => ({
    ...asset,
    ...source.badge,
    role: "badge",
  }));
  return [...markers, ...badges];
}

export const WORLD_LANDMARK_CATALOG = catalog;
