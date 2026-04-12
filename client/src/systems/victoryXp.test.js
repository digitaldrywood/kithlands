import { describe, expect, it } from "vitest";

import { buildVictoryXPSegments } from "./victoryXp.js";

describe("buildVictoryXPSegments", () => {
  it("starts from pre-fight XP when no level-up occurred", () => {
    expect(
      buildVictoryXPSegments({
        prevXP: 18,
        currentXP: 42,
        xpNext: 70,
        xpThresholds: [70],
      }),
    ).toEqual([{ start: 18, end: 42, max: 70 }]);
  });

  it("fills to the threshold, then restarts from zero after a level-up", () => {
    expect(
      buildVictoryXPSegments({
        prevXP: 55,
        currentXP: 12,
        xpNext: 151,
        xpThresholds: [70, 151],
      }),
    ).toEqual([
      { start: 55, end: 70, max: 70 },
      { start: 0, end: 12, max: 151 },
    ]);
  });

  it("emits intermediate full-bar segments for multiple level-ups", () => {
    expect(
      buildVictoryXPSegments({
        prevXP: 60,
        currentXP: 20,
        xpNext: 487,
        xpThresholds: [70, 151, 487],
      }),
    ).toEqual([
      { start: 60, end: 70, max: 70 },
      { start: 0, end: 151, max: 151 },
      { start: 0, end: 20, max: 487 },
    ]);
  });

  it("returns an empty animation when no usable threshold exists", () => {
    expect(
      buildVictoryXPSegments({
        prevXP: 10,
        currentXP: 20,
        xpNext: 0,
        xpThresholds: [],
      }),
    ).toEqual([]);
  });
});
