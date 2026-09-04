import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import inn from "../../../shared/interiors/inn_gilded_steps_2f.json";
import { buildInteriorFromTemplate, TILE_WALKABLE } from "./town_layout.js";

function reachable(floor, start) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: x + dx, y: y + dy };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || !TILE_WALKABLE[floor.tiles[next.y]?.[next.x]])
        continue;
      if (floor.npcAnchors.some((npc) => npc.x === next.x && npc.y === next.y))
        continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return [...seen].map((key) => key.split(",").map(Number));
}

function pngSize(asset) {
  const png = readFileSync(new URL(`../../public${asset}`, import.meta.url));
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe("Riverlight Inn authored content", () => {
  for (let index = 0; index < inn.floors.length; index++) {
    it(`keeps floor ${index} stairs, guests and chest reachable`, () => {
      const floor = buildInteriorFromTemplate(inn, index);
      const start = index === 0 ? { x: 8, y: 10 } : { x: 7, y: 6 };
      const reached = reachable(floor, start);
      for (const stair of floor.stairsByPosition.values())
        expect(reached).toContainEqual([stair.x, stair.y]);
      for (const [targets, distance] of [
        [floor.npcAnchors, 2],
        [floor.chestAnchors, 1],
      ]) {
        for (const target of targets)
          expect(
            reached.some(
              ([x, y]) =>
                Math.abs(x - target.x) + Math.abs(y - target.y) <= distance,
            ),
          ).toBe(true);
      }
      expect(pngSize(floor.presentation.backgroundAsset)).toEqual([
        floor.roomW * 32,
        floor.roomH * 32,
      ]);
    });
  }
  it("ships transparent chest art without changing the guest chest identity", () => {
    const floor = inn.floors[1];
    expect(floor.chest_anchors).toEqual([
      { id: "gilded_guest_chest", x: 14, y: 2 },
    ]);
    for (const asset of [
      floor.presentation.chest_closed_asset,
      floor.presentation.chest_open_asset,
    ]) {
      expect(pngSize(asset)).toEqual([64, 64]);
      const png = readFileSync(
        new URL(`../../public${asset}`, import.meta.url),
      );
      expect(png[25]).toBe(6); // RGBA, rather than a baked checkerboard.
    }
  });
});
