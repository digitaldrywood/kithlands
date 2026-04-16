export function hasAnyBuildingTag(tags, expectedTags) {
  const tagSet = new Set(tags || []);
  return expectedTags.some((tag) => tagSet.has(tag));
}

export function isRestBuilding(tags) {
  return hasAnyBuildingTag(tags, ["rest", "heal", "house", "safehouse"]);
}

export function buildingTypeFromTags(tags) {
  if (isRestBuilding(tags)) {
    const tagSet = new Set(tags || []);
    return tagSet.has("rest") || tagSet.has("heal") ? "inn" : "house";
  }
  if (hasAnyBuildingTag(tags, ["shop", "commerce"])) return "shop";
  if (hasAnyBuildingTag(tags, ["temple", "revive"])) return "temple";
  return "house";
}
