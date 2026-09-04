import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bestiaryEntries,
  affinityLabel,
  dropItemName,
  monsterArt,
} from "./bestiary.js";

const catalog = JSON.parse(
  readFileSync(
    new URL("../../../shared/monsters.json", import.meta.url),
    "utf8",
  ),
);

describe("bestiary catalog projection", () => {
  it("includes the full current catalog without revealing unknown names or stats", () => {
    const entries = bestiaryEntries(catalog);
    expect(entries).toHaveLength(catalog.length);
    expect(
      entries.every(
        (entry) =>
          !entry.known &&
          entry.monster === null &&
          entry.name === "Unknown creature",
      ),
    ).toBe(true);
  });

  it("uses authoritative base values and existing art for every discovered monster", () => {
    const discovered = Object.fromEntries(catalog.map(({ id }) => [id, true]));
    const entries = bestiaryEntries(catalog, discovered);
    entries.forEach((entry, index) => {
      expect(entry.monster).toEqual(catalog[index]);
      expect(entry.name).toBe(catalog[index].name);
      expect(monsterArt(entry.name)).toMatch(/^\/sprites\/monsters\/.+\.png$/);
      expect(monsterArt(entry.monster)).toBe(monsterArt(entry.name));
      expect(entry.monster.field_note).toBeTruthy();
      expect(entry.monster.habitats.length).toBeGreaterThan(0);
      expect(entry.monster.tactics).toBeTruthy();
    });
  });

  it("keeps art when the server renames a monster but retains its stable ID", () => {
    const bat = catalog.find(({ id }) => id === "mill_bat");
    expect(monsterArt({ ...bat, name: "Rafter Glider" })).toBe(
      "/sprites/monsters/mill_bat.png",
    );
    expect(monsterArt(bat.name)).toBe("/sprites/monsters/mill_bat.png");
  });

  it("picks up additions and changed base stats without client registration", () => {
    const future = {
      ...catalog[0],
      id: "future_creature",
      name: "Future Creature",
      hp: 987,
      xp_reward: 654,
      resistances: ["ice"],
    };
    const entries = bestiaryEntries([...catalog, future], {
      future_creature: true,
    });
    expect(entries).toHaveLength(catalog.length + 1);
    expect(entries.at(-1)).toMatchObject({
      known: true,
      name: "Future Creature",
      monster: future,
    });
    expect(entries.slice(0, -1).every((entry) => entry.monster === null)).toBe(
      true,
    );
    expect(monsterArt(future.name)).toBeUndefined();
  });

  it("does not treat false discovery records or missing legacy records as encounters", () => {
    expect(bestiaryEntries(catalog, { [catalog[0].id]: false })[0].known).toBe(
      false,
    );
    expect(bestiaryEntries(catalog, null).every((entry) => !entry.known)).toBe(
      true,
    );
    expect(bestiaryEntries([], {})).toEqual([]);
  });

  it("distinguishes no affinities from actual elemental affinities", () => {
    expect(affinityLabel([])).toBe("None");
    expect(affinityLabel(["fire", "holy"])).toBe("Fire, Holy");
    expect(affinityLabel(["dark"])).toBe("Dark");
  });

  it("renders shared drop item names with a readable fallback", () => {
    expect(dropItemName("potion")).toBe("Potion");
    expect(dropItemName("phoenix_down")).toBe("Phoenix Down");
    expect(dropItemName("future_relic")).toBe("Future Relic");
  });
});
