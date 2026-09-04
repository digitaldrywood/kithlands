import { describe, expect, it } from "vitest";
import {
  buildFinalePartyXP,
  buildVictorySummary,
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
