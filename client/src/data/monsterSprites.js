import monsters from "../../../shared/monsters.json";
import sprites from "../../../shared/monster_sprites.json";

// Both associations and asset paths belong to shared content. Names are only
// a compatibility projection for older enemy responses and name-only callers.
export function buildMonsterSpriteRegistry(catalog, metadata) {
  return {
    load: metadata.textures,
    byId: { ...metadata.monster_keys },
    byName: Object.fromEntries(
      catalog
        .filter((monster) => metadata.monster_keys[monster.id])
        .map((monster) => [monster.name, metadata.monster_keys[monster.id]]),
    ),
  };
}

const registry = buildMonsterSpriteRegistry(monsters, sprites);
export const MONSTER_SPRITE_LOAD = registry.load;
export const ENEMY_SPRITES = registry.byName;

export function monsterSpriteKey(monster, source = registry) {
  if (typeof monster === "string") {
    return Object.hasOwn(source.byName, monster)
      ? source.byName[monster]
      : undefined;
  }
  const id = monster?.monster_id ?? monster?.id;
  if (Object.hasOwn(source.byId, id)) return source.byId[id];
  return Object.hasOwn(source.byName, monster?.name)
    ? source.byName[monster.name]
    : undefined;
}
