import { describe, expect, it } from "vitest";
import { buildVictorySummary, formatSpoils } from "./victoryPresentation.js";

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
