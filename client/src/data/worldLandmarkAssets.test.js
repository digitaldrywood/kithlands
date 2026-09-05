import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  WORLD_LANDMARK_CATALOG,
  worldLandmarkAssets,
} from "./worldLandmarks.js";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");

function pngHeader(path) {
  const png = readFileSync(path);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25],
  };
}

describe("overworld landmark asset contract", () => {
  it("ships two variants for each bounded family", () => {
    expect(WORLD_LANDMARK_CATALOG.classification_order).toEqual([
      "natural_grove",
      "ruined_dungeon",
      "temple",
      "isolated_home",
      "settlement_home",
    ]);
    for (const family of Object.values(WORLD_LANDMARK_CATALOG.families)) {
      expect(family.variants).toHaveLength(2);
      expect(family.match).toBeTruthy();
    }
  });

  it("loads unique, transparent PNGs at their manifest dimensions", () => {
    const assets = worldLandmarkAssets();
    expect(assets).toHaveLength(12);
    expect(new Set(assets.map(({ key }) => key)).size).toBe(assets.length);
    expect(new Set(assets.map(({ path }) => path)).size).toBe(assets.length);
    for (const asset of assets) {
      expect(asset.path).toMatch(/^\/sprites\/world\/landmarks\/[a-z-]+\.png$/);
      expect(
        pngHeader(resolve(repository, "client/public", asset.path.slice(1))),
      ).toEqual({ width: asset.width, height: asset.height, colorType: 6 });
    }
  });

  it("keeps source and contact-sheet dimensions explicit", () => {
    expect(
      pngHeader(
        resolve(
          repository,
          "art-source/environments/overworld-landmarks/overworld-landmarks-source.png",
        ),
      ),
    ).toEqual({ width: 512, height: 384, colorType: 6 });
    expect(
      pngHeader(
        resolve(repository, "docs/art/overworld-landmarks/contact-sheet.png"),
      ),
    ).toMatchObject({ width: 544, height: 384 });
  });
});
