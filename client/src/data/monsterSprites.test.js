import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  MONSTER_SPRITE_LOAD,
  ENEMY_SPRITES,
  buildMonsterSpriteRegistry,
  monsterSpriteKey,
} from "./monsterSprites.js";
import sprites from "../../../shared/monster_sprites.json";

// Pins issue #77: every monster in shared/monsters.json must have a sprite
// mapping in ENEMY_SPRITES and a matching entry in MONSTER_SPRITE_LOAD, so
// battles never fall back to colored rectangles when a sprite file exists on
// disk.

const here = dirname(fileURLToPath(import.meta.url));
const monstersPath = resolve(here, "../../../shared/monsters.json");
const monsters = JSON.parse(readFileSync(monstersPath, "utf8"));

describe("monster sprite registry", () => {
  it("validates every shared sprite association and preload asset", () => {
    expect(Object.keys(sprites.monster_keys).sort()).toEqual(
      monsters.map(({ id }) => id).sort(),
    );
    const loadedKeys = new Set(MONSTER_SPRITE_LOAD.map(({ key }) => key));
    for (const monster of monsters) {
      expect(loadedKeys.has(monsterSpriteKey(monster))).toBe(true);
    }
    for (const { path } of MONSTER_SPRITE_LOAD) {
      expect(path).toMatch(/^\/sprites\/monsters\/[a-z_]+\.png$/);
      const png = readFileSync(resolve(here, "../../public", path.slice(1)));
      expect(png.subarray(1, 4).toString()).toBe("PNG");
    }
  });

  it("keeps the original catalog's artwork, including shared textures", () => {
    expect(
      Object.fromEntries(
        monsters
          .slice(0, 17)
          .map((monster) => [monster.id, monsterSpriteKey(monster)]),
      ),
    ).toEqual({
      slime: "monster_slime",
      goblin: "monster_goblin",
      wolf: "monster_wolf",
      skeleton: "monster_skeleton",
      dark_knight: "monster_dark_knight",
      giant_rat: "monster_rat",
      bandit: "monster_bandit",
      armored_knight: "monster_troll",
      gargoyle: "monster_demon",
      wyvern: "monster_wyvern",
      iron_golem: "monster_golem",
      shadow_wraith: "monster_ghost",
      war_hydra: "monster_snake",
      elder_dragon: "monster_dragon",
      siege_commander: "monster_lich",
      dragon_lord: "monster_dragon",
      trial_guardian: "monster_dark_knight",
    });
  });

  it("supports content-only renaming and reskinning without a JS registration", () => {
    const catalog = structuredClone(monsters);
    const metadata = structuredClone(sprites);
    const bat = catalog.find(({ id }) => id === "mill_bat");
    bat.name = "Rafter Glider";
    metadata.monster_keys.mill_bat = "monster_rafter_glider";
    metadata.textures.push({
      key: "monster_rafter_glider",
      path: "/sprites/monsters/rafter_glider.png",
    });
    const updated = buildMonsterSpriteRegistry(catalog, metadata);
    expect(
      monsterSpriteKey(
        { monster_id: bat.id, name: "Old cached name" },
        updated,
      ),
    ).toBe("monster_rafter_glider");
    expect(monsterSpriteKey(bat, updated)).toBe("monster_rafter_glider");
    expect(monsterSpriteKey(bat.name, updated)).toBe("monster_rafter_glider");
    expect(
      updated.load.find(({ key }) => key === monsterSpriteKey(bat, updated)),
    ).toEqual({
      key: "monster_rafter_glider",
      path: "/sprites/monsters/rafter_glider.png",
    });
  });

  it("prefers stable IDs and retains legacy name-only responses", () => {
    expect(
      monsterSpriteKey({ monster_id: "mill_bat", name: "Slime", id: 100 }),
    ).toBe("monster_mill_bat");
    expect(monsterSpriteKey({ name: "Mill Bat", id: 100 })).toBe(
      "monster_mill_bat",
    );
    expect(monsterSpriteKey("Mill Bat")).toBe("monster_mill_bat");
    expect(monsterSpriteKey({ name: "Uncatalogued" })).toBeUndefined();
  });

  it("maps every monster name to a sprite key", () => {
    const missing = monsters
      .map((m) => m.name)
      .filter((name) => !ENEMY_SPRITES[name]);
    expect(missing).toEqual([]);
  });

  it("points every ENEMY_SPRITES key at a preloaded texture", () => {
    const loadedKeys = new Set(MONSTER_SPRITE_LOAD.map((e) => e.key));
    const dangling = Object.entries(ENEMY_SPRITES)
      .filter(([, key]) => !loadedKeys.has(key))
      .map(([name, key]) => `${name} -> ${key}`);
    expect(dangling).toEqual([]);
  });

  it("uses unique MONSTER_SPRITE_LOAD keys", () => {
    const keys = MONSTER_SPRITE_LOAD.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ships dedicated RGBA battle images for the Old Mill pack", () => {
    const ids = [
      "mill_bat",
      "briar_spider",
      "rust_beetle",
      "moss_slime",
      "millroot_warden",
    ];
    const images = ids.map((id) => {
      const monster = monsters.find((entry) => entry.id === id);
      const asset = MONSTER_SPRITE_LOAD.find(
        (entry) => entry.key === ENEMY_SPRITES[monster.name],
      );
      const png = readFileSync(
        resolve(here, "../../public", asset.path.slice(1)),
      );
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      const size = monster.is_boss ? 192 : 128;
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
      expect(png[25]).toBe(6); // RGBA PNG, not a flattened background.
      return png.toString("base64");
    });
    expect(new Set(images).size).toBe(ids.length);
  });
});
