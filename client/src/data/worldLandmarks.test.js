import { describe, expect, it } from "vitest";

import {
  adventureBadgesForSpawn,
  landmarkFamilyForSpawn,
  landmarkMarkerFor,
} from "./worldLandmarks.js";

describe("overworld landmark classification", () => {
  it.each([
    [
      "live central override",
      { node_id: "central", kind: "natural" },
      "settlement_home",
    ],
    [
      "business settlement",
      { node_id: "shop", kind: "business", building_type: "shop" },
      "settlement_home",
    ],
    [
      "temple metadata",
      { node_id: "chapel", kind: "business", building_type: "temple" },
      "temple",
    ],
    [
      "dungeon tag",
      { node_id: "old-ruin", kind: "landmark", tags: ["dungeon"] },
      "ruined_dungeon",
    ],
    [
      "person home",
      { node_id: "person_0", kind: "person", building_type: "house" },
      "isolated_home",
    ],
    [
      "natural grove",
      { node_id: "wild", kind: "natural", tags: ["wilderness"] },
      "natural_grove",
    ],
  ])("classifies %s from stable fields", (_name, spawn, family) => {
    expect(landmarkFamilyForSpawn(spawn)).toBe(family);
  });

  it("never treats a display name as classification metadata", () => {
    const spawn = {
      node_id: "person_7",
      name: "Forgotten Shrine Temple Cave Old Mill",
      kind: "person",
      building_type: "house",
    };
    expect(landmarkFamilyForSpawn(spawn)).toBe("isolated_home");
    expect(landmarkFamilyForSpawn({ ...spawn, name: "Renamed" })).toBe(
      "isolated_home",
    );
  });

  it("keeps landmark identity across regenerated interiors, names and coordinates", () => {
    const spawn = {
      node_id: "place_2",
      name: "First Name",
      kind: "place",
      interior_seed: 8842,
      x: 12,
      y: 20,
    };
    const selected = landmarkMarkerFor(spawn).variant.id;
    expect(
      landmarkMarkerFor({
        ...spawn,
        name: "New Name",
        x: 90,
        y: 4,
        interior_seed: 21909,
      }).variant.id,
    ).toBe(selected);
    const seen = new Set(
      Array.from(
        { length: 12 },
        (_, index) =>
          landmarkMarkerFor({ ...spawn, node_id: `place_${index}` }).variant.id,
      ),
    );
    expect(seen.size).toBe(2);
  });
});

describe("overworld adventure badges", () => {
  const oldMillSpawn = { node_id: "central", kind: "landmark" };
  const shrineSpawn = { node_id: "far_grove", kind: "natural" };

  it("uses plural server dungeon associations for both adventures", () => {
    const gameState = {
      dungeon_entries: [
        { id: "old-mill", node_id: "central", title: "Renamed Mill" },
        {
          id: "forgotten-shrine",
          node_id: "far_grove",
          title: "Renamed Shrine",
        },
      ],
    };
    expect(adventureBadgesForSpawn(oldMillSpawn, gameState)).toMatchObject([
      { id: "badge-old-mill" },
    ]);
    expect(adventureBadgesForSpawn(shrineSpawn, gameState)).toMatchObject([
      { id: "badge-forgotten-shrine" },
    ]);
  });

  it("supports the accepted singular entry without title parsing", () => {
    const gameState = {
      dungeon_entry: { id: "old-mill", node_id: "central", title: "Elsewhere" },
    };
    expect(adventureBadgesForSpawn(oldMillSpawn, gameState)).toHaveLength(1);
    expect(
      adventureBadgesForSpawn(oldMillSpawn, {
        dungeon_entry: { id: "unknown", node_id: "central", title: "Old Mill" },
      }),
    ).toEqual([]);
  });
});
