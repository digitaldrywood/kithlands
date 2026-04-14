// Pure layout helpers for town interiors. Keep these Phaser-free so unit tests
// can verify room sizing and sprite selection without booting a scene.

export function roomDimensions(buildingType, seed, rngFactory) {
  switch (buildingType) {
    case "inn":
      return { w: 14, h: 10 };
    case "shop":
      return { w: 10, h: 8 };
    case "temple":
      return { w: 12, h: 10 };
    default: {
      const rng = (rngFactory || defaultRngFactory)(seed);
      const w = 8 + Math.floor(rng() * 5);
      const h = 6 + Math.floor(rng() * 5);
      return { w, h };
    }
  }
}

function defaultRngFactory() {
  throw new Error("rngFactory required for randomized building dimensions");
}

export function furnitureDensity(buildingType) {
  switch (buildingType) {
    case "inn":
      return 0.1;
    case "temple":
      return 0.16;
    default:
      return 0.2;
  }
}

export function minimumNpcSpacing(buildingType) {
  switch (buildingType) {
    case "inn":
      return 3;
    case "temple":
      return 2;
    default:
      return 2;
  }
}

export function extraNpcSpritesForTags(tags) {
  const tagSet = new Set(tags || []);
  if (tagSet.has("rest")) {
    return ["npc_guard", "npc_blacksmith", "npc_elder"];
  }
  if (tagSet.has("shop") || tagSet.has("commerce")) {
    return ["npc_guard", "npc_elder"];
  }
  if (tagSet.has("temple") || tagSet.has("revive")) {
    return ["npc_guard", "npc_elder", "npc_blacksmith"];
  }
  return ["npc_guard", "npc_blacksmith", "npc_elder"];
}
