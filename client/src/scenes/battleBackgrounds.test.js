import { describe, expect, it, vi } from "vitest";

import {
  battleBackdropFrame,
  BG_VARIANTS,
  INTERIOR_VARIANT_BY_BUILDING,
  backgroundKey,
  enumerateBackgrounds,
  pickBackgroundKey,
} from "./battleBackgrounds.js";

describe("battleBackgrounds", () => {
  it("crops the painted floor without exposing the baked footer and caches the frame", () => {
    let added = false;
    const texture = {
      has: () => added,
      getSourceImage: () => ({ width: 800, height: 600 }),
      add: vi.fn(() => {
        added = true;
      }),
    };
    expect(battleBackdropFrame(texture)).toBe("battle-ground");
    battleBackdropFrame(texture);
    expect(texture.add).toHaveBeenCalledExactlyOnceWith(
      "battle-ground",
      0,
      0,
      240,
      800,
      234,
    );
  });

  it("enumerates one entry per manifest variant", () => {
    const entries = enumerateBackgrounds();
    const expected = Object.values(BG_VARIANTS).reduce((a, n) => a + n, 0);
    expect(entries).toHaveLength(expected);
    for (const entry of entries) {
      expect(entry.key).toBe(backgroundKey(entry.motif, entry.variant));
      expect(entry.path).toBe(
        `backgrounds/${entry.motif}/${entry.motif}_${entry.variant}.png`,
      );
    }
  });

  it("returns null for an unknown motif", () => {
    expect(pickBackgroundKey("nope", 1)).toBeNull();
  });

  it("maps interior motif via buildingType to the painter-ordered variant", () => {
    for (const [bt, idx] of Object.entries(INTERIOR_VARIANT_BY_BUILDING)) {
      expect(pickBackgroundKey("interior", "any-seed", bt)).toBe(
        `bg_interior_${idx}`,
      );
    }
    // Missing buildingType still yields a deterministic fallback.
    expect(pickBackgroundKey("interior", "seed")).toBe("bg_interior_1");
  });

  it("produces a stable variant for a given seed", () => {
    const a = pickBackgroundKey("forest", "encounter-42");
    const b = pickBackgroundKey("forest", "encounter-42");
    expect(a).toBe(b);
    expect(a).toMatch(/^bg_forest_\d+$/);
  });

  it("uses a numeric seed directly", () => {
    const count = BG_VARIANTS.plains;
    for (let i = 0; i < count * 3; i += 1) {
      const key = pickBackgroundKey("plains", i);
      expect(key).toMatch(/^bg_plains_[1-9]\d*$/);
    }
  });
});
