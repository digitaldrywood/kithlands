import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  buildInteriorFromTemplate,
  TILE_WALKABLE,
  T_DOOR,
} from "./town_layout.js";

const directory = new URL("../../../shared/interiors/", import.meta.url);
for (const filename of readdirSync(directory).filter((name) =>
  name.endsWith(".json"),
)) {
  const template = JSON.parse(
    readFileSync(new URL(filename, directory), "utf8"),
  );
  test(`${template.id} has a clear entrance and player spawn`, () => {
    const { tiles, entrance, roomH, npcAnchors } =
      buildInteriorFromTemplate(template);
    const spawn = {
      x: entrance.x,
      y: entrance.y >= roomH - 1 ? entrance.y - 1 : entrance.y,
    };
    expect(tiles[entrance.y][entrance.x]).toBe(T_DOOR);
    expect(TILE_WALKABLE[tiles[spawn.y][spawn.x]]).toBe(true);
    expect(
      npcAnchors.some((npc) => npc.x === spawn.x && npc.y === spawn.y),
    ).toBe(false);
  });
}
