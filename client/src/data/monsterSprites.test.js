import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { MONSTER_SPRITE_LOAD, ENEMY_SPRITES } from "./monsterSprites.js";

// Pins issue #77: every monster in shared/monsters.json must have a sprite
// mapping in ENEMY_SPRITES and a matching entry in MONSTER_SPRITE_LOAD, so
// battles never fall back to colored rectangles when a sprite file exists on
// disk.

const here = dirname(fileURLToPath(import.meta.url));
const monstersPath = resolve(here, "../../../shared/monsters.json");
const monsters = JSON.parse(readFileSync(monstersPath, "utf8"));

describe("monster sprite registry", () => {
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
});
