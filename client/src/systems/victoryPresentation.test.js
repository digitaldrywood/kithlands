import { describe, expect, it } from "vitest";
import {
  buildFinalePartyXP,
  buildPartyXP,
  buildVictorySummary,
  formatBattleDrop,
  formatSpoils,
} from "./victoryPresentation.js";

describe("victory presentation summary", () => {
  it("extracts earned rewards, unique drops, and quest notices", () => {
    const summary = buildVictorySummary([
      "Found: Moon Shard!",
      "Found: Moon Shard!",
      "Quest complete: Quiet the Mire",
      "Victory! +48 XP, +21 gold",
    ]);

    expect(summary).toEqual({
      xpEarned: 48,
      goldEarned: 21,
      found: ["Moon Shard"],
      quests: ["Quest complete: Quiet the Mire"],
    });
    expect(formatSpoils(summary)).toBe("Moon Shard");
  });

  it("returns a useful empty-drop label", () => {
    expect(formatSpoils(buildVictorySummary([]))).toBe("No item drops");
  });

  it("uses structured receipts for exact quantities and distinct rolls", () => {
    const rewards = {
      drops: [
        { kind: "consumable", name: "Potion", quantity: 2 },
        { kind: "gem", name: "Ember Shard", quantity: 3 },
        { kind: "equipment", name: "Tempered Iron Sword", quantity: 1 },
        { kind: "equipment", name: "Tempered Iron Sword", quantity: 1 },
      ],
    };
    const summary = buildVictorySummary(
      ["Found: stale log name!", "Victory! +48 XP, +21 gold"],
      rewards,
    );

    expect(summary.found).toEqual([
      "Potion ×2",
      "Ember Shard ×3",
      "Tempered Iron Sword",
      "Tempered Iron Sword",
    ]);
    expect(formatSpoils(summary)).toBe(
      "Potion ×2  ·  Ember Shard ×3  ·  Tempered Iron Sword  ·  Tempered Iron Sword",
    );
    expect(formatBattleDrop({ item_id: "future_relic" })).toBe("future_relic");
  });
});

it("includes the final quest reward in the battle receipt", () => {
  const summary = buildVictorySummary([
    "Victory! +900 XP, +220 gold",
    "Quest complete: Silence the Bellbound Regent",
    "Quest reward: +500 XP, +300 gold",
  ]);
  expect(summary.xpEarned).toBe(1400);
  expect(summary.goldEarned).toBe(520);
  expect(summary.quests).toHaveLength(1);
});

it("uses actual finale progression for each survivor and excludes KO members", () => {
  expect(
    buildFinalePartyXP({
      final_encounter: { defeated: true },
      party: [
        { xp: 25, xp_next: 150 },
        { xp: 0, xp_next: 100 },
      ],
      xp_before: [80, 0],
      xp_thresholds: [[100, 150], [100]],
      died_this_fight: [false, true],
    }),
  ).toEqual([45, 0]);
  expect(buildFinalePartyXP({ party: [] })).toBeNull();
});

it("shows each ally's split XP instead of repeating the reward pool", () => {
  expect(
    buildPartyXP({
      party: Array.from({ length: 4 }, () => ({ xp: 6, xp_next: 70 })),
      xp_before: [0, 0, 0, 0],
      xp_thresholds: [[70], [70], [70], [70]],
    }),
  ).toEqual([6, 6, 6, 6]);
});
it("counts XP across a level threshold and preserves a defeated member's exclusion", () => {
  expect(
    buildPartyXP({
      party: [
        { xp: 8, xp_next: 120 },
        { xp: 52, xp_next: 70 },
      ],
      xp_before: [65, 52],
      xp_thresholds: [[70, 120], [70]],
      died_this_fight: [false, true],
    }),
  ).toEqual([13, 0]);
});
it("does not invent an individual reward when an older snapshot lacks progression metadata", () => {
  expect(buildPartyXP({ party: [{ xp: 40, xp_next: 70 }] })).toEqual([null]);
  expect(
    buildFinalePartyXP({
      final_encounter: { defeated: true },
      party: [{ xp: 40, xp_next: 70 }],
    }),
  ).toBeNull();
});
it("retains actual XP changes at the level cap", () => {
  expect(
    buildPartyXP({
      party: [{ xp: 96, xp_next: 0 }],
      xp_before: [90],
      xp_thresholds: [[]],
    }),
  ).toEqual([6]);
});
